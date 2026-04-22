// ─────────────────────────────────────────────────────────────────────────────
// Ledger math — pure functions for all money calculations in Chunk C
// Ref spec: docs/superpowers/specs/2026-04-22-chunk-c-foundation-design.md §8
// ─────────────────────────────────────────────────────────────────────────────
//
// All amounts are paise (integer). Never floats for money.
//
// Rates (locked in decision log D7, D8, D9, D10):
//   - 18% platform commission charged to brand at contract signing
//   - 18% GST on the commission (collected from brand, remitted by platform)
//   - 1% TCS u/s 52 CGST at creator withdrawal (remitted via GSTR-8)
//   - 1% TDS u/s 194-O Income Tax at creator withdrawal (remitted via 26Q)
//   - 18% GST on creator service at withdrawal — ONLY if creator has GSTIN
//
// Rounding:
//   - Percentage math: Math.round (half-up banker-ish). Accepted tradeoff
//     vs. strict ROUND_HALF_EVEN since worst-case drift is ≤1 paise per txn.
//   - Release per image: Math.floor — residual always ≥ 0, never negative.
//
// Residual policy (spec §8):
//   residual = base_paise - (release_per_image * image_quota)
//   • Goes to the creator on the FINAL approved image (bundled with the last release).
//   • Goes to the brand pro-rata IF any slot is unused at expiry (included in refund).
//   • Either way: total_released + total_refunded = base_paise exactly.
// ─────────────────────────────────────────────────────────────────────────────

export const COMMISSION_RATE = 0.18;
export const GST_RATE = 0.18;
export const TCS_RATE = 0.01;
export const TDS_RATE = 0.01;

/**
 * Pricing breakdown produced at license request time and frozen in the
 * `license_requests` pricing snapshot columns.
 */
export type LicenseCheckout = {
  base_paise: number;
  commission_paise: number;
  gst_on_commission_paise: number;
  total_paise: number;
  release_per_image_paise: number;
  residual_paise: number;
};

/**
 * Compute the full brand-side checkout breakdown for a license request.
 *
 * Inputs:
 *   - base_paise:  creator's listed gross (stored on creator_license_listings.price_paise)
 *   - image_quota: number of images the brand can approve within this license
 *
 * Invariants (enforced by tests):
 *   - total_paise == base_paise + commission_paise + gst_on_commission_paise
 *   - release_per_image_paise * image_quota + residual_paise == base_paise
 */
export function calculateLicenseCheckout(
  base_paise: number,
  image_quota: number,
): LicenseCheckout {
  const commission_paise = Math.round(base_paise * COMMISSION_RATE);
  const gst_on_commission_paise = Math.round(commission_paise * GST_RATE);
  const total_paise = base_paise + commission_paise + gst_on_commission_paise;
  const release_per_image_paise = Math.floor(base_paise / image_quota);
  const residual_paise = base_paise - release_per_image_paise * image_quota;
  return {
    base_paise,
    commission_paise,
    gst_on_commission_paise,
    total_paise,
    release_per_image_paise,
    residual_paise,
  };
}

/**
 * Deductions applied at creator withdrawal time. Snapshot stored on
 * `withdrawal_requests` columns (tcs_paise, tds_paise, gst_output_paise, net_paise).
 */
export type WithdrawalDeductions = {
  gross_paise: number;
  tcs_paise: number;
  tds_paise: number;
  gst_output_paise: number;
  net_paise: number;
};

/**
 * Compute withdrawal deductions. GST is withheld only if the creator is GSTIN-
 * registered (creator_kyc.is_gstin_registered = true). Non-GSTIN creators
 * collect TCS+TDS only.
 *
 * Invariant: gross_paise == tcs + tds + gst + net (always, regardless of flags).
 */
export function calculateWithdrawalDeductions(
  gross_paise: number,
  hasGstin: boolean,
): WithdrawalDeductions {
  const tcs_paise = Math.round(gross_paise * TCS_RATE);
  const tds_paise = Math.round(gross_paise * TDS_RATE);
  const gst_output_paise = hasGstin ? Math.round(gross_paise * GST_RATE) : 0;
  const net_paise = gross_paise - tcs_paise - tds_paise - gst_output_paise;
  return {
    gross_paise,
    tcs_paise,
    tds_paise,
    gst_output_paise,
    net_paise,
  };
}

/**
 * Pro-rata refund to brand when a license expires with unused slots.
 *
 * Rule: every unused slot refunds `release_per_image_paise`. If ANY slot is
 * unused, the residual (from non-even base/quota division) goes with the
 * refund too (not with the creator). If all slots used, this returns 0 — the
 * residual has already been paid out with the final image (see
 * calculateFinalImageRelease).
 */
export function calculateRefundOnExpiry(
  base_paise: number,
  image_quota: number,
  images_approved: number,
): number {
  const release_per_image = Math.floor(base_paise / image_quota);
  const residual = base_paise - release_per_image * image_quota;
  const remaining_slots = image_quota - images_approved;
  if (remaining_slots <= 0) return 0;
  return remaining_slots * release_per_image + residual;
}

/**
 * Amount to release to the creator's pending balance for a single approved
 * image. On the FINAL image of the quota, the residual is bundled with this
 * release so the creator receives the full base_paise across all approvals.
 *
 * Call sites compute `is_final` as `images_approved + 1 == image_quota` at
 * approval time (i.e., this approval is the last one).
 */
export function calculateFinalImageRelease(
  base_paise: number,
  image_quota: number,
  is_final: boolean,
): number {
  const release_per_image = Math.floor(base_paise / image_quota);
  if (!is_final) return release_per_image;
  const residual = base_paise - release_per_image * image_quota;
  return release_per_image + residual;
}
