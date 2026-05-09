/**
 * R2 storage for license certificate PDFs.
 *
 * - `uploadCertPDF({ buffer, licenseId })` uploads to `certs/{licenseId}.pdf`
 *   in the main asset bucket (`R2_BUCKET_NAME`).
 * - Returns `{ url, key }` where `url` is the **public CDN URL**.
 *
 * IMPORTANT: This used to fall back to the S3 endpoint URL
 * (`https://<account>.r2.cloudflarestorage.com/<bucket>/...`) when
 * `R2_PUBLIC_BASE` wasn't set. That endpoint requires AWS-sig authorization
 * — clicking such a URL in a browser fails with `InvalidArgument:
 * Authorization`. We now use `R2_PUBLIC_URL` (the same env var used by the
 * generation pipeline) which is the bucket's public r2.dev or custom-domain
 * URL.
 */

import { PutObjectCommand } from "@aws-sdk/client-s3";

import { r2Client, R2_BUCKET_NAME } from "@/lib/storage/r2-client";
import type { UploadCertPDFInput, UploadCertPDFResult } from "./types";
import { LicenseError } from "./license-error";

/** Resolve the public CDN base URL for R2 assets. */
function getPublicBase(): string {
  // Primary: R2_PUBLIC_URL (matches the rest of the codebase, e.g. the
  // generation pipeline + replicate webhook). Should be the bucket's public
  // r2.dev URL or a custom domain (e.g. https://pub-XXXXXXXX.r2.dev).
  const publicUrl = process.env.R2_PUBLIC_URL?.trim();
  if (publicUrl) return publicUrl.replace(/\/$/, "");

  // Backwards-compat: R2_PUBLIC_BASE (older convention used only here)
  const explicit = process.env.R2_PUBLIC_BASE?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  throw new LicenseError(
    "R2_PUBLIC_URL env var is required for cert URL construction. Set it to the bucket's public r2.dev URL (e.g. https://pub-XXXXXXXX.r2.dev).",
    "CERT_UPLOAD_FAILED",
  );
}

/**
 * Build a public cert URL from a licenseId. Exported so we can fix old DB
 * rows that have the broken S3-endpoint URL — call from the API to rewrite
 * `cert_url` on read without a migration.
 */
export function publicCertUrl(licenseId: string): string {
  return `${getPublicBase()}/certs/${licenseId}.pdf`;
}

/**
 * Normalize a possibly-broken cert URL. If the stored URL points at the S3
 * endpoint (`*.r2.cloudflarestorage.com/...`) — which fails with
 * Authorization in browsers — rewrite it to the public CDN URL.
 *
 * Falls through unchanged for already-correct URLs.
 */
export function normalizeCertUrl(
  url: string | null | undefined,
  licenseId: string,
): string | null {
  if (!url) return null;
  // S3 endpoint pattern → swap to public
  if (/\.r2\.cloudflarestorage\.com\//i.test(url)) {
    try {
      return publicCertUrl(licenseId);
    } catch {
      return url; // env not set — keep original (will still fail, but visible)
    }
  }
  return url;
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
    // Inline disposition with filename so the browser previews + downloads correctly
    ContentDisposition: `inline; filename="faiceoff-license-${licenseId}.pdf"`,
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

  const url = publicCertUrl(licenseId);
  return { url, key };
}
