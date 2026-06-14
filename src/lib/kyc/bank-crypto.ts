// Shared AES-256-GCM helpers for creator bank account numbers.
// Format matches /api/creator/bank-account (iv:ciphertext:tag, all hex) so a
// value encrypted there decrypts here and in the Control Centre payout view.
// Key: KYC_ENCRYPTION_KEY (32-byte hex).

import crypto from "crypto";

const ALGO = "aes-256-gcm";
const KEY_HEX = process.env.KYC_ENCRYPTION_KEY ?? "";

export function encryptAccountNumber(plaintext: string): string {
  if (!KEY_HEX) throw new Error("KYC_ENCRYPTION_KEY not set");
  const key = Buffer.from(KEY_HEX, "hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${enc.toString("hex")}:${tag.toString("hex")}`;
}

/** Returns the full account number, or "" if the key is missing / value is corrupt. */
export function decryptAccountNumber(ciphertext: string | null | undefined): string {
  if (!ciphertext || !KEY_HEX) return "";
  try {
    const [ivHex, encHex, tagHex] = ciphertext.split(":");
    const key = Buffer.from(KEY_HEX, "hex");
    const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return decipher.update(Buffer.from(encHex, "hex")).toString("utf8") + decipher.final("utf8");
  } catch {
    return "";
  }
}

/** Last 4 digits of an encrypted account number (decrypts first). "" if unavailable. */
export function accountLast4(ciphertext: string | null | undefined): string {
  const full = decryptAccountNumber(ciphertext);
  return full.length >= 4 ? full.slice(-4) : "";
}

export function maskAccount(full: string): string {
  if (full.length <= 4) return "••••";
  return "•".repeat(full.length - 4) + full.slice(-4);
}
