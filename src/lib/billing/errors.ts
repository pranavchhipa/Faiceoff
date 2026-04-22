// ─────────────────────────────────────────────────────────────────────────────
// BillingError — thrown by all billing service functions for domain-specific
// errors (insufficient credits/wallet, idempotency guards, invalid state).
// ─────────────────────────────────────────────────────────────────────────────

export type BillingErrorCode =
  | "INSUFFICIENT_CREDITS"
  | "INSUFFICIENT_WALLET"
  | "PACK_NOT_FOUND"
  | "TOP_UP_NOT_FOUND"
  | "TOP_UP_INVALID_STATUS"
  | "BRAND_NOT_FOUND"
  | "RPC_ERROR"
  | "BILLING_INVARIANT";

export class BillingError extends Error {
  public readonly code: BillingErrorCode;

  constructor(message: string, code: BillingErrorCode) {
    super(message);
    this.name = "BillingError";
    this.code = code;
    // Restore prototype chain (required when extending built-ins in TS).
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
