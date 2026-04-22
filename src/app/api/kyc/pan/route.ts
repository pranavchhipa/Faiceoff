// ─────────────────────────────────────────────────────────────────────────────
// POST /api/kyc/pan — submit PAN for Cashfree verification + persist
// Ref plan Task 27 / spec §4.4 "ELIGIBILITY CHECK" + §5.1 creator_kyc
// ─────────────────────────────────────────────────────────────────────────────
//
// Flow:
//   1. Auth gate (signed in).
//   2. Resolve caller's creator row (403 if none).
//   3. Zod-validate body: PAN format, name, optional GSTIN.
//      Rejects bad PAN BEFORE Cashfree call — we don't burn KYC credits on
//      obviously invalid input.
//   4. Encrypt PAN at the application boundary (AES-256-GCM, key = env).
//      The bytea column holds the packed [nonce|tag|ciphertext] buffer.
//   5. Upsert creator_kyc row (persists whether or not Cashfree verifies — so
//      UI can show the exact failure reason).
//   6. Call Cashfree verifyPan. On HTTP / network error → 502.
//   7. Persist verification result: pan_verified_at, pan_verification_status.
//   8. Check 3/3 rollup: if this flip made all three (PAN + Aadhaar + bank)
//      verified, transition creators.kyc_status → 'verified'.
//   9. Return { pan_verified, name_match } — 200 if Cashfree says valid,
//      422 if valid=false (so the UI can show a block with the correct reason).
//
// Never logs the raw PAN anywhere — even the debug console. The ciphertext
// is safe to store; the plaintext is transient in the fetch() payload only.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPan } from "@/lib/payments/cashfree/kyc";
import { encryptKycValue } from "@/lib/kyc/crypto";
import { SubmitPanSchema } from "@/domains/kyc/types";

// Narrow admin-client handle — supabase types don't include creator_kyc yet.
type CountQueryResult = {
  count: number | null;
  error: { message: string } | null;
};
interface PanAdmin {
  from(table: string): {
    select(cols?: string, opts?: { count?: string; head?: boolean }): {
      eq(col: string, val: string): {
        maybeSingle?(): Promise<{
          data: Record<string, unknown> | null;
          error: { message: string } | null;
        }>;
      } & Promise<CountQueryResult>;
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
  admin: PanAdmin,
  creatorId: string,
  panVerifiedNow: boolean,
  aadhaarVerifiedAt: string | null,
): Promise<boolean> {
  if (!panVerifiedNow) return false;
  if (!aadhaarVerifiedAt) return false;
  // Confirm at least one active bank account exists.
  const res = (await admin
    .from("creator_bank_accounts")
    .select("id", { count: "exact", head: true })
    .eq("creator_id", creatorId)) as unknown as CountQueryResult;
  return (res.count ?? 0) > 0;
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
  const parsed = SubmitPanSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const {
    pan_number,
    name_as_per_pan,
    is_gstin_registered,
    gstin,
  } = parsed.data;

  const admin = createAdminClient() as unknown as PanAdmin;

  // ── 3. Creator gate ────────────────────────────────────────────────────────
  const { data: creatorRow, error: creatorError } = await (admin
    .from("creators")
    .select("id, kyc_status")
    .eq("user_id", user.id)
    .maybeSingle?.() ?? Promise.resolve({ data: null, error: null }));
  if (creatorError) {
    console.error("[kyc/pan] creator lookup failed", creatorError);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  if (!creatorRow) {
    return NextResponse.json(
      { error: "forbidden", reason: "only_creators_can_submit_kyc" },
      { status: 403 },
    );
  }
  const creatorId = (creatorRow as { id: string }).id;

  // ── 4. Existing KYC snapshot (for rollup decision) ─────────────────────────
  const { data: existingKyc } = await (admin
    .from("creator_kyc")
    .select(
      "creator_id, pan_verification_status, aadhaar_verified_at, status",
    )
    .eq("creator_id", creatorId)
    .maybeSingle?.() ?? Promise.resolve({ data: null, error: null }));

  const aadhaarVerifiedAt =
    (existingKyc as { aadhaar_verified_at?: string | null } | null)
      ?.aadhaar_verified_at ?? null;

  // ── 5. Encrypt PAN in-memory ───────────────────────────────────────────────
  // The plaintext leaves this function body only in the Cashfree fetch call.
  const panEncrypted = encryptKycValue(pan_number);

  // ── 6. Call Cashfree ───────────────────────────────────────────────────────
  let verified = false;
  let nameMatch = false;
  let panName: string | undefined;
  try {
    const result = await verifyPan({
      verificationId: `pan_${creatorId}_${randomUUID()}`,
      pan: pan_number,
      name: name_as_per_pan,
    });
    verified = result.verified;
    nameMatch = result.nameMatch;
    panName = result.panName;
  } catch (err) {
    const message = err instanceof Error ? err.message : "cashfree_error";
    console.error("[kyc/pan] Cashfree verify failed", message);
    return NextResponse.json(
      { error: "cashfree_unavailable", message },
      { status: 502 },
    );
  }

  // ── 7. Persist creator_kyc ─────────────────────────────────────────────────
  const now = new Date().toISOString();
  const panStatus: "verified" | "failed" | "mismatch" = verified
    ? "verified"
    : nameMatch === false && panName
      ? "mismatch"
      : "failed";

  const kycRow: Record<string, unknown> = {
    creator_id: creatorId,
    pan_number_encrypted: panEncrypted,
    pan_name: name_as_per_pan,
    pan_verification_status: panStatus,
    is_gstin_registered,
    gstin: is_gstin_registered ? gstin ?? null : null,
  };
  if (verified) kycRow.pan_verified_at = now;
  // Advance the internal machine if the row is new.
  if (!existingKyc) {
    kycRow.status = verified ? "aadhaar_pending" : "pan_pending";
  }

  const { error: upsertError } = await admin
    .from("creator_kyc")
    .upsert(kycRow, { onConflict: "creator_id" });
  if (upsertError) {
    console.error("[kyc/pan] creator_kyc upsert failed", upsertError);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  // ── 8. 3/3 rollup ──────────────────────────────────────────────────────────
  if (verified) {
    const allThree = await has3of3Verified(
      admin,
      creatorId,
      true,
      aadhaarVerifiedAt,
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
      // Keep creators.kyc_status on 'in_progress' as we advance steps.
      const currentStatus =
        (creatorRow as { kyc_status?: string | null }).kyc_status ??
        "not_started";
      if (currentStatus === "not_started") {
        await admin
          .from("creators")
          .update({ kyc_status: "in_progress" })
          .eq("id", creatorId);
      }
    }
  }

  // ── 9. Response ────────────────────────────────────────────────────────────
  const payload = {
    pan_verified: verified,
    name_match: nameMatch,
    pan_name: panName ?? null,
  };
  return NextResponse.json(payload, { status: verified ? 200 : 422 });
}
