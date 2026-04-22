/**
 * R2 storage for license certificate PDFs.
 *
 * - `uploadCertPDF({ buffer, licenseId })` uploads to `certs/{licenseId}.pdf`
 *   in the main asset bucket (`R2_BUCKET_NAME`).
 * - Returns `{ url, key }` where `url` is the public CDN URL constructed from
 *   the `R2_PUBLIC_BASE` env var (falls back to the account endpoint).
 *
 * Uses the shared `r2Client` from `@/lib/storage/r2-client`.
 */

import { PutObjectCommand } from "@aws-sdk/client-s3";

import { r2Client, R2_BUCKET_NAME } from "@/lib/storage/r2-client";
import type { UploadCertPDFInput, UploadCertPDFResult } from "./types";
import { LicenseError } from "./license-error";

/** Resolve the public CDN base URL for R2 assets. */
function getPublicBase(): string {
  const explicit = process.env.R2_PUBLIC_BASE?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  // Fallback: construct from account ID + bucket name
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  if (accountId) {
    return `https://${accountId}.r2.cloudflarestorage.com/${R2_BUCKET_NAME}`;
  }

  throw new LicenseError(
    "R2_PUBLIC_BASE or R2_ACCOUNT_ID env var is required for cert URL construction",
    "CERT_UPLOAD_FAILED",
  );
}

/**
 * Upload a license certificate PDF to Cloudflare R2.
 *
 * Path: `certs/{licenseId}.pdf`
 * Bucket: `R2_BUCKET_NAME`
 *
 * @param input - `{ buffer, licenseId }` — raw PDF bytes and the license UUID.
 * @returns `{ url, key }` where `url` is the public CDN URL and `key` is the
 * R2 object key (for deletion or presigned access if needed later).
 */
export async function uploadCertPDF(
  input: UploadCertPDFInput,
): Promise<UploadCertPDFResult> {
  const { buffer, licenseId } = input;
  const key = `certs/${licenseId}.pdf`;

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: "application/pdf",
    // Cache aggressively — cert content never changes for a given license ID
    CacheControl: "public, max-age=31536000, immutable",
    Metadata: {
      license_id: licenseId,
    },
  });

  try {
    await r2Client.send(command);
  } catch (cause) {
    throw new LicenseError(
      `Failed to upload cert PDF for license ${licenseId}: ${String(cause)}`,
      "CERT_UPLOAD_FAILED",
    );
  }

  const publicBase = getPublicBase();
  const url = `${publicBase}/certs/${licenseId}.pdf`;

  return { url, key };
}
