// ─────────────────────────────────────────────────────────────────────────────
// License template catalog — defaults shown to creators when creating listings
// Ref spec: docs/superpowers/specs/2026-04-22-chunk-c-foundation-design.md §2 D18
// ─────────────────────────────────────────────────────────────────────────────
//
// Two templates for MVP:
//   • creation            — generate AI images only (no social posting).
//   • creation_promotion  — generate AI images AND creator posts ≥1 approved
//                            image to their Instagram.
//
// Defaults are *starting points* for the creator's listing form. Creator can
// override price/quota/validity inside a narrow range. `ig_post_required` is
// derived from the template and is NOT editable — it's part of the contract
// scope, not a pricing knob.
// ─────────────────────────────────────────────────────────────────────────────

export const LICENSE_TEMPLATES = {
  creation: {
    label: "Creation License",
    description:
      "Generate AI images of Creator's likeness for brand use. No social posting requirement.",
    default_price_paise: 600000, // ₹6,000
    default_image_quota: 25,
    default_validity_days: 90,
    ig_post_required: false,
  },
  creation_promotion: {
    label: "Creation + Promotion License",
    description:
      "Generate AI images AND Creator posts at least 1 approved image on their Instagram.",
    default_price_paise: 1500000, // ₹15,000
    default_image_quota: 10,
    default_validity_days: 30,
    ig_post_required: true,
  },
} as const;

export type LicenseTemplate = keyof typeof LICENSE_TEMPLATES;

// Ordered list for UI iteration.
export const LICENSE_TEMPLATE_KEYS = [
  "creation",
  "creation_promotion",
] as const;

/**
 * Safe lookup — returns undefined if `t` is not a known template.
 * Use when the input source is untrusted (request body); prefer a direct
 * indexed lookup when the type is already narrowed.
 */
export function getLicenseTemplate(
  t: string,
): (typeof LICENSE_TEMPLATES)[LicenseTemplate] | undefined {
  if (t === "creation" || t === "creation_promotion") {
    return LICENSE_TEMPLATES[t];
  }
  return undefined;
}

/**
 * Whether the template requires the creator to post on Instagram as part of
 * fulfilment. Centralised here so the POST /listings route doesn't have to
 * branch on literal strings.
 */
export function templateRequiresIgPost(t: LicenseTemplate): boolean {
  return LICENSE_TEMPLATES[t].ig_post_required;
}
