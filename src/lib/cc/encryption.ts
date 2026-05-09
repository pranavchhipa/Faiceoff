/**
 * AES-256-GCM helpers for the Control Centre TOTP secret + backup codes.
 *
 * Why GCM (vs CBC): GCM gives us authenticated encryption — the auth tag
 * detects any tampering with the ciphertext. CBC alone would silently
 * decrypt corrupted data into garbage that could break TOTP verification
 * in unsafe ways.
 *
 * Key source: process.env.OWNER_TOTP_KEY — must be a 64-char hex string
 * (32 bytes / 256 bits). Generate once with:
 *   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
 *
 * If the env key is missing OR malformed, every encrypt/decrypt call
 * throws — by design. We never want to silently fall back to a weak key.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit IV is the GCM standard

function getKey(): Buffer {
  const hex = process.env.OWNER_TOTP_KEY;
  if (!hex) {
    throw new Error(
      "OWNER_TOTP_KEY env var is required for the Control Centre. Generate one with: node -e \"console.log(require('node:crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  const buf = Buffer.from(hex.trim(), "hex");
  if (buf.length !== 32) {
    throw new Error(
      `OWNER_TOTP_KEY must be 64 hex chars (32 bytes); got ${buf.length} bytes after decode`,
    );
  }
  return buf;
}

export interface EncryptedBlob {
  /** base64 ciphertext */
  ct: string;
  /** base64 IV */
  iv: string;
  /** base64 auth tag */
  tag: string;
}

export function encrypt(plaintext: string): EncryptedBlob {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ct: ct.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decrypt(blob: EncryptedBlob): string {
  const key = getKey();
  const iv = Buffer.from(blob.iv, "base64");
  const ct = Buffer.from(blob.ct, "base64");
  const tag = Buffer.from(blob.tag, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

/** Constant-time string equality — for secret comparisons. */
export function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  // randomBytes-pad both to same length then constant-compare
  let mismatch = 0;
  for (let i = 0; i < ab.length; i++) {
    mismatch |= ab[i] ^ bb[i];
  }
  return mismatch === 0;
}
