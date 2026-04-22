// ─────────────────────────────────────────────────────────────────────────────
// Credit domain — pack catalog + Zod schemas
// Ref spec §8 "Credit pack pricing table" + decision D16 (packs) / D15 (₹50/credit)
// ─────────────────────────────────────────────────────────────────────────────
//
// Credits are a display abstraction. Internally everything is paise.
//   • Free signup: 5 credits, ₹0 (one-time on email-verified signup)
//   • Small:      10 credits, ₹500      (₹50/credit)
//   • Medium:     50 credits, ₹2,250    (₹45/credit, 10% bonus)
//   • Large:     200 credits, ₹8,000    (₹40/credit, 20% bonus)
//
// credits = amount_paise / 50 (display only). The server always transacts
// in paise via credit_transactions.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";

// Source: spec §8 credit pack pricing table + decision D16
export const CREDIT_PACKS = {
  free_signup: {
    credits: 5,
    amount_paise: 0,
    label: "Free starter",
  },
  small: {
    credits: 10,
    amount_paise: 50000, // ₹500
    label: "Small pack",
  },
  medium: {
    credits: 50,
    amount_paise: 225000, // ₹2,250 (10% bonus)
    label: "Medium pack",
  },
  large: {
    credits: 200,
    amount_paise: 800000, // ₹8,000 (20% bonus)
    label: "Large pack",
  },
} as const;

export type CreditPack = keyof typeof CREDIT_PACKS;

// Packs the user is allowed to *purchase*. `free_signup` is granted server-side
// only (on email verification), never purchased, so exclude it from the public API.
export const PURCHASABLE_PACKS = ["small", "medium", "large"] as const;
export type PurchasablePack = (typeof PURCHASABLE_PACKS)[number];

// ── Zod schemas ─────────────────────────────────────────────────────────────

export const TopUpRequestSchema = z.object({
  pack: z.enum(PURCHASABLE_PACKS),
});
export type TopUpRequest = z.infer<typeof TopUpRequestSchema>;

// Credit transaction types (matches credit_transactions.type check constraint)
export const CREDIT_TX_TYPES = [
  "topup",
  "reserve",
  "release_reserve",
  "spend",
  "refund",
  "bonus",
  "adjustment",
] as const;
export type CreditTxType = (typeof CREDIT_TX_TYPES)[number];

export interface CreditTransactionRow {
  id: string;
  brand_id: string;
  type: CreditTxType;
  amount_paise: number;
  balance_after_paise: number;
  reference_type: string | null;
  reference_id: string | null;
  description: string | null;
  created_at: string;
}

// Top-up row lifecycle states (matches credit_top_ups.status check constraint)
export const TOP_UP_STATUSES = [
  "initiated",
  "processing",
  "success",
  "failed",
  "expired",
] as const;
export type TopUpStatus = (typeof TOP_UP_STATUSES)[number];

export interface CreditTopUpRow {
  id: string;
  brand_id: string;
  pack: CreditPack;
  credits: number;
  amount_paise: number;
  cf_order_id: string | null;
  cf_payment_id: string | null;
  status: TopUpStatus;
  failure_reason: string | null;
  initiated_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}
