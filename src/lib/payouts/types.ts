/**
 * Payout service — shared TypeScript types.
 *
 * All monetary values are integers in paise (1 INR = 100 paise).
 * Conversion to rupees happens only at the Cashfree API boundary.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Error codes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Typed error code enum for PayoutError.
 * Callers should switch on `error.code` to produce user-facing messages.
 */
export type PayoutErrorCode =
  | "KYC_NOT_VERIFIED"
  | "BANK_ACCOUNT_MISSING"
  | "BELOW_MIN_PAYOUT"
  | "NET_TOO_LOW"
  | "INSUFFICIENT_AVAILABLE"
  | "PAYOUT_NOT_FOUND"
  | "ESCROW_LOCK_RACE"
  | "CASHFREE_ERROR"
  | "DB_ERROR";

/**
 * Domain error class for payout-related failures.
 * `code` is machine-readable; `message` is human-readable for server logs.
 */
export class PayoutError extends Error {
  public readonly code: PayoutErrorCode;

  constructor(code: PayoutErrorCode, message: string) {
    super(message);
    this.name = "PayoutError";
    this.code = code;
    // Restore prototype chain — required when extending built-ins in TypeScript.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain types
// ─────────────────────────────────────────────────────────────────────────────

/** Normalised status values for a creator payout row. */
export type PayoutStatus =
  | "requested"
  | "processing"
  | "success"
  | "failed"
  | "reversed";

/**
 * Row shape matching `public.creator_payouts`.
 * All paise fields are integers; timestamps are ISO-8601 strings from Supabase.
 */
export interface PayoutRow {
  id: string;
  creator_id: string;
  gross_amount_paise: number;
  tds_amount_paise: number;
  processing_fee_paise: number;
  net_amount_paise: number;
  status: PayoutStatus;
  cf_transfer_id: string | null;
  bank_account_last4: string | null;
  failure_reason: string | null;
  requested_at: string;
  completed_at: string | null;
  escrow_ledger_ids: string[];
}

/** Escrow ledger row — subset used by the payout service. */
export interface EscrowLedgerRow {
  id: string;
  creator_id: string;
  brand_id: string;
  type: string;
  amount_paise: number;
  payout_id: string | null;
  holding_until: string | null;
  created_at: string;
}

/** Creator row — subset needed for payout validation. */
export interface CreatorRow {
  id: string;
  user_id: string;
  kyc_status: "not_started" | "in_progress" | "verified" | "rejected";
  pending_balance_paise: number;
}

/** Creator bank account row — active account snapshot for payout. */
export interface CreatorBankAccountRow {
  id: string;
  creator_id: string;
  account_number_last4: string;
  ifsc: string;
  bank_name: string;
  account_holder_name: string;
  is_active: boolean;
  cf_beneficiary_id: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service input / output shapes
// ─────────────────────────────────────────────────────────────────────────────

/** Input to `requestPayout`. */
export interface RequestPayoutInput {
  /** Creator's `creators.id` (not user_id). */
  creatorId: string;
  /** Gross paise the creator wants to withdraw. Must be >= `getMinPayoutPaise()`. */
  amountPaise: number;
}

/** Scalar TDS/fee components, all in paise. */
export interface PayoutDeductions {
  gross: number;
  tds: number;
  fee: number;
  net: number;
}

/** Input to `handlePayoutWebhook`. */
export interface PayoutWebhookEvent {
  /** Cashfree transfer id from the webhook payload. */
  cfTransferId: string;
  /** `TRANSFER_SUCCESS` | `TRANSFER_FAILED` | `TRANSFER_REVERSED` */
  type: "TRANSFER_SUCCESS" | "TRANSFER_FAILED" | "TRANSFER_REVERSED";
  /** Reason string present on FAILED/REVERSED events. */
  failureReason?: string;
}

/** Input to `listPayouts`. */
export interface ListPayoutsInput {
  creatorId: string;
  page?: number;
  pageSize?: number;
}

/** Paginated list result. */
export interface ListPayoutsResult {
  payouts: PayoutRow[];
  total: number;
  page: number;
  pageSize: number;
}

/** Cashfree adapter — result of `submitTransfer`. */
export interface SubmitTransferResult {
  cfTransferId: string;
  rawStatus: string;
}

/** Cashfree adapter — input to `ensureBeneficiary`. */
export interface EnsureBeneficiaryInput {
  creatorId: string;
  name: string;
  bankAccountNumber: string;
  bankIfsc: string;
  email?: string;
  phone?: string;
}

/** Cashfree adapter — input to `submitTransfer`. */
export interface SubmitTransferInput {
  payoutId: string;
  beneficiaryId: string;
  amountPaise: number;
  remarks?: string;
}

/** Cashfree adapter — input to `pollTransferStatus`. */
export interface PollTransferStatusInput {
  payoutId: string;
}

/** Cashfree adapter — result of `pollTransferStatus`. */
export interface PollTransferStatusResult {
  cfTransferId: string;
  rawStatus: string;
}
