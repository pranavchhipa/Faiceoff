/**
 * Types for the per-collab Collaboration Agreement system.
 *
 * The agreement is a master MSA generated when a brand pays for a collab.
 * It is dual e-signed (creator at accept, brand at payment) and sits ABOVE
 * the per-image license certs (table `licenses`). Maps to the
 * `collab_agreements` table (migration 00071).
 *
 * All monetary values are in paise (1 INR = 100 paise).
 */

// ── Domain enums ─────────────────────────────────────────────────────────────

export type AgreementStatus = "pending_brand" | "active" | "cancelled";

/** Usage scope sold with the package (mirrors collab_requests.usage_scope). */
export type UsageScope = "social_organic" | "social_paid" | "digital_full";

/** Package tier (mirrors collab_requests.package_tier). */
export type PackageTier = "frame" | "feature" | "cover";

// ── DB row ───────────────────────────────────────────────────────────────────

/** Full `collab_agreements` row, hydrated from Supabase. */
export interface CollabAgreement {
  id: string;
  collab_request_id: string;
  collab_session_id: string | null;
  brand_id: string;
  creator_id: string;
  agreement_version: string;

  // Terms snapshot
  package_tier: string;
  package_price_paise: number;
  final_images: number;
  usage_scope: string;
  license_duration_days: number;
  product_name: string;
  creator_share_paise: number;
  platform_share_paise: number;

  // Creator signature
  creator_signed_name: string | null;
  creator_signed_at: string | null;
  creator_signed_ip: string | null;

  // Brand signature
  brand_signed_name: string | null;
  brand_signed_at: string | null;
  brand_signed_ip: string | null;

  status: AgreementStatus;
  pdf_url: string | null;
  pdf_sha256: string | null;

  created_at: string;
  updated_at: string;
}

// ── Computed terms (for review modal + PDF) ──────────────────────────────────

/**
 * Deterministic terms derived from a collab request snapshot. Single source of
 * truth shared by the pre-signing review modal and the rendered PDF, so both
 * sides see exactly what they sign.
 */
export interface AgreementTerms {
  package_tier: PackageTier | string;
  tier_label: string;
  package_price_paise: number;
  final_images: number;
  generation_credits: number;
  usage_scope: UsageScope | string;
  usage_label: string;
  usage_description: string;
  license_duration_days: number;
  term_label: string;
  product_name: string;
  creator_share_paise: number;
  platform_share_paise: number;
  /** Platform commission percentage as a whole number (e.g. 25). */
  platform_commission_pct: number;
  agreement_version: string;
}

// ── Card / detail shapes (party-facing, with names) ──────────────────────────

/** Agreement enriched with party display names for the collab detail card. */
export interface AgreementWithParties extends CollabAgreement {
  creator_display_name: string;
  brand_company_name: string;
}

// ── Public verify (zero-PII) ─────────────────────────────────────────────────

/**
 * Public-safe agreement verification payload. ZERO PII — no emails, phones,
 * GST, IP addresses, or amounts beyond what the parties already see publicly.
 */
export interface PublicAgreementStatus {
  status: AgreementStatus;
  agreement_version: string;
  brand_company_name: string;
  creator_display_name: string;
  product_name: string;
  usage_label: string;
  term_label: string;
  creator_signed_at: string | null;
  brand_signed_at: string | null;
  /** When both signed (= brand_signed_at on active agreements). */
  effective_at: string | null;
}

// ── PDF generation ───────────────────────────────────────────────────────────

/** Input for `generateCollabAgreementPDF`. */
export interface GenerateAgreementPDFInput {
  agreement: CollabAgreement;
  terms: AgreementTerms;
  creator: {
    display_name: string;
    instagram_handle?: string | null;
  };
  brand: {
    company_name: string;
    gst_number?: string | null;
  };
}

/** Output of `generateCollabAgreementPDF`. */
export interface AgreementPDFResult {
  buffer: Buffer;
  sha256: string;
}

/** Input for `uploadAgreementPDF`. */
export interface UploadAgreementPDFInput {
  buffer: Buffer;
  agreementId: string;
}

/** Output of `uploadAgreementPDF`. */
export interface UploadAgreementPDFResult {
  url: string;
  key: string;
}
