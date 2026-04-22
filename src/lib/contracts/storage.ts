/**
 * R2 storage for signed click-to-accept contract PDFs.
 *
 * - `uploadContract({ licenseRequestId, pdf })` pushes the PDF to R2 at
 *   `contracts/{licenseRequestId}/v1.pdf`, tagging it with a SHA-256 hash and
 *   the template version for audit parity.
 * - `getSignedContractUrl(r2Path, ttlSeconds?)` returns a presigned GET URL
 *   scoped to the same bucket. Default TTL is 1 hour (3600 seconds) — long
 *   enough for the party to download, short enough that leaked links expire.
 *
 * The contracts bucket is separate from the asset bucket (generation outputs).
 * Configure via `R2_CONTRACTS_BUCKET_NAME` (falls back to `faiceoff-contracts`).
 */

import { createHash } from "node:crypto";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2Client } from "@/lib/storage/r2-client";
import { CONTRACT_CONSTANTS } from "./template";

export const CONTRACTS_BUCKET_DEFAULT = "faiceoff-contracts";
export const DEFAULT_SIGNED_URL_TTL_SECONDS = 3600;

function getContractsBucket(): string {
  return (
    process.env.R2_CONTRACTS_BUCKET_NAME?.trim() || CONTRACTS_BUCKET_DEFAULT
  );
}

export interface UploadContractParams {
  licenseRequestId: string;
  pdf: Buffer;
  /** Override contract version suffix. Defaults to "v1". */
  version?: string;
}

export interface UploadContractResult {
  r2Path: string;
  sha256: string;
}

/**
 * Compute `sha256(pdf)` and upload the bytes to
 * `{contracts_bucket}/contracts/{licenseRequestId}/{version}.pdf`.
 *
 * Returns the storage path and the hex SHA-256 — both should be persisted on
 * the `license_contracts` row so the PDF can be replay-verified later.
 */
export async function uploadContract(
  params: UploadContractParams,
): Promise<UploadContractResult> {
  const { licenseRequestId, pdf, version = "v1" } = params;
  const sha256 = createHash("sha256").update(pdf).digest("hex");
  const r2Path = `contracts/${licenseRequestId}/${version}.pdf`;

  const command = new PutObjectCommand({
    Bucket: getContractsBucket(),
    Key: r2Path,
    Body: pdf,
    ContentType: "application/pdf",
    Metadata: {
      sha256,
      template_version: CONTRACT_CONSTANTS.TEMPLATE_VERSION,
    },
  });

  await r2Client.send(command);
  return { r2Path, sha256 };
}

/**
 * Build a presigned URL that lets the holder GET the stored contract PDF for
 * `ttlSeconds` seconds (default 1 hour). Callers should gate this behind a
 * route-level authz check — the URL itself is unauthenticated.
 */
export async function getSignedContractUrl(
  r2Path: string,
  ttlSeconds: number = DEFAULT_SIGNED_URL_TTL_SECONDS,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: getContractsBucket(),
    Key: r2Path,
  });
  return getSignedUrl(r2Client, command, { expiresIn: ttlSeconds });
}
