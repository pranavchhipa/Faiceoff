// ─────────────────────────────────────────────────────────────────────────────
// GET /api/kyc/status — consolidated KYC state for the authed creator
// Ref plan Task 27 / spec §4.4 ELIGIBILITY CHECK
// ─────────────────────────────────────────────────────────────────────────────
//
// Front-end uses this to render the 3-step onboarding progress card AND to
// gate the "Request withdrawal" button. Returns:
//
//   • status                 — creators.kyc_status (not_started/in_progress/
//                              verified/rejected)
//   • pan_verified           — creator_kyc.pan_verification_status === 'verified'
//   • aadhaar_verified       — creator_kyc.aadhaar_verified_at IS NOT NULL
//   • bank_verified          — an active creator_bank_accounts row with
//                              penny_drop_verified_at set
//   • can_withdraw           — pan_verified && aadhaar_verified && bank_verified
//   • primary_bank           — id + last4 + IFSC + bank_name + nickname
//                              (NEVER raw account number, NEVER bytea)
//   • required_next_step     — first unfinished step (pan/aadhaar/bank) or null
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { KycStatusResponse } from "@/domains/kyc/types";

interface StatusAdmin {
  from(table: string): {
    select(cols?: string): {
      eq(col: string, val: string): {
        maybeSingle?(): Promise<{
          data: Record<string, unknown> | null;
          error: { message: string } | null;
        }>;
        eq?(col: string, val: boolean | string): {
          order(col: string, opts: { ascending: boolean }): {
            limit(n: number): {
              maybeSingle(): Promise<{
                data: Record<string, unknown> | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
    };
  };
}

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient() as unknown as StatusAdmin;

  // Creator gate
  const { data: creatorRow } = await (admin
    .from("creators")
    .select("id, user_id, kyc_status")
    .eq("user_id", user.id)
    .maybeSingle?.() ?? Promise.resolve({ data: null, error: null }));
  if (!creatorRow) {
    return NextResponse.json(
      { error: "forbidden", reason: "only_creators_can_read_kyc_status" },
      { status: 403 },
    );
  }
  const creatorId = (creatorRow as { id: string }).id;
  const creatorsKycStatus =
    ((creatorRow as { kyc_status?: string | null }).kyc_status ??
      "not_started") as KycStatusResponse["status"];

  // creator_kyc snapshot
  const { data: kycRow } = await (admin
    .from("creator_kyc")
    .select(
      "creator_id, pan_verification_status, aadhaar_verified_at, is_gstin_registered, status",
    )
    .eq("creator_id", creatorId)
    .maybeSingle?.() ?? Promise.resolve({ data: null, error: null }));

  const panVerified =
    (kycRow as { pan_verification_status?: string | null } | null)
      ?.pan_verification_status === "verified";
  const aadhaarVerifiedAt =
    (kycRow as { aadhaar_verified_at?: string | null } | null)
      ?.aadhaar_verified_at ?? null;
  const aadhaarVerified = aadhaarVerifiedAt !== null;
  const isGstinRegistered =
    (kycRow as { is_gstin_registered?: boolean } | null)?.is_gstin_registered ??
    false;

  // Primary bank (active + penny-drop verified)
  const bankQuery = admin
    .from("creator_bank_accounts")
    .select(
      "id, account_number_last4, ifsc, bank_name, nickname, penny_drop_verified_at",
    )
    .eq("creator_id", creatorId);

  // The chain is .eq('creator_id').eq('is_active', true).order.limit.maybeSingle
  const bankQueryWithActive = bankQuery.eq?.("is_active", true);
  let primaryBankRow: Record<string, unknown> | null = null;
  if (bankQueryWithActive) {
    const { data } = await bankQueryWithActive
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    primaryBankRow = data;
  }

  const bankVerified =
    primaryBankRow !== null &&
    (primaryBankRow as { penny_drop_verified_at?: string | null })
      .penny_drop_verified_at !== null &&
    (primaryBankRow as { penny_drop_verified_at?: string | null })
      .penny_drop_verified_at !== undefined;

  const canWithdraw = panVerified && aadhaarVerified && bankVerified;

  // First blocking step
  let requiredNextStep: "pan" | "aadhaar" | "bank" | null = null;
  if (!panVerified) requiredNextStep = "pan";
  else if (!aadhaarVerified) requiredNextStep = "aadhaar";
  else if (!bankVerified) requiredNextStep = "bank";

  const primaryBank = primaryBankRow
    ? {
        id: (primaryBankRow as { id: string }).id,
        last4:
          (primaryBankRow as { account_number_last4?: string })
            .account_number_last4 ?? "",
        ifsc: (primaryBankRow as { ifsc?: string }).ifsc ?? "",
        bank_name: (primaryBankRow as { bank_name?: string }).bank_name ?? "",
        nickname:
          (primaryBankRow as { nickname?: string | null }).nickname ?? null,
      }
    : null;

  const response: KycStatusResponse = {
    status: creatorsKycStatus,
    pan_verified: panVerified,
    aadhaar_verified: aadhaarVerified,
    bank_verified: bankVerified,
    is_gstin_registered: isGstinRegistered,
    can_withdraw: canWithdraw,
    primary_bank: primaryBank,
    required_next_step: requiredNextStep,
  };

  return NextResponse.json(response, { status: 200 });
}
