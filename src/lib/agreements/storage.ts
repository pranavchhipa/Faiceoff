/**
 * R2 storage for Collaboration Agreement PDFs.
 *
 * - `uploadAgreementPDF({ buffer, agreementId })` uploads to
 *   `agreements/{agreementId}.pdf` in the main asset bucket (`R2_BUCKET_NAME`).
 * - Returns `{ url, key }` where `url` is the public CDN URL.
 *
 * Mirrors `src/lib/licenses/cert-storage.ts` — uses `R2_PUBLIC_URL` (the
 * bucket's public r2.dev / custom-domain URL), NOT the S3 endpoint, so the
 * link opens in a browser without AWS-Sig auth.
 */

import { PutObjectCommand } from "@aws-sdk/client-s3";

import { r2Client, R2_BUCKET_NAME } from "@/lib/storage/r2-client";
import type {
  UploadAgreementPDFInput,
  UploadAgreementPDFResult,
} from "./types";

/** Resolve the public CDN base URL for R2 assets. */
function getPublicBase(): string {
  const publicUrl = process.env.R2_PUBLIC_URL?.trim();
  if (publicUrl) return publicUrl.replace(/\/$/, "");

  const explicit = process.env.R2_PUBLIC_BASE?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  throw new Error(
    "R2_PUBLIC_URL env var is required for agreement URL construction. Set it to the bucket's public r2.dev URL (e.g. https://pub-XXXXXXXX.r2.dev).",
  );
}

/** Build the public agreement PDF URL from an agreement id. */
export function publicAgreementUrl(agreementId: string): string {
  return `${getPublicBase()}/agreements/${agreementId}.pdf`;
}

/**
 * Normalize a possibly-broken agreement PDF URL. If the stored URL points at
 * the S3 endpoint (`*.r2.cloudflarestorage.com/...`) — which fails with
 * Authorization in browsers — rewrite it to the public CDN URL.
 */
export function normalizeAgreementUrl(
  url: string | null | undefined,
  agreementId: string,
): string | null {
  if (!url) return null;
  if (/\.r2\.cloudflarestorage\.com\//i.test(url)) {
    try {
      return publicAgreementUrl(agreementId);
    } catch {
      return url;
    }
  }
  return url;
}

/**
 * Upload a Collaboration Agreement PDF to Cloudflare R2.
 *
 * Path: `agreements/{agreementId}.pdf`
 * Bucket: `R2_BUCKET_NAME`
 */
export async function uploadAgreementPDF(
  input: UploadAgreementPDFInput,
): Promise<UploadAgreementPDFResult> {
  const { buffer, agreementId } = input;
  const key = `agreements/${agreementId}.pdf`;

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: "application/pdf",
    // The signed PDF for a given agreement id never changes — cache hard.
    CacheControl: "public, max-age=31536000, immutable",
    ContentDisposition: `inline; filename="faiceoff-agreement-${agreementId}.pdf"`,
    Metadata: {
      agreement_id: agreementId,
    },
  });

  try {
    await r2Client.send(command);
  } catch (cause) {
    throw new Error(
      `Failed to upload agreement PDF for ${agreementId}: ${String(cause)}`,
    );
  }

  const url = publicAgreementUrl(agreementId);
  return { url, key };
}
