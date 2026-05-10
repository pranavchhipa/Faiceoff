/**
 * Wallet bonus tier resolver.
 *
 * Single source of truth on the JS side — must stay in sync with the
 * `wallet_bonus_tiers` SQL table seeded in migration 00053. The values
 * below are duplicated for client-side previews (top-up form, pricing
 * page, etc.) — server-side payment processing should call the
 * `compute_wallet_bonus_paise` Postgres function for the authoritative
 * answer.
 *
 * Tiers (paise, bps = basis points = 1/100 of a percent):
 *
 *   ₹500    – ₹999    →  0%
 *   ₹1,000  – ₹4,999  →  5%
 *   ₹5,000  – ₹9,999  → 10%
 *   ₹10,000 – ₹49,999 → 15%
 *   ₹50,000+          → 20%
 */

export interface WalletBonusTier {
  minPaise: number;
  maxPaise: number | null; // null = open-ended top tier
  bonusBps: number; // 100 = 1%, 500 = 5%, 2000 = 20%
  label: string;
}

export const WALLET_BONUS_TIERS: WalletBonusTier[] = [
  { minPaise: 50_000, maxPaise: 100_000, bonusBps: 0, label: "₹500–₹999" },
  { minPaise: 100_000, maxPaise: 500_000, bonusBps: 500, label: "₹1,000–₹4,999" },
  { minPaise: 500_000, maxPaise: 1_000_000, bonusBps: 1000, label: "₹5,000–₹9,999" },
  { minPaise: 1_000_000, maxPaise: 5_000_000, bonusBps: 1500, label: "₹10,000–₹49,999" },
  { minPaise: 5_000_000, maxPaise: null, bonusBps: 2000, label: "₹50,000+" },
];

export interface WalletBonusResult {
  amountPaise: number;
  bonusPaise: number;
  bonusBps: number;
  totalCreditedPaise: number;
  tier: string | null;
}

/**
 * Compute the wallet bonus locally. Client-side helper — used for
 * previews. Server should still re-compute via the SQL function on the
 * actual payment leg to defeat tampering.
 */
export function computeWalletBonus(amountPaise: number): WalletBonusResult {
  if (!Number.isFinite(amountPaise) || amountPaise < 0) {
    return {
      amountPaise: 0,
      bonusPaise: 0,
      bonusBps: 0,
      totalCreditedPaise: 0,
      tier: null,
    };
  }
  // Find highest tier with min_paise <= amount && (max_paise == null || amount < max_paise).
  let chosen: WalletBonusTier | null = null;
  for (const t of WALLET_BONUS_TIERS) {
    if (amountPaise >= t.minPaise && (t.maxPaise == null || amountPaise < t.maxPaise)) {
      if (!chosen || t.minPaise > chosen.minPaise) chosen = t;
    }
  }
  const bonusBps = chosen?.bonusBps ?? 0;
  const bonusPaise = Math.round((amountPaise * bonusBps) / 10_000);
  return {
    amountPaise,
    bonusPaise,
    bonusBps,
    totalCreditedPaise: amountPaise + bonusPaise,
    tier: chosen?.label ?? null,
  };
}
