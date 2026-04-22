// ─────────────────────────────────────────────────────────────────────────────
// Billing domain types — inline definitions for Chunk E tables not yet in
// @/types/supabase (pending supabase gen types regeneration after migration).
// ─────────────────────────────────────────────────────────────────────────────

// ── Pack codes ───────────────────────────────────────────────────────────────

export type PackCode =
  | "free_signup"
  | "spark"
  | "flow"
  | "pro"
  | "studio"
  | "enterprise";

// ── credit_packs_catalog ─────────────────────────────────────────────────────

export interface CreditPack {
  id: string;
  code: PackCode;
  display_name: string;
  credits: number;
  bonus_credits: number;
  price_paise: number;
  is_popular: boolean;
  is_active: boolean;
  sort_order: number;
  marketing_tagline: string | null;
  created_at: string;
  updated_at: string;
}

// ── wallet_transactions type ──────────────────────────────────────────────────

export type WalletTransactionType =
  | "topup"
  | "reserve"
  | "release_reserve"
  | "spend"
  | "refund"
  | "bonus"
  | "adjustment"
  | "withdraw";

export interface WalletTransaction {
  id: string;
  brand_id: string;
  type: WalletTransactionType;
  amount_paise: number;
  balance_after_paise: number;
  reference_type: string | null;
  reference_id: string | null;
  description: string | null;
  created_at: string;
}

// ── wallet_top_ups ────────────────────────────────────────────────────────────

export type WalletTopUpStatus =
  | "initiated"
  | "processing"
  | "success"
  | "failed"
  | "expired";

export interface WalletTopUp {
  id: string;
  brand_id: string;
  amount_paise: number;
  bonus_paise: number;
  cf_order_id: string | null;
  cf_payment_id: string | null;
  status: WalletTopUpStatus;
  failure_reason: string | null;
  initiated_at: string;
  completed_at: string | null;
  created_at: string;
}

// ── credit_top_ups (extended Chunk E columns) ─────────────────────────────────

export type CreditTopUpStatus =
  | "initiated"
  | "processing"
  | "success"
  | "failed"
  | "expired";

export interface CreditTopUp {
  id: string;
  brand_id: string;
  pack: PackCode;
  credits: number;
  amount_paise: number;
  cf_order_id: string | null;
  cf_payment_id: string | null;
  status: CreditTopUpStatus;
  credits_granted: number;
  bonus_credits: number;
  created_at: string;
}

// ── brands billing columns (subset) ──────────────────────────────────────────

export interface BrandBillingRow {
  id: string;
  credits_remaining: number;
  credits_lifetime_purchased: number;
  wallet_balance_paise: number;
  wallet_reserved_paise: number;
  lifetime_topup_paise: number;
}

// ── Billing scope (for pricing engine) ───────────────────────────────────────

export type LicenseScope =
  | "digital"
  | "digital_print"
  | "digital_print_packaging";

// ── RPC result shapes ─────────────────────────────────────────────────────────

export interface AddCreditsResult {
  credits_added: number;
  bonus_added: number;
  new_balance: number;
  idempotent: boolean;
}

export interface DeductCreditResult {
  new_balance: number;
}

export interface ReserveWalletResult {
  new_reserved: number;
  available: number;
}

export interface SpendOrReleaseResult {
  new_balance: number;
  new_reserved: number;
}
