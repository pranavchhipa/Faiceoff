// ─────────────────────────────────────────────────────────────────────────────
// KYC domain — PAN / Aadhaar / Bank submission schemas + row types
// Ref spec §5.1 `creator_kyc` + `creator_bank_accounts`
// Ref plan Task 27 (Phase 7)
// ─────────────────────────────────────────────────────────────────────────────
//
// Three submission endpoints feed into one `creator_kyc` row per creator:
//   • PAN    → /api/kyc/pan
//   • Aadhaar→ /api/kyc/aadhaar
//   • Bank   → /api/kyc/bank   (inserts into creator_bank_accounts)
//
// Every submission runs Zod validation BEFORE a Cashfree API call is made so
// we don't waste KYC-API credits on obviously-invalid inputs. Rules mirror
// the published Indian government formats:
//   • PAN      — 5 letters + 4 digits + 1 letter (ex: AAAPL1234C)
//   • GSTIN    — 15 chars: 2 state digits + 10 PAN + 1 entity + Z + 1 checksum
//   • IFSC     — 4 letters + 0 + 6 alphanumeric (ex: HDFC0001234)
//   • Aadhaar  — 12 digits (full only used transiently for Cashfree call)
//
// Money fields none here — KYC is purely identity.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";

// ── Format regexes ──────────────────────────────────────────────────────────

export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const AADHAAR_FULL_REGEX = /^[0-9]{12}$/;
export const AADHAAR_LAST4_REGEX = /^[0-9]{4}$/;
export const ACCOUNT_NUMBER_REGEX = /^[0-9]{9,18}$/;

// ── Zod: PAN submission ─────────────────────────────────────────────────────
//
// `is_gstin_registered=true` REQUIRES `gstin` to be present and valid.
// Using .superRefine so a missing/invalid GSTIN attaches to the gstin field.

export const SubmitPanSchema = z
  .object({
    pan_number: z.string().regex(PAN_REGEX, "invalid_pan_format"),
    name_as_per_pan: z.string().trim().min(2).max(100),
    is_gstin_registered: z.boolean(),
    gstin: z.string().regex(GSTIN_REGEX, "invalid_gstin_format").optional(),
  })
  .superRefine((data, ctx) => {
    if (data.is_gstin_registered && !data.gstin) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "gstin_required_when_registered",
        path: ["gstin"],
      });
    }
  });
export type SubmitPanInput = z.infer<typeof SubmitPanSchema>;

// ── Zod: Aadhaar submission ─────────────────────────────────────────────────

export const SubmitAadhaarSchema = z.object({
  aadhaar_last4: z.string().regex(AADHAAR_LAST4_REGEX, "invalid_aadhaar_last4"),
  // full_aadhaar is accepted at the API boundary but NEVER stored. Only used
  // for the Cashfree call + the salted hash for dedup.
  full_aadhaar: z.string().regex(AADHAAR_FULL_REGEX, "invalid_aadhaar_number"),
  name_as_per_aadhaar: z.string().trim().min(2).max(100),
});
export type SubmitAadhaarInput = z.infer<typeof SubmitAadhaarSchema>;

// ── Zod: Bank submission ────────────────────────────────────────────────────

export const SubmitBankSchema = z.object({
  account_number: z
    .string()
    .regex(ACCOUNT_NUMBER_REGEX, "invalid_account_number"),
  ifsc: z.string().regex(IFSC_REGEX, "invalid_ifsc"),
  account_holder_name: z.string().trim().min(2).max(100),
  nickname: z.string().trim().max(40).optional(),
});
export type SubmitBankInput = z.infer<typeof SubmitBankSchema>;

// ── Row shape: creator_kyc (matches DB 00024) ───────────────────────────────

// Spec uses the narrower vocabulary via the top-level `kyc_status` on creators;
// creator_kyc.status is the internal step-by-step machine.
export const KYC_STATUSES = [
  "not_started",
  "pan_pending",
  "aadhaar_pending",
  "bank_pending",
  "verified",
  "rejected",
] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];

// The subset of statuses exposed on creators.kyc_status (§5.1 creators table).
export const CREATOR_KYC_STATES = [
  "not_started",
  "in_progress",
  "verified",
  "rejected",
] as const;
export type CreatorKycState = (typeof CREATOR_KYC_STATES)[number];

export interface CreatorKycRow {
  creator_id: string;
  pan_number_encrypted: Buffer | string | null;
  pan_name: string | null;
  pan_verified_at: string | null;
  pan_verification_status: "pending" | "verified" | "mismatch" | "failed" | null;
  aadhaar_last4: string | null;
  aadhaar_hash: string | null;
  aadhaar_verified_at: string | null;
  gstin: string | null;
  gstin_verified_at: string | null;
  is_gstin_registered: boolean;
  cf_beneficiary_id: string | null;
  status: KycStatus;
  rejected_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatorBankAccountRow {
  id: string;
  creator_id: string;
  account_number_encrypted: Buffer | string;
  account_number_last4: string;
  ifsc: string;
  bank_name: string;
  account_holder_name: string;
  penny_drop_verified_at: string | null;
  penny_drop_verified_name: string | null;
  name_match_score: number | null;
  is_active: boolean;
  cf_beneficiary_id: string | null;
  created_at: string;
  updated_at: string;
}

// ── KYC status response (consolidated GET /api/kyc/status) ──────────────────

export interface KycStatusResponse {
  // High-level state from creators.kyc_status — what gates withdrawal.
  status: CreatorKycState;
  pan_verified: boolean;
  aadhaar_verified: boolean;
  bank_verified: boolean;
  is_gstin_registered: boolean;
  can_withdraw: boolean;
  primary_bank: {
    id: string;
    last4: string;
    ifsc: string;
    bank_name: string;
    nickname: string | null;
  } | null;
  /** UI helper — which step is blocking the creator from withdrawing? null once verified. */
  required_next_step: "pan" | "aadhaar" | "bank" | null;
}
