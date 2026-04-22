// ─────────────────────────────────────────────────────────────────────────────
// KYC at-rest encryption — AES-256-GCM wrappers for sensitive identity fields
// Ref migration 00024 (creator_kyc, creator_bank_accounts)
// Ref plan Phase 7 "Special: pgp_sym_encrypt from JS"
// ─────────────────────────────────────────────────────────────────────────────
//
// We store encrypted PAN + Aadhaar hash + bank account number as `bytea`
// columns. The plan proposed two options:
//   A. PL/pgSQL wrapper around pgp_sym_encrypt (requires a migration + RPC)
//   B. App-level `node:crypto` AES-GCM (simpler, no DB function, portable)
//
// We picked (B) because:
//   - No extra migration / RPC round-trip per write
//   - pgcrypto dependency is avoided on non-pg deployments (not our case today
//     but keeps the option open)
//   - The encrypted bytes are stored verbatim in the bytea column — Supabase
//     accepts Buffer inputs for bytea, so no base64 hop needed
//   - Decryption happens in app code (same trust boundary as the key)
//
// Format: [12-byte nonce][16-byte auth tag][ciphertext] packed into a single
// Buffer. This is a standard layout — any other GCM consumer can read it.
//
// Key handling: KYC_ENCRYPTION_KEY env var is a 64-char hex string (32 bytes).
// We read once at call time and surface a typed error if missing / malformed.
// Never log key material. Never accept the key from user input.
// ─────────────────────────────────────────────────────────────────────────────

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export class KycCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KycCryptoError";
  }
}

/**
 * Resolve the 32-byte encryption key from env. Exposed for tests.
 * Throws KycCryptoError if missing or malformed.
 */
export function resolveKey(): Buffer {
  const hex = process.env.KYC_ENCRYPTION_KEY;
  if (!hex) {
    throw new KycCryptoError("KYC_ENCRYPTION_KEY not set");
  }
  // 32 bytes = 64 hex chars. Allow uppercase too.
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new KycCryptoError(
      "KYC_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)",
    );
  }
  return Buffer.from(hex, "hex");
}

/**
 * Encrypt a UTF-8 plaintext string into a packed Buffer:
 *   [nonce(12)][tag(16)][ciphertext]
 * Safe to store directly in a bytea column.
 */
export function encryptKycValue(plaintext: string): Buffer {
  if (!plaintext) {
    throw new KycCryptoError("encryptKycValue requires a non-empty plaintext");
  }
  const key = resolveKey();
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([nonce, tag, ciphertext]);
}

/**
 * Decrypt a packed Buffer back to UTF-8 plaintext. Throws KycCryptoError if
 * authentication fails (tamper / wrong key) or the layout is too short.
 */
export function decryptKycValue(packed: Buffer): string {
  if (packed.length < NONCE_BYTES + AUTH_TAG_BYTES + 1) {
    throw new KycCryptoError("encrypted payload too short");
  }
  const nonce = packed.subarray(0, NONCE_BYTES);
  const tag = packed.subarray(NONCE_BYTES, NONCE_BYTES + AUTH_TAG_BYTES);
  const ciphertext = packed.subarray(NONCE_BYTES + AUTH_TAG_BYTES);
  const key = resolveKey();
  const decipher = createDecipheriv(ALGORITHM, key, nonce);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
      "utf8",
    );
  } catch (err) {
    throw new KycCryptoError(
      `decryption failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Deterministic salted hash for Aadhaar dedup lookups. Uses the KYC key as
 * the HMAC secret so the hash is stable across restarts but unrecoverable
 * without the key. Output: 64-char hex string.
 *
 * Aadhaar is HMAC'd (not encrypted) because the dedup lookup needs a stable
 * key; encryption with a random nonce would produce a new ciphertext every
 * time and break UNIQUE-index enforcement.
 */
export function hashAadhaar(aadhaar12: string): string {
  if (!/^[0-9]{12}$/.test(aadhaar12)) {
    throw new KycCryptoError("hashAadhaar requires a 12-digit Aadhaar");
  }
  const key = resolveKey();
  return createHmac("sha256", key).update(aadhaar12).digest("hex");
}
