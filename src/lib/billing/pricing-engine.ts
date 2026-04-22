// ─────────────────────────────────────────────────────────────────────────────
// Pricing engine — compute the brand's total cost and the creator's share for
// a single generation, given scope and exclusivity.
//
// All values are in paise (integer). Never floats for money.
//
// Rates (Chunk E spec, locked 2026-04-23):
//   - Scope add-ons: digital = +0, digital_print = +₹500 (50000p),
//     digital_print_packaging = +₹1000 (100000p)
//   - Exclusivity: +50% of (base + scope_addon)
//   - Platform commission: 20% of effective rate (base + scope_addon, before exclusivity)
//   - GST on commission: 18% of commission
//
// Structure:
//   total = creator_share + platform_share + gst_owed
//   creator_share = effective_rate - commission
//   platform_share = commission
//   gst_owed = 18% of commission (collected from brand, remitted by platform)
// ─────────────────────────────────────────────────────────────────────────────

import type { LicenseScope } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Absolute paise add-on per scope tier. */
export const SCOPE_ADDONS_PAISE: Record<LicenseScope, number> = {
  digital:                    0,
  digital_print:          50000,   // ₹500
  digital_print_packaging: 100000, // ₹1000
} as const;

/** Platform commission rate on the effective rate (base + scope addon). */
export const PLATFORM_COMMISSION_RATE = 0.20;

/** GST rate applied to the commission. */
export const GST_ON_COMMISSION_RATE = 0.18;

/** Exclusivity premium: 50% uplift on the effective rate. */
export const EXCLUSIVITY_RATE = 0.50;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ComputeRateParams {
  /** Creator's listed per-generation price (paise). Stored on creator_categories. */
  creatorRatePaise: number;
  /** Content usage scope selected by the brand. */
  scope: LicenseScope;
  /** Whether the brand wants exclusivity (prevents other brands from this creator in the category). */
  isExclusive: boolean;
}

export interface RateBreakdown {
  /** Creator's base per-generation price (input). */
  base:                  number;
  /** Paise added for scope (0 / 50000 / 100000). */
  scope_addon:           number;
  /** Effective rate before exclusivity = base + scope_addon. */
  effective_rate:        number;
  /** Exclusivity premium (+50% of effective_rate). 0 if non-exclusive. */
  exclusivity_premium:   number;
  /** Total brand-facing rate = effective_rate + exclusivity_premium. */
  total_rate:            number;
  /** Platform commission = 20% of effective_rate. */
  commission:            number;
  /** GST on commission = 18% of commission. */
  gst:                   number;
  /** Total brand pays = creator_share + commission + gst. */
  total:                 number;
}

export interface ComputeRateResult {
  /** Total paise the brand pays for this generation. */
  total_paise:            number;
  /** Paise the creator earns (total_rate - commission). */
  creator_share_paise:    number;
  /** Paise retained by platform (= commission). */
  platform_share_paise:   number;
  /** GST owed by platform (collected from brand). */
  gst_owed_paise:         number;
  /** Full breakdown for transparency / audit. */
  breakdown:              RateBreakdown;
}

// ─────────────────────────────────────────────────────────────────────────────
// computeRate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the full pricing breakdown for a single generation.
 *
 * Rounding: Math.round (half-up) for percentages — worst-case ±1 paise drift
 * per transaction, consistent with the existing ledger/math.ts approach.
 *
 * Invariants:
 *   - total_paise == creator_share_paise + platform_share_paise + gst_owed_paise
 *   - creator_share_paise + platform_share_paise == total_rate
 */
export function computeRate(params: ComputeRateParams): ComputeRateResult {
  const { creatorRatePaise, scope, isExclusive } = params;

  if (!Number.isInteger(creatorRatePaise) || creatorRatePaise < 0) {
    throw new Error(
      `computeRate: creatorRatePaise must be a non-negative integer, got ${creatorRatePaise}`,
    );
  }

  const scope_addon = SCOPE_ADDONS_PAISE[scope];
  const effective_rate = creatorRatePaise + scope_addon;

  // Exclusivity premium: +50% of effective_rate (after scope, before commission).
  const exclusivity_premium = isExclusive
    ? Math.round(effective_rate * EXCLUSIVITY_RATE)
    : 0;

  const total_rate = effective_rate + exclusivity_premium;

  // Commission is 20% of the effective_rate (NOT the exclusivity-inflated rate).
  // The exclusivity premium goes to the creator.
  const commission = Math.round(effective_rate * PLATFORM_COMMISSION_RATE);

  const gst = Math.round(commission * GST_ON_COMMISSION_RATE);

  // Creator earns total_rate minus the commission.
  const creator_share_paise = total_rate - commission;
  const platform_share_paise = commission;
  const gst_owed_paise = gst;
  const total_paise = creator_share_paise + platform_share_paise + gst_owed_paise;

  const breakdown: RateBreakdown = {
    base:                creatorRatePaise,
    scope_addon,
    effective_rate,
    exclusivity_premium,
    total_rate,
    commission,
    gst,
    total:               total_paise,
  };

  return {
    total_paise,
    creator_share_paise,
    platform_share_paise,
    gst_owed_paise,
    breakdown,
  };
}
