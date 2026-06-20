/**
 * buildAgreementTerms — derive the deterministic, display-ready terms of a
 * Collaboration Agreement from a collab-request snapshot.
 *
 * This is the SINGLE SOURCE OF TRUTH shared by:
 *   • the pre-signing review modal (creator accept + brand pay),
 *   • the rendered PDF,
 *   • the public verify page.
 * so all three show exactly the same numbers and labels the parties agreed to.
 */

import {
  PLATFORM_COMMISSION_RATE,
  CREATOR_SHARE_RATE,
} from "@/lib/billing";
import { AGREEMENT_VERSION } from "./clauses";
import type { AgreementTerms } from "./types";

// ── Label maps ───────────────────────────────────────────────────────────────

export const TIER_LABELS: Record<string, string> = {
  frame: "Frame",
  feature: "Feature",
  cover: "Cover",
};

export const USAGE_LABELS: Record<string, string> = {
  social_organic: "Organic social",
  social_paid: "Paid social",
  digital_full: "Full digital",
};

export const USAGE_DESCRIPTIONS: Record<string, string> = {
  social_organic:
    "Use on the Brand's own organic social media channels — no paid promotion or amplification.",
  social_paid:
    "Use across the Brand's organic and paid social media advertising.",
  digital_full:
    "Full digital usage — websites, social (organic + paid), e-commerce, online marketing, and digital advertising.",
};

/** Humanise a license duration in days into a readable term label. */
export function termLabel(days: number): string {
  if (days <= 0) return "—";
  if (days % 365 === 0) {
    const y = days / 365;
    return `${y} ${y === 1 ? "year" : "years"} (${days} days)`;
  }
  if (days % 30 === 0) {
    const m = days / 30;
    return `${m} ${m === 1 ? "month" : "months"} (${days} days)`;
  }
  return `${days} days`;
}

// ── Input ────────────────────────────────────────────────────────────────────

/**
 * Minimal snapshot needed to build terms — matches the fields on a
 * `collab_requests` row (or the agreement's own snapshot columns).
 */
export interface AgreementTermsInput {
  package_tier: string;
  package_price_paise: number;
  final_images: number;
  usage_scope: string;
  license_duration_days: number;
  product_name: string;
  /** Generation credits granted; defaults to final_images × 3 if omitted. */
  gen_credits?: number | null;
}

// ── Share computation ────────────────────────────────────────────────────────

/**
 * Split the package price into the creator's share and the platform's share.
 * Mirrors the licensing model: creator keeps CREATOR_SHARE_RATE (75%), platform
 * retains PLATFORM_COMMISSION_RATE (25%, inclusive of applicable GST).
 *
 * Computed by rounding the creator share and assigning the remainder to the
 * platform so the two always sum back to the exact price (no lost paise).
 */
export function computeShares(pricePaise: number): {
  creator_share_paise: number;
  platform_share_paise: number;
} {
  const creator_share_paise = Math.round(pricePaise * CREATOR_SHARE_RATE);
  const platform_share_paise = pricePaise - creator_share_paise;
  return { creator_share_paise, platform_share_paise };
}

// ── Builder ──────────────────────────────────────────────────────────────────

export function buildAgreementTerms(input: AgreementTermsInput): AgreementTerms {
  const { creator_share_paise, platform_share_paise } = computeShares(
    input.package_price_paise,
  );

  return {
    package_tier: input.package_tier,
    tier_label: TIER_LABELS[input.package_tier] ?? input.package_tier,
    package_price_paise: input.package_price_paise,
    final_images: input.final_images,
    generation_credits: input.gen_credits ?? input.final_images * 3,
    usage_scope: input.usage_scope,
    usage_label: USAGE_LABELS[input.usage_scope] ?? input.usage_scope,
    usage_description:
      USAGE_DESCRIPTIONS[input.usage_scope] ??
      "Use within the agreed digital scope.",
    license_duration_days: input.license_duration_days,
    term_label: termLabel(input.license_duration_days),
    product_name: input.product_name,
    creator_share_paise,
    platform_share_paise,
    platform_commission_pct: Math.round(PLATFORM_COMMISSION_RATE * 100),
    agreement_version: AGREEMENT_VERSION,
  };
}
