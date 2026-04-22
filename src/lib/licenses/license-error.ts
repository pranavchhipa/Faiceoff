/**
 * Domain error class for the license system.
 *
 * Extends the base `AppError` pattern with a typed `code` field
 * so callers can branch on error type without string matching messages.
 */

import { AppError } from "@/lib/utils/errors";
import type { LicenseErrorCode } from "./types";

const STATUS_CODES: Record<LicenseErrorCode, number> = {
  LICENSE_NOT_FOUND: 404,
  LICENSE_ALREADY_EXISTS: 409,
  LICENSE_NOT_ACTIVE: 422,
  LICENSE_NOT_EXPIRING_SOON: 422,
  REVOKE_FORBIDDEN: 403,
  CERT_GENERATION_FAILED: 500,
  CERT_UPLOAD_FAILED: 500,
  DB_ERROR: 500,
};

/**
 * Thrown by all functions in the license service when a domain invariant is
 * violated or an external call fails.
 *
 * @example
 * ```ts
 * throw new LicenseError("License not found", "LICENSE_NOT_FOUND");
 * // err.statusCode === 404
 * // err.code === "LICENSE_NOT_FOUND"
 * ```
 */
export class LicenseError extends AppError {
  public override readonly code: LicenseErrorCode;

  constructor(message: string, code: LicenseErrorCode) {
    super(message, STATUS_CODES[code], code);
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
