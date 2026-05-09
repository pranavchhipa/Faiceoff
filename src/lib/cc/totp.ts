/**
 * TOTP (RFC 6238) helpers for the Control Centre — Google Authenticator
 * compatible.
 *
 * Uses the otplib v13 functional API:
 *   • generateSecret() → base32 string
 *   • generateURI(...) → otpauth:// URI for QR rendering
 *   • verifySync({ token, secret, ... }) → boolean
 *
 * 30-second period, 6 digits, SHA-1 (Authenticator default).
 * epochTolerance: 30s → accepts current ±1 step (≈ 90s window).
 */

import {
  generateSecret as otpGenerateSecret,
  generateURI,
  verifySync,
} from "otplib";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

import { decrypt, encrypt, type EncryptedBlob } from "./encryption";

const ISSUER = "Faiceoff";
const ACCOUNT = "Owner Control Centre";
const PERIOD = 30;
const DIGITS = 6;
const ALGORITHM = "sha1" as const;
const EPOCH_TOLERANCE = 30; // seconds — accept current ±1 step

export interface SecretBundle {
  /** Base32 secret — store encrypted via encrypt(). */
  secret: string;
  /** otpauth://… URI for QR encoding. */
  otpauthUri: string;
}

export function generateSecret(): SecretBundle {
  const secret = otpGenerateSecret({ length: 20 });
  const otpauthUri = generateURI({
    strategy: "totp",
    issuer: ISSUER,
    label: ACCOUNT,
    secret,
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD,
  });
  return { secret, otpauthUri };
}

export function verifyToken(secret: string, token: string): boolean {
  const cleaned = token.trim();
  if (!/^\d{6}$/.test(cleaned)) return false;
  try {
    const result = verifySync({
      token: cleaned,
      secret,
      strategy: "totp",
      algorithm: ALGORITHM,
      digits: DIGITS,
      period: PERIOD,
      epochTolerance: EPOCH_TOLERANCE,
    });
    return result.valid;
  } catch {
    return false;
  }
}

/* ── Backup codes ──────────────────────────────────────────────────────── */

const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_DIGITS = 10;

export interface BackupCode {
  code: string;
}

export function generateBackupCodes(): BackupCode[] {
  const out: BackupCode[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const buf = randomBytes(8);
    const num = buf.readBigUInt64BE() % 10n ** BigInt(BACKUP_CODE_DIGITS);
    const padded = num.toString().padStart(BACKUP_CODE_DIGITS, "0");
    out.push({
      code: `${padded.slice(0, 5)}-${padded.slice(5)}`,
    });
  }
  return out;
}

export async function hashBackupCodes(codes: BackupCode[]): Promise<string[]> {
  const out: string[] = [];
  for (const { code } of codes) {
    const h = await bcrypt.hash(code.replace(/-/g, ""), 10);
    out.push(h);
  }
  return out;
}

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
