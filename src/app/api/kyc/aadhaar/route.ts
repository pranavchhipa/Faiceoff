// ─────────────────────────────────────────────────────────────────────────────
// POST /api/kyc/aadhaar — submit Aadhaar for Cashfree verification + persist
// Ref plan Task 27 / spec §4.4 ELIGIBILITY CHECK + §5.1 creator_kyc
// ─────────────────────────────────────────────────────────────────────────────
//
// UIDAI-compliance critical: we MUST NOT store the full 12-digit Aadhaar.
// We persist:
//   • aadhaar_last4   — last 4 digits, plain text (legal)
//   • aadhaar_hash    — salted HMAC-SHA256(full_aadhaar) for dedup UNIQUE
//
// The full 12-digit number lives in memory only for the Cashfree call. Never
// written to a DB column. Never logged. Never returned.
//
// Flow:
//   1. Auth (401 if unauth).
//   2. Zod validate — full must be 12 digits, last4 must be 4 digits, name set.
//      Also cross-check that full_aadhaar ends with the declared last4 (anti-
//      fat-finger protection so a typo doesn't drop a bad hash into the
//      UNIQUE index).
//   3. Resolve creator row (403 otherwise).
//   4. Load existing creator_kyc snapshot (for rollup decision).
//   5. Call verifyAadhaar(full_aadhaar + name). 502 on network throw.
//   6. Upsert creator_kyc with aadhaar_last4 + aadhaar_hash (+ verified_at).
//   7. 3/3 rollup: if PAN is already verified AND bank row exists AND aadhaar
//      now verified → flip creators.kyc_status → 'verified'.
//   8. Return 200 on success, 422 on verification failure.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAadhaar } from "@/lib/payments/cashfree/kyc";
import { hashAadhaar } from "@/lib/kyc/crypto";
import { SubmitAadhaarSchema } from "@/domains/kyc/types";

// Narrow admin-client handle — supabase types don't include creator_kyc yet.
type CountQueryResult = {
  count: number | null;
  error: { message: string } | null;
};
interface AadhaarAdmin {
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
  admin: AadhaarAdmin,
  creatorId: string,
  panVerified: boolean,
  aadhaarVerifiedNow: boolean,
): Promise<boolean> {
  if (!panVerified) return false;
  if (!aadhaarVerifiedNow) return false;
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
  const parsed = SubmitAadhaarSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const { aadhaar_last4, full_aadhaar, name_as_per_aadhaar } = parsed.data;

  // Cross-check: declared last4 must match the tail of full_aadhaar.
  if (!full_aadhaar.endsWith(aadhaar_last4)) {
    return NextResponse.json(
      { error: "invalid_input", reason: "last4_mismatch" },
      { status: 400 },
    );
  }

  const admin = createAdminClient() as unknown as AadhaarAdmin;

  // ── 3. Creator gate ────────────────────────────────────────────────────────
  const { data: creatorRow, error: creatorError } = await (admin
    .from("creators")
    .select("id, kyc_status")
    .eq("user_id", user.id)
    .maybeSingle?.() ?? Promise.resolve({ data: null, error: null }));
  if (creatorError) {
    console.error("[kyc/aadhaar] creator lookup failed", creatorError);
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

  const panAlreadyVerified =
    (existingKyc as { pan_verification_status?: string | null } | null)
      ?.pan_verification_status === "verified";

  // ── 5. Hash Aadhaar in-memory ──────────────────────────────────────────────
  // HMAC-SHA256 with the KYC key as secret — deterministic (for the UNIQUE
  // index) but unrecoverable without the key.
  const aadhaarHash = hashAadhaar(full_aadhaar);

  // ── 6. Call Cashfree ───────────────────────────────────────────────────────
  let verified = false;
  let nameMatch = false;
  let confidence: number | undefined;
  try {
    const result = await verifyAadhaar({
      verificationId: `aadhaar_${creatorId}_${randomUUID()}`,
      aadhaarNumber: full_aadhaar,
      name: name_as_per_aadhaar,
    });
    verified = result.verified;
    nameMatch = result.nameMatch;
    confidence = result.confidence;
  } catch (err) {
    const message = err instanceof Error ? err.message : "cashfree_error";
    console.error("[kyc/aadhaar] Cashfree verify failed", message);
    return NextResponse.json(
      { error: "cashfree_unavailable", message },
      { status: 502 },
    );
  }

  // ── 7. Persist creator_kyc ─────────────────────────────────────────────────
  const now = new Date().toISOString();

  const kycRow: Record<string, unknown> = {
    creator_id: creatorId,
    aadhaar_last4,
    aadhaar_hash: aadhaarHash,
  };
  if (verified) {
    kycRow.aadhaar_verified_at = now;
  }
  // Advance the internal machine if the row is new.
  if (!existingKyc) {
    kycRow.status = verified ? "bank_pending" : "aadhaar_pending";
  }

  const { error: upsertError } = await admin
    .from("creator_kyc")
    .upsert(kycRow, { onConflict: "creator_id" });
  if (upsertError) {
    console.error("[kyc/aadhaar] creator_kyc upsert failed", upsertError);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  // ── 8. 3/3 rollup ──────────────────────────────────────────────────────────
  if (verified) {
    const allThree = await has3of3Verified(
      admin,
      creatorId,
      panAlreadyVerified,
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
      // Keep creators.kyc_status moving towards 'in_progress'.
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
    aadhaar_verified: verified,
    name_match: nameMatch,
    confidence: confidence ?? null,
  };
  return NextResponse.json(payload, { status: verified ? 200 : 422 });
}
