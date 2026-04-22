// ─────────────────────────────────────────────────────────────────────────────
// POST /api/kyc/bank — submit bank account for penny-drop + persist
// Ref plan Task 27 / spec §4.4 ELIGIBILITY CHECK + §5.1 creator_bank_accounts
// ─────────────────────────────────────────────────────────────────────────────
//
// Flow:
//   1. Auth (401).
//   2. Zod validate: account number (9-18 digits), IFSC (4 letters + 0 +
//      6 alphanum), holder name. Reject BEFORE Cashfree call.
//   3. Creator gate (403 if none).
//   4. Encrypt account_number (AES-256-GCM → bytea). Never persist plain.
//   5. pennyDrop(full_account, ifsc, expected_name). 502 on throw. 422 on
//      returned `success=false`.
//   6. On success → createBeneficiary(user_id as stable id, account, ifsc).
//      The Cashfree beneficiary id is stored on creator_kyc.cf_beneficiary_id
//      for later transfer reuse. If creation fails we still record the bank
//      row but mark it un-active so withdrawals block — surface 502.
//   7. Deactivate any previously-active bank row for this creator (partial
//      unique index `uniq_active_bank_per_creator` requires one-active-max).
//   8. Insert the new row with is_active=true + penny_drop_verified_at +
//      matched name + score.
//   9. 3/3 rollup — PAN verified AND aadhaar_verified_at AND we now have an
//      active bank → flip creators.kyc_status → 'verified'.
//
// Never log the full account number. The ciphertext is safe to store.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pennyDrop } from "@/lib/payments/cashfree/kyc";
import { createBeneficiary } from "@/lib/payments/cashfree/payouts";
import { encryptKycValue } from "@/lib/kyc/crypto";
import { SubmitBankSchema } from "@/domains/kyc/types";

type CountQueryResult = {
  count: number | null;
  error: { message: string } | null;
};
interface BankAdmin {
  from(table: string): {
    select(cols?: string, opts?: { count?: string; head?: boolean }): {
      eq(col: string, val: string): {
        maybeSingle?(): Promise<{
          data: Record<string, unknown> | null;
          error: { message: string } | null;
        }>;
      } & Promise<CountQueryResult>;
    };
    insert(row: Record<string, unknown>): {
      select(): {
        maybeSingle(): Promise<{
          data: Record<string, unknown> | null;
          error: { message: string } | null;
        }>;
      };
    };
    upsert(
      row: Record<string, unknown>,
      opts?: { onConflict?: string },
    ): Promise<{ error: { message: string } | null }>;
    update(patch: Record<string, unknown>): {
      eq(col: string, val: string): Promise<{
        error: { message: string } | null;
      }>;
    };
  };
}

async function has3of3Verified(
  admin: BankAdmin,
  creatorId: string,
  panVerified: boolean,
  aadhaarVerifiedAt: string | null,
  bankVerifiedNow: boolean,
): Promise<boolean> {
  if (!panVerified) return false;
  if (!aadhaarVerifiedAt) return false;
  if (!bankVerifiedNow) return false;
  return true;
}

export async function POST(req: NextRequest) {
  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ── 2. Parse body + Zod ────────────────────────────────────────────────────
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = SubmitBankSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const { account_number, ifsc, account_holder_name, nickname } = parsed.data;

  const admin = createAdminClient() as unknown as BankAdmin;

  // ── 3. Creator gate ────────────────────────────────────────────────────────
  const { data: creatorRow, error: creatorError } = await (admin
    .from("creators")
    .select("id, user_id, kyc_status")
    .eq("user_id", user.id)
    .maybeSingle?.() ?? Promise.resolve({ data: null, error: null }));
  if (creatorError) {
    console.error("[kyc/bank] creator lookup failed", creatorError);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  if (!creatorRow) {
    return NextResponse.json(
      { error: "forbidden", reason: "only_creators_can_submit_kyc" },
      { status: 403 },
    );
  }
  const creatorId = (creatorRow as { id: string }).id;

  // ── 4. Existing KYC snapshot (for rollup + beneficiary reuse) ──────────────
  const { data: existingKyc } = await (admin
    .from("creator_kyc")
    .select(
      "creator_id, pan_verification_status, aadhaar_verified_at, cf_beneficiary_id, status",
    )
    .eq("creator_id", creatorId)
    .maybeSingle?.() ?? Promise.resolve({ data: null, error: null }));

  const panVerified =
    (existingKyc as { pan_verification_status?: string | null } | null)
      ?.pan_verification_status === "verified";
  const aadhaarVerifiedAt =
    (existingKyc as { aadhaar_verified_at?: string | null } | null)
      ?.aadhaar_verified_at ?? null;
  const existingBeneficiaryId =
    (existingKyc as { cf_beneficiary_id?: string | null } | null)
      ?.cf_beneficiary_id ?? null;

  // ── 5. Encrypt + call Cashfree penny-drop ──────────────────────────────────
  const accountEncrypted = encryptKycValue(account_number);

  let pennySuccess = false;
  let actualName: string | undefined;
  let matchScore: number | undefined;
  let bankName: string | undefined;
  try {
    const result = await pennyDrop({
      verificationId: `bank_${creatorId}_${randomUUID()}`,
      accountNumber: account_number,
      ifsc,
      expectedName: account_holder_name,
    });
    pennySuccess = result.success;
    actualName = result.actualName;
    matchScore = result.matchScore;
    bankName =
      (result.raw as { bank_name?: string } | undefined)?.bank_name ??
      undefined;
  } catch (err) {
    const message = err instanceof Error ? err.message : "cashfree_error";
    console.error("[kyc/bank] pennyDrop failed", message);
    return NextResponse.json(
      { error: "cashfree_unavailable", message },
      { status: 502 },
    );
  }

  if (!pennySuccess) {
    return NextResponse.json(
      {
        bank_verified: false,
        name_match_score: matchScore ?? null,
        actual_name_at_bank: actualName ?? null,
      },
      { status: 422 },
    );
  }

  // ── 6. Register / reuse Cashfree beneficiary ───────────────────────────────
  // Use user_id as the stable caller-provided id — idempotent per creator.
  let beneficiaryId: string | null = existingBeneficiaryId;
  if (!beneficiaryId) {
    try {
      const result = await createBeneficiary({
        beneficiaryId: user.id,
        name: account_holder_name,
        bankAccountNumber: account_number,
        bankIfsc: ifsc,
        email: user.email ?? undefined,
      });
      beneficiaryId = result.beneficiary_id ?? user.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : "cashfree_error";
      console.error("[kyc/bank] createBeneficiary failed", message);
      return NextResponse.json(
        { error: "cashfree_unavailable", message },
        { status: 502 },
      );
    }
  }

  const now = new Date().toISOString();

  // ── 7. Deactivate any previously-active bank row ───────────────────────────
  // Partial UNIQUE index demands at most one active row per creator.
  const currentActive = (await admin
    .from("creator_bank_accounts")
    .select("id", { count: "exact", head: true })
    .eq("creator_id", creatorId)) as unknown as CountQueryResult;
  if ((currentActive.count ?? 0) > 0) {
    await admin
      .from("creator_bank_accounts")
      .update({ is_active: false })
      .eq("creator_id", creatorId);
  }

  // ── 8. Insert new bank row ─────────────────────────────────────────────────
  const insertRow: Record<string, unknown> = {
    creator_id: creatorId,
    account_number_encrypted: accountEncrypted,
    account_number_last4: account_number.slice(-4),
    ifsc,
    bank_name: bankName ?? "",
    account_holder_name,
    penny_drop_verified_at: now,
    penny_drop_verified_name: actualName ?? null,
    name_match_score: matchScore ?? null,
    is_active: true,
    cf_beneficiary_id: beneficiaryId,
  };
  if (nickname) {
    insertRow.nickname = nickname;
  }

  const { data: insertedBank, error: insertError } = await admin
    .from("creator_bank_accounts")
    .insert(insertRow)
    .select()
    .maybeSingle();
  if (insertError) {
    console.error("[kyc/bank] bank insert failed", insertError);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  // ── 9. Persist beneficiary id onto creator_kyc (for future withdrawals) ────
  await admin
    .from("creator_kyc")
    .upsert(
      {
        creator_id: creatorId,
        cf_beneficiary_id: beneficiaryId,
      },
      { onConflict: "creator_id" },
    );

  // ── 10. 3/3 rollup ─────────────────────────────────────────────────────────
  const allThree = await has3of3Verified(
    admin,
    creatorId,
    panVerified,
    aadhaarVerifiedAt,
    true,
  );
  if (allThree) {
    await admin
      .from("creators")
      .update({ kyc_status: "verified", kyc_verified_at: now })
      .eq("id", creatorId);
    await admin
      .from("creator_kyc")
      .update({ status: "verified" })
      .eq("creator_id", creatorId);
  } else {
    const currentStatus =
      (creatorRow as { kyc_status?: string | null }).kyc_status ?? "not_started";
    if (currentStatus === "not_started") {
      await admin
        .from("creators")
        .update({ kyc_status: "in_progress" })
        .eq("id", creatorId);
    }
  }

  // ── 11. Response ───────────────────────────────────────────────────────────
  const payload = {
    bank_verified: true,
    bank_account_id: (insertedBank as { id?: string } | null)?.id ?? null,
    last4: account_number.slice(-4),
    bank_name: bankName ?? null,
    name_match_score: matchScore ?? null,
  };
  return NextResponse.json(payload, { status: 200 });
}
