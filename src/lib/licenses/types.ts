/**
 * TypeScript types for the per-generation license system (Chunk E).
 *
 * These types map directly to the `licenses` table created in migration 00032.
 * Do NOT confuse with `license_requests` (Chunk C, request-based flow).
 *
 * All monetary values are in paise (1 INR = 100 paise).
 */

// ── Core domain types ──────────────────────────────────────────────────────

/** License scope determines permitted use of the generated image. */
export type LicenseScope =
  | "digital"
  | "digital_print"
  | "digital_print_packaging";

/** Lifecycle status of a license. */
export type LicenseStatus = "active" | "expired" | "revoked";

/**
 * Full license row from the `licenses` table, hydrated from Supabase.
 * Mirrors the DB schema exactly (all fields present, nullable preserved).
 */
export interface License {
  id: string;
  generation_id: string;
  brand_id: string;
  creator_id: string;
  scope: LicenseScope;
  is_category_exclusive: boolean;
  exclusive_category: string | null;
  exclusive_until: string | null;
  amount_paid_paise: number;
  creator_share_paise: number;
  platform_share_paise: number;
  issued_at: string;
  expires_at: string;
  auto_renew: boolean;
  renewed_count: number;
  status: LicenseStatus;
  revoked_at: string | null;
  revocation_reason: string | null;
  cert_url: string | null;
  cert_signature_sha256: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * License row with joined creator + brand display fields.
 * Returned by `listBrandLicenses`, `listCreatorLicenses`, and `getLicense`.
 */
export interface LicenseWithParties extends License {
  /** Creator's display name from `users` table. */
  creator_display_name: string;
  /** Brand's company name from `brands` table. */
  brand_company_name: string;
  /** Computed: days until expiry (negative if expired). */
  days_to_expiry: number;
}

// ── Service input types ────────────────────────────────────────────────────

/** Input for `issueLicense`. */
export interface IssueLicenseInput {
  generationId: string;
  brandId: string;
  creatorId: string;
  scope: LicenseScope;
  /** True if creator is granting category exclusivity for this brand. */
  isExclusive: boolean;
  /** Required when isExclusive=true. */
  exclusiveCategory?: string;
  /** Required when isExclusive=true. ISO timestamp. */
  exclusiveUntil?: string;
  amountPaidPaise: number;
  creatorSharePaise: number;
  platformSharePaise: number;
}

/** Input for `renewLicense`. */
export interface RenewLicenseInput {
  licenseId: string;
}

/** Input for `revokeLicense`. */
export interface RevokeLicenseInput {
  licenseId: string;
  reason: string;
  /** Must match license.creator_id — enforced in service. */
  revokedByCreatorId: string;
}

/** Input for `listBrandLicenses`. */
export interface ListBrandLicensesInput {
  brandId: string;
  status?: LicenseStatus;
  page?: number;
  pageSize?: number;
}

/** Input for `listCreatorLicenses`. */
export interface ListCreatorLicensesInput {
  creatorId: string;
  status?: LicenseStatus;
  page?: number;
  pageSize?: number;
}

/** Input for `getExpiringSoon`. */
export interface GetExpiringSoonInput {
  /** Number of days ahead to look. Default 30. */
  daysWindow?: number;
}

/** Result of `issueLicense`. */
export interface IssueLicenseResult {
  license: License;
  cert_url: string;
}

/** Paginated response wrapper. */
export interface PaginatedLicenses {
  data: LicenseWithParties[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ── cert-pdf input type ────────────────────────────────────────────────────

/** Input for `generateLicenseCertPDF`. */
export interface GenerateLicenseCertPDFInput {
  license: License;
  creator: {
    display_name: string;
    instagram_handle?: string | null;
  };
  brand: {
    company_name: string;
    gst_number?: string | null;
  };
  generation: {
    id: string;
  };
}

/** Output of `generateLicenseCertPDF`. */
export interface LicenseCertPDFResult {
  buffer: Buffer;
  sha256: string;
}

// ── cert-storage types ─────────────────────────────────────────────────────

/** Input for `uploadCertPDF`. */
export interface UploadCertPDFInput {
  buffer: Buffer;
  licenseId: string;
}

/** Output of `uploadCertPDF`. */
export interface UploadCertPDFResult {
  url: string;
  key: string;
}

// ── verify (public) types ──────────────────────────────────────────────────

/**
 * Public-safe license verification payload.
 * ZERO PII — no emails, phones, GST, or instagram handles.
 */
export interface PublicLicenseStatus {
  status: LicenseStatus;
  issued_at: string;
  expires_at: string;
  scope: LicenseScope;
  brand_company_name: string;
  creator_display_name: string;
  generation_id: string;
}

// ── Error types ────────────────────────────────────────────────────────────

/** Error codes used by LicenseError. */
export type LicenseErrorCode =
  | "LICENSE_NOT_FOUND"
  | "LICENSE_ALREADY_EXISTS"
  | "LICENSE_NOT_ACTIVE"
  | "LICENSE_NOT_EXPIRING_SOON"
  | "REVOKE_FORBIDDEN"
  | "CERT_GENERATION_FAILED"
  | "CERT_UPLOAD_FAILED"
  | "DB_ERROR";
