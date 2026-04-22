// ─────────────────────────────────────────────────────────────────────────────
// KYC crypto helpers — round-trip + tamper detection
// ─────────────────────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  KycCryptoError,
  decryptKycValue,
  encryptKycValue,
  hashAadhaar,
  resolveKey,
} from "../crypto";

// Well-known 32-byte hex for deterministic tests (NOT for production use).
const TEST_KEY_HEX =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("KYC crypto", () => {
  let originalKey: string | undefined;

  beforeEach(() => {
    originalKey = process.env.KYC_ENCRYPTION_KEY;
    process.env.KYC_ENCRYPTION_KEY = TEST_KEY_HEX;
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.KYC_ENCRYPTION_KEY;
    } else {
      process.env.KYC_ENCRYPTION_KEY = originalKey;
    }
  });

  describe("resolveKey", () => {
    it("returns a 32-byte Buffer when the key is valid hex", () => {
      const key = resolveKey();
      expect(key.length).toBe(32);
    });

    it("throws when the env var is missing", () => {
      delete process.env.KYC_ENCRYPTION_KEY;
      expect(() => resolveKey()).toThrow(KycCryptoError);
      expect(() => resolveKey()).toThrow(/not set/);
    });

    it("throws when the key is not 64 hex chars", () => {
      process.env.KYC_ENCRYPTION_KEY = "abc";
      expect(() => resolveKey()).toThrow(/64-char hex/);
    });

    it("throws when the key contains non-hex characters", () => {
      process.env.KYC_ENCRYPTION_KEY = "z".repeat(64);
      expect(() => resolveKey()).toThrow(/64-char hex/);
    });
  });

  describe("encryptKycValue / decryptKycValue", () => {
    it("round-trips a PAN value exactly", () => {
      const plaintext = "AAAPL1234C";
      const encrypted = encryptKycValue(plaintext);
      expect(Buffer.isBuffer(encrypted)).toBe(true);
      // nonce(12) + tag(16) + ciphertext(≥1)
      expect(encrypted.length).toBeGreaterThanOrEqual(12 + 16 + 1);
      expect(decryptKycValue(encrypted)).toBe(plaintext);
    });

    it("produces different ciphertexts for the same plaintext (random nonce)", () => {
      const plaintext = "AAAPL1234C";
      const a = encryptKycValue(plaintext);
      const b = encryptKycValue(plaintext);
      expect(a.equals(b)).toBe(false);
      expect(decryptKycValue(a)).toBe(plaintext);
      expect(decryptKycValue(b)).toBe(plaintext);
    });

    it("rejects tampered ciphertext", () => {
      const encrypted = encryptKycValue("AAAPL1234C");
      const tampered = Buffer.from(encrypted);
      // Flip a byte deep in the ciphertext region (after nonce+tag).
      tampered[tampered.length - 1] = tampered[tampered.length - 1]! ^ 0x01;
      expect(() => decryptKycValue(tampered)).toThrow(KycCryptoError);
    });

    it("rejects a payload shorter than nonce + tag", () => {
      expect(() => decryptKycValue(Buffer.alloc(10))).toThrow(/too short/);
    });

    it("refuses to encrypt empty string", () => {
      expect(() => encryptKycValue("")).toThrow(/non-empty/);
    });
  });

  describe("hashAadhaar", () => {
    it("produces a stable 64-char hex for the same 12-digit input", () => {
      const h1 = hashAadhaar("123456789012");
      const h2 = hashAadhaar("123456789012");
      expect(h1).toBe(h2);
      expect(h1).toMatch(/^[0-9a-f]{64}$/);
    });

    it("produces different hashes for different Aadhaar numbers", () => {
      const h1 = hashAadhaar("123456789012");
      const h2 = hashAadhaar("123456789013");
      expect(h1).not.toBe(h2);
    });

    it("throws when Aadhaar is not exactly 12 digits", () => {
      expect(() => hashAadhaar("12345")).toThrow(/12-digit/);
      expect(() => hashAadhaar("abcdefghijkl")).toThrow(/12-digit/);
    });
  });
});
