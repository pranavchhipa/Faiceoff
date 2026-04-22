/**
 * License system — per-generation license with 12-month auto-renew.
 *
 * Distinct from the `license_requests` system (Chunk C, request-based).
 * This module operates on the `licenses` table introduced in migration 00032.
 *
 * Public API:
 * - `issueLicense`        — issue on generation approval + generate cert PDF
 * - `renewLicense`        — extend expiry by 12 months (caller charges wallet)
 * - `revokeLicense`       — creator-only revocation
 * - `getLicense`          — single license with parties joined
 * - `listBrandLicenses`   — paginated brand view
 * - `listCreatorLicenses` — paginated creator view
 * - `getExpiringSoon`     — driver for cron renewal job
 * - `getPublicLicenseStatus` — zero-PII public verify endpoint
 * - `generateLicenseCertPDF` — PDF cert generation
 * - `uploadCertPDF`       — R2 upload
 */

export {
  getLicense,
  getExpiringSoon,
  issueLicense,
  listBrandLicenses,
  listCreatorLicenses,
  renewLicense,
  revokeLicense,
} from "./license-service";

export { generateLicenseCertPDF } from "./cert-pdf";

export { uploadCertPDF } from "./cert-storage";

export { getPublicLicenseStatus } from "./verify";

export { LicenseError } from "./license-error";

export type {
  GetExpiringSoonInput,
  GenerateLicenseCertPDFInput,
  IssueLicenseInput,
  IssueLicenseResult,
  License,
  LicenseCertPDFResult,
  LicenseErrorCode,
  LicenseScope,
  LicenseStatus,
  LicenseWithParties,
  ListBrandLicensesInput,
  ListCreatorLicensesInput,
  PaginatedLicenses,
  PublicLicenseStatus,
  RenewLicenseInput,
  RevokeLicenseInput,
  UploadCertPDFInput,
  UploadCertPDFResult,
} from "./types";
