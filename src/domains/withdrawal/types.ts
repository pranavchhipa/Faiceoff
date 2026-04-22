// ─────────────────────────────────────────────────────────────────────────────
// Withdrawal domain — creator payout request schemas + row types
// Ref spec §4.4 (creator payout lifecycle) + §5.1 withdrawal_requests
// Ref plan Task 28 (Phase 7)
// ─────────────────────────────────────────────────────────────────────────────
//
// Minimum withdrawal = ₹500 = 50,000 paise (spec decision D19).
// Status machine (aligned with DB check constraint on withdrawal_requests):
//   requested → kyc_check → deductions_applied → processing → success
//                                                           ↘ failed
//   (cancelled reserved for admin-initiated cancellation.)
//
// Money always in paise. net_paise is AFTER TCS/TDS/GST deductions — never
// negative (DB check in the procedure raises if net ≤ 0).
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";

// ── Status enum (matches withdrawal_requests.status check constraint) ───────

export const WITHDRAWAL_STATUSES = [
  "requested",
  "kyc_check",
  "deductions_applied",
  "processing",
  "success",
  "failed",
  "cancelled",
] as const;
export type WithdrawalStatus = (typeof WITHDRAWAL_STATUSES)[number];

export const WITHDRAWAL_TERMINAL_STATES: readonly WithdrawalStatus[] = [
  "success",
  "failed",
  "cancelled",
] as const;

// ── Constants ───────────────────────────────────────────────────────────────

/** Minimum withdrawal gross. 50,000 paise = ₹500. Spec decision D19. */
export const MIN_WITHDRAWAL_GROSS_PAISE = 50_000;

/** Safety upper bound — MVP cap at ₹10,00,000 per single withdrawal. */
export const MAX_WITHDRAWAL_GROSS_PAISE = 100_000_000;

// ── Zod: create withdrawal ──────────────────────────────────────────────────

export const CreateWithdrawalSchema = z.object({
  amount_paise: z
    .number()
    .int()
    .min(MIN_WITHDRAWAL_GROSS_PAISE, "below_minimum")
    .max(MAX_WITHDRAWAL_GROSS_PAISE, "exceeds_maximum"),
  /** Optional — defaults to the creator's active bank account. */
  bank_account_id: z.string().uuid().optional(),
});
export type CreateWithdrawalInput = z.infer<typeof CreateWithdrawalSchema>;

// ── Zod: list withdrawals pagination ────────────────────────────────────────

export const ListWithdrawalsQuerySchema = z.object({
  cursor: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
});
export type ListWithdrawalsQuery = z.infer<typeof ListWithdrawalsQuerySchema>;

// ── Row shape (matches withdrawal_requests columns) ─────────────────────────

export interface WithdrawalRequestRow {
  id: string;
  creator_id: string;

  gross_paise: number;
  tcs_paise: number;
  tds_paise: number;
  gst_output_paise: number;
  net_paise: number;

  status: WithdrawalStatus;
  failure_reason: string | null;

  bank_account_number_masked: string;
  bank_ifsc: string;
  bank_name: string;

  cf_transfer_id: string | null;
  cf_utr: string | null;
  cf_mode: string | null;

  requested_at: string;
  processing_at: string | null;
  completed_at: string | null;

  created_at: string;
  updated_at: string;
}

// Response for single detail endpoint. Includes the bank last 4 + a safe
// summary of the linked bank row (never the encrypted account number).
export interface WithdrawalRequestDetail extends WithdrawalRequestRow {
  bank_account?: {
    id: string;
    last4: string;
    ifsc: string;
    bank_name: string;
  } | null;
}
