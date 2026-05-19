// ─────────────────────────────────────────────────────────────────────────────
// Thin wrapper over the KYC encryption helpers — reuses KYC_ENCRYPTION_KEY
// (AES-256-GCM) so we don't need a separate key for Instagram tokens.
//
// The functions are byte-identical to encryptKycValue / decryptKycValue, just
// renamed for call-site clarity ("encryptIgToken" reads better than
// "encryptKycValue(igToken)" at the OAuth callback).
// ─────────────────────────────────────────────────────────────────────────────

import { encryptKycValue, decryptKycValue } from "@/lib/kyc/crypto";

export function encryptIgToken(plaintext: string): Buffer {
  return encryptKycValue(plaintext);
}

export function decryptIgToken(packed: Buffer): string {
  return decryptKycValue(packed);
}
