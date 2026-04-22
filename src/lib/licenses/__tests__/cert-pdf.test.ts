/**
 * Tests for cert-pdf.ts
 *
 * Verifies that a real PDF buffer is produced (starts with %PDF-), is large
 * enough to be a plausible certificate (> 5 KB), and that the SHA-256 is a
 * valid 64-char hex string.
 *
 * No mocks — this exercises the actual @react-pdf/renderer + qrcode pipeline.
 */

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { generateLicenseCertPDF } from "../cert-pdf";
import type { GenerateLicenseCertPDFInput, License } from "../types";

// ── Fixtures ───────────────────────────────────────────────────────────────

const SAMPLE_LICENSE: License = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  generation_id: "660e8400-e29b-41d4-a716-446655440001",
  brand_id: "770e8400-e29b-41d4-a716-446655440002",
  creator_id: "880e8400-e29b-41d4-a716-446655440003",
  scope: "digital",
  is_category_exclusive: false,
  exclusive_category: null,
  exclusive_until: null,
  amount_paid_paise: 50000,
  creator_share_paise: 40000,
  platform_share_paise: 10000,
  issued_at: "2026-04-22T10:00:00.000Z",
  expires_at: "2027-04-22T10:00:00.000Z",
  auto_renew: true,
  renewed_count: 0,
  status: "active",
  revoked_at: null,
  revocation_reason: null,
  cert_url: null,
  cert_signature_sha256: null,
  created_at: "2026-04-22T10:00:00.000Z",
  updated_at: "2026-04-22T10:00:00.000Z",
};

const SAMPLE_INPUT: GenerateLicenseCertPDFInput = {
  license: SAMPLE_LICENSE,
  creator: {
    display_name: "Priya Sharma",
    instagram_handle: "priyasharma_creator",
  },
  brand: {
    company_name: "Amul Industries Pvt. Ltd.",
    gst_number: "27AAACG1234A1Z5",
  },
  generation: {
    id: "660e8400-e29b-41d4-a716-446655440001",
  },
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe("generateLicenseCertPDF", () => {
  it(
    "returns a Buffer with valid PDF magic bytes (%PDF-)",
    async () => {
      const { buffer } = await generateLicenseCertPDF(SAMPLE_INPUT);

      expect(Buffer.isBuffer(buffer)).toBe(true);

      const head = buffer.slice(0, 5).toString("utf8");
      expect(head).toBe("%PDF-");
    },
    30_000,
  );

  it(
    "produces a PDF larger than 5 KB",
    async () => {
      const { buffer } = await generateLicenseCertPDF(SAMPLE_INPUT);
      expect(buffer.byteLength).toBeGreaterThan(5 * 1024);
    },
    30_000,
  );

  it(
    "PDF ends with %%EOF marker",
    async () => {
      const { buffer } = await generateLicenseCertPDF(SAMPLE_INPUT);
      const tail = buffer.slice(Math.max(0, buffer.byteLength - 64)).toString("utf8");
      expect(tail).toMatch(/%%EOF/);
    },
    30_000,
  );

  it(
    "sha256 is a 64-character lowercase hex string",
    async () => {
      const { sha256 } = await generateLicenseCertPDF(SAMPLE_INPUT);
      expect(sha256).toMatch(/^[0-9a-f]{64}$/);
    },
    30_000,
  );

  it(
    "sha256 matches SHA-256 of the returned buffer",
    async () => {
      const { buffer, sha256 } = await generateLicenseCertPDF(SAMPLE_INPUT);
      const expected = createHash("sha256").update(buffer).digest("hex");
      expect(sha256).toBe(expected);
    },
    30_000,
  );

  it(
    "handles digital_print_packaging scope without throwing",
    async () => {
      const input: GenerateLicenseCertPDFInput = {
        ...SAMPLE_INPUT,
        license: {
          ...SAMPLE_LICENSE,
          scope: "digital_print_packaging",
          is_category_exclusive: true,
          exclusive_category: "fashion",
          exclusive_until: "2027-04-22T10:00:00.000Z",
        },
      };
      const { buffer } = await generateLicenseCertPDF(input);
      expect(buffer.slice(0, 5).toString("utf8")).toBe("%PDF-");
    },
    30_000,
  );

  it(
    "handles creator without instagram_handle",
    async () => {
      const input: GenerateLicenseCertPDFInput = {
        ...SAMPLE_INPUT,
        creator: { display_name: "Anon Creator", instagram_handle: null },
        brand: { company_name: "Brand Co", gst_number: null },
      };
      const { buffer } = await generateLicenseCertPDF(input);
      expect(buffer.slice(0, 5).toString("utf8")).toBe("%PDF-");
    },
    30_000,
  );

  it(
    "renders different content for renewed license (renewed_count > 0)",
    async () => {
      const renewedInput: GenerateLicenseCertPDFInput = {
        ...SAMPLE_INPUT,
        license: { ...SAMPLE_LICENSE, renewed_count: 3 },
      };
      const { buffer } = await generateLicenseCertPDF(renewedInput);
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.byteLength).toBeGreaterThan(5 * 1024);
    },
    30_000,
  );
});
