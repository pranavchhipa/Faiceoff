/**
 * Cashfree Payments — TypeScript request/response types.
 *
 * These shapes mirror Cashfree's REST API (api-version: 2025-01-01).
 * Where the public docs were ambiguous at implementation time the shape is
 * inferred from common Cashfree examples — flagged with `@verifyAgainstDocs`
 * on the field. Those callers should be cross-checked before going live.
 *
 * All amounts on the wire are in **rupees** (float). Our internal callers
 * always pass paise (integer); conversion happens at the API boundary.
 */

/* ────────────────────────── Collect (orders) ───────────────────────────── */

export interface CashfreeCreateOrderRequest {
  order_id: string;
  order_amount: number; // rupees
  order_currency: "INR";
  customer_details: {
    customer_id: string;
    customer_email: string;
    customer_phone: string;
    customer_name?: string;
  };
  order_meta?: {
    return_url?: string;
    notify_url?: string;
  };
  order_tags?: Record<string, string>;
  order_note?: string;
}

export interface CashfreeOrderResponse {
  order_id: string;
  order_status: "ACTIVE" | "PAID" | "EXPIRED" | "CANCELLED" | "TERMINATED";
  order_amount: number;
  order_currency: string;
  payment_session_id: string;
  order_expiry_time?: string;
  created_at?: string;
  cf_order_id?: string;
  customer_details?: CashfreeCreateOrderRequest["customer_details"];
  order_meta?: CashfreeCreateOrderRequest["order_meta"];
  order_tags?: Record<string, string>;
}

export interface CashfreePayment {
  cf_payment_id: string;
  payment_id: string;
  payment_status:
    | "SUCCESS"
    | "FAILED"
    | "PENDING"
    | "USER_DROPPED"
    | "CANCELLED"
    | "NOT_ATTEMPTED";
  payment_amount: number;
  payment_currency: string;
  payment_time?: string;
  payment_message?: string;
  payment_method?: Record<string, unknown>;
  bank_reference?: string;
}

export interface CashfreeOrderStatusResponse {
  order_id: string;
  order_status: "ACTIVE" | "PAID" | "EXPIRED" | "CANCELLED" | "TERMINATED";
  order_amount: number;
  order_currency: string;
  payments: CashfreePayment[];
}

/* ────────────────────────── Payouts ────────────────────────────────────── */

export interface CashfreeBeneficiary {
  beneficiary_id: string;
  beneficiary_name: string;
  beneficiary_instrument_details: {
    bank_account_number: string;
    bank_ifsc: string;
    vpa?: string;
  };
  beneficiary_contact_details?: {
    beneficiary_email?: string;
    beneficiary_phone?: string;
    beneficiary_country_code?: string;
    beneficiary_address?: string;
  };
}

export interface CashfreeCreateBeneficiaryRequest {
  beneficiary_id: string;
  beneficiary_name: string;
  beneficiary_instrument_details: {
    bank_account_number: string;
    bank_ifsc: string;
    vpa?: string;
  };
  beneficiary_contact_details?: {
    beneficiary_email?: string;
    beneficiary_phone?: string;
  };
}

export type CashfreeTransferMode =
  | "IMPS"
  | "NEFT"
  | "RTGS"
  | "UPI"
  | "PAYTM";

export interface CashfreeCreateTransferRequest {
  transfer_id: string;
  transfer_amount: number; // rupees
  transfer_currency: "INR";
  transfer_mode: CashfreeTransferMode;
  beneficiary_details: { beneficiary_id: string };
  transfer_remarks?: string;
}

/** Raw Cashfree transfer status strings. */
export type CashfreeTransferStatus =
  | "SUCCESS"
  | "PROCESSING"
  | "PENDING"
  | "FAILED"
  | "REJECTED"
  | "REVERSED";

/** Our internal normalised state. */
export type InternalTransferStatus = "success" | "processing" | "failed";

export interface CashfreeTransferResponse {
  transfer_id: string;
  cf_transfer_id?: string;
  status: CashfreeTransferStatus;
  status_code?: string;
  status_description?: string;
  utr?: string;
  added_on?: string;
  updated_on?: string;
  /** Present after first bank response. @verifyAgainstDocs */
  bank_reference?: string;
}

/* ────────────────────────── KYC ────────────────────────────────────────── */

export interface CashfreeKycPanRequest {
  /** Cashfree requires a unique verification_id per call. */
  verification_id: string;
  pan: string;
  name: string;
}

export interface CashfreeKycPanResponse {
  verification_id: string;
  pan: string;
  name_provided: string;
  registered_name?: string;
  valid: boolean;
  /** `Y` / `N` from Cashfree for name-match. @verifyAgainstDocs */
  name_match?: "Y" | "N" | "PARTIAL";
  status: "VALID" | "INVALID";
  /** Raw response fields Cashfree may add. */
  reference_id?: string;
}

export interface CashfreeKycAadhaarRequest {
  verification_id: string;
  /** Last-4 of Aadhaar or full 12-digit (depends on endpoint). */
  aadhaar_number?: string;
  aadhaar_last4?: string;
  name: string;
  /** For OTP-based e-Aadhaar verify flow. */
  otp?: string;
  ref_id?: string;
}

export interface CashfreeKycAadhaarResponse {
  verification_id: string;
  ref_id?: string;
  valid: boolean;
  name_match?: "Y" | "N" | "PARTIAL";
  confidence?: number;
  status: "VALID" | "INVALID";
  message?: string;
}

export interface CashfreePennyDropRequest {
  verification_id: string;
  bank_account: string;
  ifsc: string;
  name: string;
}

export interface CashfreePennyDropResponse {
  verification_id: string;
  reference_id?: string;
  bank_account: string;
  ifsc: string;
  name_at_bank?: string;
  account_status: "VALID" | "INVALID";
  account_status_code?: string;
  name_match_score?: number;
  name_match_result?: "Y" | "N" | "PARTIAL";
}

/* ────────────────────────── Nodal / Settlement ─────────────────────────── */

export interface CashfreeSettlement {
  cf_settlement_id: string;
  settlement_utr?: string;
  amount: number;
  status: "PENDING" | "SUCCESS" | "FAILED";
  settled_on?: string;
  settled_amount?: number;
  payment_from?: string;
  payment_till?: string;
}

export interface CashfreeSettlementReport {
  settlements: CashfreeSettlement[];
  cursor?: string | null;
}

/* ────────────────────────── Webhook events ─────────────────────────────── */

export type CashfreeWebhookType =
  | "PAYMENT_SUCCESS_WEBHOOK"
  | "PAYMENT_FAILED_WEBHOOK"
  | "PAYMENT_USER_DROPPED_WEBHOOK"
  | "TRANSFER_SUCCESS"
  | "TRANSFER_FAILED"
  | "TRANSFER_REVERSED";

export interface CashfreeWebhookEvent {
  type: CashfreeWebhookType;
  event_time: string;
  data: Record<string, unknown>;
}
