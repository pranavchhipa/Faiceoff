/**
 * Collaboration Agreement system — barrel export.
 *
 * The per-collab master agreement, dual e-signed (creator at accept, brand at
 * payment), generated as a tamper-evident PDF. Additive to the per-image
 * licence certs in `src/lib/licenses/`.
 */

export * from "./types";
export {
  AGREEMENT_VERSION,
  PLATFORM_ENTITY,
  RESTRICTIONS,
} from "./clauses";
export {
  buildAgreementTerms,
  computeShares,
  termLabel,
  TIER_LABELS,
  USAGE_LABELS,
  USAGE_DESCRIPTIONS,
} from "./terms";
export {
  uploadAgreementPDF,
  publicAgreementUrl,
  normalizeAgreementUrl,
} from "./storage";
export { generateCollabAgreementPDF } from "./agreement-pdf";
export {
  createDraftAgreementOnAccept,
  signBrandAndActivate,
  finalizeAgreementOnPayment,
  renderAndStorePDF,
  notifyAgreementActivated,
  regenerateAgreementPDF,
  cancelAgreementForRequest,
  getAgreementForSession,
  getAgreementWithParties,
  getPublicAgreementStatus,
} from "./service";
export type { RequestSnapshot } from "./service";

/**
 * Extract the originating client IP from request headers for the e-signature
 * audit trail. Returns null if unavailable. Trusts the platform's proxy
 * (Vercel sets x-forwarded-for / x-real-ip).
 */
export function clientIpFromHeaders(headers: Headers): string | null {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) {
    // First hop is the original client.
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip") ?? null;
}

/** Normalize + length-cap a typed signature name. Returns null if invalid. */
export function sanitizeSignatureName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (trimmed.length < 2 || trimmed.length > 120) return null;
  return trimmed;
}
