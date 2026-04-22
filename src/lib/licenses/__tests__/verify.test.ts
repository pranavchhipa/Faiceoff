/**
 * Tests for verify.ts — public license status endpoint.
 *
 * Verifies:
 * - The returned shape has NO PII (no emails, phones, GST, instagram handles).
 * - Only the explicitly allowed fields are present.
 * - LICENSE_NOT_FOUND is thrown for missing licenses.
 * - DB errors are re-thrown as LicenseError.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// Mock the admin client BEFORE importing the module under test.
const mockMaybeSingle = vi.fn();
const mockEq = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: mockFrom,
  }),
}));

// Import after mocks are declared.
import { getPublicLicenseStatus } from "../verify";
import { LicenseError } from "../license-error";
import type { PublicLicenseStatus } from "../types";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Set up the mock chain: from().select().eq().maybeSingle() */
function setupChain(result: unknown) {
  mockMaybeSingle.mockResolvedValueOnce(result);
  mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle });
  mockSelect.mockReturnValue({ eq: mockEq });
  mockFrom.mockReturnValue({ select: mockSelect });
}

const ALLOWED_KEYS: (keyof PublicLicenseStatus)[] = [
  "status",
  "issued_at",
  "expires_at",
  "scope",
  "brand_company_name",
  "creator_display_name",
  "generation_id",
];

// ── Tests ──────────────────────────────────────────────────────────────────

describe("getPublicLicenseStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns only allowed public fields — no PII", async () => {
    setupChain({
      data: {
        status: "active",
        issued_at: "2026-04-22T10:00:00.000Z",
        expires_at: "2027-04-22T10:00:00.000Z",
        scope: "digital",
        generation_id: "gen-id-123",
        brands: { company_name: "Amul Industries Pvt. Ltd." },
        creators: { users: { display_name: "Priya Sharma" } },
      },
      error: null,
    });

    const result = await getPublicLicenseStatus("lic-id-abc");

    // Only the allowed keys should be present
    const resultKeys = Object.keys(result);
    for (const key of resultKeys) {
      expect(ALLOWED_KEYS).toContain(key as keyof PublicLicenseStatus);
    }

    // All allowed keys should be present
    for (const key of ALLOWED_KEYS) {
      expect(resultKeys).toContain(key);
    }
  });

  it("result has correct values from DB row", async () => {
    setupChain({
      data: {
        status: "active",
        issued_at: "2026-04-22T10:00:00.000Z",
        expires_at: "2027-04-22T10:00:00.000Z",
        scope: "digital_print",
        generation_id: "gen-xyz-789",
        brands: { company_name: "Brand Corp" },
        creators: { users: { display_name: "Creator Name" } },
      },
      error: null,
    });

    const result = await getPublicLicenseStatus("lic-xyz");

    expect(result.status).toBe("active");
    expect(result.scope).toBe("digital_print");
    expect(result.brand_company_name).toBe("Brand Corp");
    expect(result.creator_display_name).toBe("Creator Name");
    expect(result.generation_id).toBe("gen-xyz-789");
    expect(result.issued_at).toBe("2026-04-22T10:00:00.000Z");
    expect(result.expires_at).toBe("2027-04-22T10:00:00.000Z");
  });

  it("does NOT include email, phone, gst_number, or instagram_handle in result", async () => {
    setupChain({
      data: {
        status: "revoked",
        issued_at: "2026-01-01T00:00:00.000Z",
        expires_at: "2027-01-01T00:00:00.000Z",
        scope: "digital",
        generation_id: "gen-revoked",
        // Simulate DB returning PII columns if someone widens the select —
        // our function should never include them in the return value.
        email: "secret@example.com",
        phone: "+91-9999999999",
        gst_number: "27AAACG1234A1Z5",
        brands: { company_name: "Revoked Brand", gst_number: "SHOULD_NOT_LEAK" },
        creators: {
          users: { display_name: "Creator", email: "creator@example.com" },
        },
      },
      error: null,
    });

    const result = await getPublicLicenseStatus("lic-revoked") as unknown as Record<string, unknown>;

    expect(result.email).toBeUndefined();
    expect(result.phone).toBeUndefined();
    expect(result.gst_number).toBeUndefined();
    expect(result.instagram_handle).toBeUndefined();
  });

  it("throws LICENSE_NOT_FOUND when license does not exist", async () => {
    setupChain({ data: null, error: null });

    let thrown: LicenseError | undefined;
    try {
      await getPublicLicenseStatus("non-existent-id");
    } catch (err) {
      thrown = err as LicenseError;
    }

    expect(thrown).toBeInstanceOf(LicenseError);
    expect(thrown?.code).toBe("LICENSE_NOT_FOUND");
    expect(thrown?.statusCode).toBe(404);
  });

  it("throws DB_ERROR when Supabase returns an error", async () => {
    setupChain({ data: null, error: { message: "connection refused" } });

    let thrown: LicenseError | undefined;
    try {
      await getPublicLicenseStatus("any-id");
    } catch (err) {
      thrown = err as LicenseError;
    }

    expect(thrown).toBeInstanceOf(LicenseError);
    expect(thrown?.code).toBe("DB_ERROR");
    expect(thrown?.statusCode).toBe(500);
  });

  it("falls back to 'Unknown Brand' when brands join is null", async () => {
    setupChain({
      data: {
        status: "active",
        issued_at: "2026-04-22T10:00:00.000Z",
        expires_at: "2027-04-22T10:00:00.000Z",
        scope: "digital",
        generation_id: "gen-null-brand",
        brands: null,
        creators: { users: { display_name: "Creator X" } },
      },
      error: null,
    });

    const result = await getPublicLicenseStatus("lic-null-brand");
    expect(result.brand_company_name).toBe("Unknown Brand");
  });

  it("falls back to 'Unknown Creator' when creators join is null", async () => {
    setupChain({
      data: {
        status: "expired",
        issued_at: "2025-04-22T10:00:00.000Z",
        expires_at: "2026-04-22T10:00:00.000Z",
        scope: "digital",
        generation_id: "gen-null-creator",
        brands: { company_name: "Brand Y" },
        creators: null,
      },
      error: null,
    });

    const result = await getPublicLicenseStatus("lic-null-creator");
    expect(result.creator_display_name).toBe("Unknown Creator");
  });

  it("passes the licenseId to the eq() filter", async () => {
    const licenseId = "specific-license-id-xyz";
    setupChain({
      data: {
        status: "active",
        issued_at: "2026-04-22T10:00:00.000Z",
        expires_at: "2027-04-22T10:00:00.000Z",
        scope: "digital",
        generation_id: "gen-check-filter",
        brands: { company_name: "Brand" },
        creators: { users: { display_name: "Creator" } },
      },
      error: null,
    });

    await getPublicLicenseStatus(licenseId);

    // Verify eq was called with the license ID
    expect(mockEq).toHaveBeenCalledWith("id", licenseId);
  });
});
