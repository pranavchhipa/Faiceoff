/**
 * TOTP (RFC 6238) helpers for the Control Centre — Google Authenticator
 * compatible.
 *
 * Layout:
 *   • generateSecret()      — produces a fresh base32 secret + provisioning
 *                             URI ready for QR code rendering.
 *   • verifyToken(code)     — verifies a 6-digit code against the stored
 *                             secret with a ±1 step tolerance (handles ~30s
 *                             of clock drift in either direction).
 *   • generateBackupCodes() — 10 single-use, 10-digit codes — bcrypt-hashed
 *                             before storage so we never persist plaintext.
 */

import { authenticator } from "otplib";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

import { decrypt, encrypt, type EncryptedBlob } from "./encryption";

// 30-second time step (Google Authenticator's default).
// window=1 → accept current step ±1 (so valid range is ~90s).
// digits=6 → 6-digit codes (Google Authenticator default).
authenticator.options = { step: 30, window: 1, digits: 6 };

const ISSUER = "Faiceoff";
const ACCOUNT = "Owner Control Centre";

export interface SecretBundle {
  /** Base32 secret — store encrypted via encrypt(). */
  secret: string;
  /** otpauth://… URI for QR encoding. */
  otpauthUri: string;
}

export function generateSecret(): SecretBundle {
  const secret = authenticator.generateSecret();
  const otpauthUri = authenticator.keyuri(ACCOUNT, ISSUER, secret);
  return { secret, otpauthUri };
}

export function verifyToken(secret: string, token: string): boolean {
  // otplib already runs constant-time verification internally.
  try {
    return authenticator.verify({ token: token.trim(), secret });
  } catch {
    return false;
  }
}

/* ── Backup codes ──────────────────────────────────────────────────────── */

const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_DIGITS = 10;

/** Plaintext code in `XXXXX-XXXXX` form. Show ONCE during setup. */
export interface BackupCode {
  code: string;
}

export function generateBackupCodes(): BackupCode[] {
  const out: BackupCode[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    // 10 digits → split into two 5-digit blocks for legibility.
    const buf = randomBytes(8); // ~10^19 entropy, more than enough
    const num = buf.readBigUInt64BE() % 10n ** BigInt(BACKUP_CODE_DIGITS);
    const padded = num.toString().padStart(BACKUP_CODE_DIGITS, "0");
    out.push({
      code: `${padded.slice(0, 5)}-${padded.slice(5)}`,
    });
  }
  return out;
}

/** Hash backup codes for storage. Returns array of bcrypt hashes (cost=10). */
export async function hashBackupCodes(codes: BackupCode[]): Promise<string[]> {
  const out: string[] = [];
  for (const { code } of codes) {
    const h = await bcrypt.hash(code.replace(/-/g, ""), 10);
    out.push(h);
  }
  return out;
}

/**
 * Match a user-supplied backup code against a list of stored hashes.
 * Returns the matched index (so the caller can mark it consumed) or -1.
 * Strips dashes / spaces before compare so users can paste either form.
 */
export async function findBackupCodeMatch(
  inputCode: string,
  storedHashes: string[],
): Promise<number> {
  const cleaned = inputCode.replace(/[\s-]/g, "");
  if (!/^\d{10}$/.test(cleaned)) return -1;
  for (let i = 0; i < storedHashes.length; i++) {
    if (!storedHashes[i]) continue;
    if (await bcrypt.compare(cleaned, storedHashes[i])) return i;
  }
  return -1;
}

/* ── Convenience: encode/decode the encrypted secret blob ─────────────── */

export interface StoredSecretRow {
  totp_secret_encrypted: string;
  totp_secret_iv: string;
  totp_secret_tag: string;
}

export function encryptSecretForStorage(secret: string): StoredSecretRow {
  const blob = encrypt(secret);
  return {
    totp_secret_encrypted: blob.ct,
    totp_secret_iv: blob.iv,
    totp_secret_tag: blob.tag,
  };
}

export function decryptSecretFromStorage(row: StoredSecretRow): string {
  const blob: EncryptedBlob = {
    ct: row.totp_secret_encrypted,
    iv: row.totp_secret_iv,
    tag: row.totp_secret_tag,
  };
  return decrypt(blob);
}
