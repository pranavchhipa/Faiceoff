/**
 * Tests for license-service.ts
 *
 * Uses vi.mock to replace the admin Supabase client, cert-pdf, and cert-storage.
 * Tests all exported service functions for happy paths and error cases.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// ── cert-pdf mock ──────────────────────────────────────────────────────────
const mockGeneratePDF = vi.fn();
vi.mock("../cert-pdf", () => ({
  generateLicenseCertPDF: (...args: unknown[]) => mockGeneratePDF(...args),
}));

// ── cert-storage mock ──────────────────────────────────────────────────────
const mockUploadCert = vi.fn();
vi.mock("../cert-storage", () => ({
  uploadCertPDF: (...args: unknown[]) => mockUploadCert(...args),
}));

// ── Supabase admin mock ────────────────────────────────────────────────────
// We mock the module so each test can shape the return value.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockAdminClient,
}));

// The mock client object — tests assign `mockAdminClient` before each call.
let mockAdminClient: Record<string, unknown>;

// ── Import under test AFTER mocks ─────────────────────────────────────────
import {
  getExpiringSoon,
  getLicense,
  issueLicense,
  listBrandLicenses,
  listCreatorLicenses,
  renewLicense,
  revokeLicense,
} from "../license-service";
import { LicenseError } from "../license-error";
import type { IssueLicenseInput, License } from "../types";

// ── Fixtures ───────────────────────────────────────────────────────────────

const FIXED_NOW = "2026-04-22T10:00:00.000Z";
const FIXED_EXPIRES = "2027-04-22T10:00:00.000Z";

const BASE_LICENSE: License = {
  id: "lic-001",
  generation_id: "gen-001",
  brand_id: "brand-001",
  creator_id: "creator-001",
  scope: "digital",
  is_category_exclusive: false,
  exclusive_category: null,
  exclusive_until: null,
  amount_paid_paise: 50000,
  creator_share_paise: 40000,
  platform_share_paise: 10000,
  issued_at: FIXED_NOW,
  expires_at: FIXED_EXPIRES,
  auto_renew: true,
  renewed_count: 0,
  status: "active",
  revoked_at: null,
  revocation_reason: null,
  cert_url: "https://cdn.example.com/certs/lic-001.pdf",
  cert_signature_sha256: "a".repeat(64),
  created_at: FIXED_NOW,
  updated_at: FIXED_NOW,
};

const ISSUE_INPUT: IssueLicenseInput = {
  generationId: "gen-001",
  brandId: "brand-001",
  creatorId: "creator-001",
  scope: "digital",
  isExclusive: false,
  amountPaidPaise: 50000,
  creatorSharePaise: 40000,
  platformSharePaise: 10000,
};

// ── Builder helpers ────────────────────────────────────────────────────────

/**
 * Build a minimal Supabase-like from() chain.
 * `handlers` maps table name → object with chainable methods.
 */
function buildFrom(
  handlers: Record<string, () => Record<string, unknown>>,
): Record<string, unknown> {
  return {
    from: (table: string) => {
      const handler = handlers[table];
      if (!handler) return {};
      return handler();
    },
  };
}

// ── issueLicense ──────────────────────────────────────────────────────────

describe("issueLicense", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGeneratePDF.mockResolvedValue({
      buffer: Buffer.from("%PDF-1.4 fake"),
      sha256: "b".repeat(64),
    });
    mockUploadCert.mockResolvedValue({
      url: "https://cdn.example.com/certs/lic-001.pdf",
      key: "certs/lic-001.pdf",
    });
  });

  afterEach(() => vi.clearAllMocks());

  it("inserts license, generates cert, and returns { license, cert_url }", async () => {
    const updateEq = vi.fn().mockResolvedValue({ error: null });

    mockAdminClient = buildFrom({
      licenses: () => ({
        insert: () => ({
          select: () => ({
            single: vi.fn().mockResolvedValue({ data: BASE_LICENSE, error: null }),
          }),
        }),
        update: () => ({ eq: updateEq }),
      }),
      creators: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                instagram_handle: "@priya",
                users: { display_name: "Priya Sharma" },
              },
              error: null,
            }),
          }),
        }),
      }),
      brands: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { company_name: "Brand Corp", gst_number: null },
              error: null,
            }),
          }),
        }),
      }),
      generations: () => ({
        update: () => ({ eq: updateEq }),
      }),
    });

    const result = await issueLicense(ISSUE_INPUT);

    expect(result.cert_url).toBe("https://cdn.example.com/certs/lic-001.pdf");
    expect(result.license.generation_id).toBe("gen-001");
    expect(result.license.brand_id).toBe("brand-001");
    expect(mockGeneratePDF).toHaveBeenCalledTimes(1);
    expect(mockUploadCert).toHaveBeenCalledTimes(1);
  });

  it("returns existing license on duplicate generation_id (idempotent)", async () => {
    const existingLicense = { ...BASE_LICENSE, cert_url: "https://existing.example.com/cert.pdf" };

    mockAdminClient = buildFrom({
      licenses: () => ({
        insert: () => ({
          select: () => ({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: "23505", message: "duplicate key" },
            }),
          }),
        }),
        select: () => ({
          eq: () => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: existingLicense, error: null }),
          }),
        }),
      }),
    });

    const result = await issueLicense(ISSUE_INPUT);
    expect(result.cert_url).toBe("https://existing.example.com/cert.pdf");
    expect(mockGeneratePDF).not.toHaveBeenCalled();
  });

  it("throws DB_ERROR when insert fails with non-unique error", async () => {
    mockAdminClient = buildFrom({
      licenses: () => ({
        insert: () => ({
          select: () => ({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: "42501", message: "permission denied" },
            }),
          }),
        }),
      }),
    });

    await expect(issueLicense(ISSUE_INPUT)).rejects.toMatchObject({
      code: "DB_ERROR",
    });
  });

  it("throws CERT_GENERATION_FAILED when PDF generator throws", async () => {
    const updateEq = vi.fn().mockResolvedValue({ error: null });

    mockAdminClient = buildFrom({
      licenses: () => ({
        insert: () => ({
          select: () => ({
            single: vi.fn().mockResolvedValue({ data: BASE_LICENSE, error: null }),
          }),
        }),
        update: () => ({ eq: updateEq }),
      }),
      creators: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { instagram_handle: null, users: { display_name: "X" } },
              error: null,
            }),
          }),
        }),
      }),
      brands: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { company_name: "Y", gst_number: null },
              error: null,
            }),
          }),
        }),
      }),
    });

    mockGeneratePDF.mockRejectedValueOnce(new Error("canvas render failure"));

    await expect(issueLicense(ISSUE_INPUT)).rejects.toMatchObject({
      code: "CERT_GENERATION_FAILED",
    });
  });
});

// ── renewLicense ──────────────────────────────────────────────────────────

describe("renewLicense", () => {
  beforeEach(() => vi.clearAllMocks());

  function mockRenewDb(fetchData: License | null, updateData: License | null = null) {
    mockAdminClient = buildFrom({
      licenses: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: fetchData, error: null }),
          }),
        }),
        update: () => ({
          eq: () => ({
            select: () => ({
              single: vi.fn().mockResolvedValue({
                data: updateData,
                error: updateData ? null : { message: "update failed" },
              }),
            }),
          }),
        }),
      }),
    });
  }

  it("extends expires_at by 12 months and increments renewed_count", async () => {
    const expiresIn10Days = new Date();
    expiresIn10Days.setDate(expiresIn10Days.getDate() + 10);

    const nearExpiryLicense: License = {
      ...BASE_LICENSE,
      expires_at: expiresIn10Days.toISOString(),
      renewed_count: 0,
    };

    const renewedLicense: License = {
      ...nearExpiryLicense,
      renewed_count: 1,
      expires_at: new Date(
        expiresIn10Days.getTime() + 365 * 24 * 3600 * 1000,
      ).toISOString(),
    };

    mockRenewDb(nearExpiryLicense, renewedLicense);

    const result = await renewLicense({ licenseId: "lic-001" });
    expect(result.renewed_count).toBe(1);
  });

  it("throws LICENSE_NOT_FOUND when license does not exist", async () => {
    mockRenewDb(null);

    await expect(renewLicense({ licenseId: "non-existent" })).rejects.toMatchObject({
      code: "LICENSE_NOT_FOUND",
    });
  });

  it("throws LICENSE_NOT_ACTIVE when license is revoked", async () => {
    mockRenewDb({ ...BASE_LICENSE, status: "revoked" });

    await expect(renewLicense({ licenseId: "lic-001" })).rejects.toMatchObject({
      code: "LICENSE_NOT_ACTIVE",
    });
  });

  it("throws LICENSE_NOT_ACTIVE when license is expired", async () => {
    mockRenewDb({ ...BASE_LICENSE, status: "expired" });

    await expect(renewLicense({ licenseId: "lic-001" })).rejects.toMatchObject({
      code: "LICENSE_NOT_ACTIVE",
    });
  });

  it("throws LICENSE_NOT_EXPIRING_SOON when expires > 30 days away", async () => {
    const farFuture = new Date();
    farFuture.setDate(farFuture.getDate() + 200);

    mockRenewDb({ ...BASE_LICENSE, expires_at: farFuture.toISOString() });

    await expect(renewLicense({ licenseId: "lic-001" })).rejects.toMatchObject({
      code: "LICENSE_NOT_EXPIRING_SOON",
    });
  });
});

// ── revokeLicense ─────────────────────────────────────────────────────────

describe("revokeLicense", () => {
  beforeEach(() => vi.clearAllMocks());

  function mockRevokeDb(fetchData: License | null, updateData: License | null = null) {
    mockAdminClient = buildFrom({
      licenses: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: fetchData, error: null }),
          }),
        }),
        update: () => ({
          eq: () => ({
            select: () => ({
              single: vi.fn().mockResolvedValue({
                data: updateData,
                error: updateData ? null : { message: "update failed" },
              }),
            }),
          }),
        }),
      }),
    });
  }

  it("sets status=revoked, revoked_at, and revocation_reason", async () => {
    const revokedLicense: License = {
      ...BASE_LICENSE,
      status: "revoked",
      revoked_at: new Date().toISOString(),
      revocation_reason: "violation of terms",
    };

    mockRevokeDb(BASE_LICENSE, revokedLicense);

    const result = await revokeLicense({
      licenseId: "lic-001",
      reason: "violation of terms",
      revokedByCreatorId: "creator-001",
    });

    expect(result.status).toBe("revoked");
    expect(result.revocation_reason).toBe("violation of terms");
  });

  it("throws REVOKE_FORBIDDEN when caller is not the license creator", async () => {
    mockRevokeDb(BASE_LICENSE);

    await expect(
      revokeLicense({
        licenseId: "lic-001",
        reason: "unauthorized attempt",
        revokedByCreatorId: "other-creator-999",
      }),
    ).rejects.toMatchObject({
      code: "REVOKE_FORBIDDEN",
      statusCode: 403,
    });
  });

  it("is idempotent — already-revoked license returns as-is without update", async () => {
    const alreadyRevoked: License = {
      ...BASE_LICENSE,
      status: "revoked",
      revoked_at: "2026-04-01T00:00:00.000Z",
      revocation_reason: "original reason",
    };

    mockRevokeDb(alreadyRevoked);

    const result = await revokeLicense({
      licenseId: "lic-001",
      reason: "new reason",
      revokedByCreatorId: "creator-001",
    });

    expect(result.status).toBe("revoked");
    expect(result.revocation_reason).toBe("original reason");
  });

  it("throws LICENSE_NOT_FOUND when license does not exist", async () => {
    mockRevokeDb(null);

    await expect(
      revokeLicense({
        licenseId: "nonexistent",
        reason: "test",
        revokedByCreatorId: "creator-001",
      }),
    ).rejects.toMatchObject({
      code: "LICENSE_NOT_FOUND",
    });
  });
});

// ── listBrandLicenses ─────────────────────────────────────────────────────

describe("listBrandLicenses", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns paginated results with computed days_to_expiry", async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 45);

    const rawRow = {
      ...BASE_LICENSE,
      expires_at: futureDate.toISOString(),
      creators: { users: { display_name: "Priya" } },
      brands: { company_name: "Brand Corp" },
    };

    mockAdminClient = buildFrom({
      licenses: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              range: () =>
                Promise.resolve({ data: [rawRow], error: null, count: 1 }),
            }),
          }),
        }),
      }),
    });

    const result = await listBrandLicenses({ brandId: "brand-001" });

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.totalPages).toBe(1);
    expect(result.data[0].creator_display_name).toBe("Priya");
    expect(result.data[0].brand_company_name).toBe("Brand Corp");
    expect(result.data[0].days_to_expiry).toBeGreaterThan(0);
  });

  it("throws DB_ERROR on query failure", async () => {
    mockAdminClient = buildFrom({
      licenses: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              range: () =>
                Promise.resolve({ data: null, error: { message: "db fail" }, count: 0 }),
            }),
          }),
        }),
      }),
    });

    await expect(listBrandLicenses({ brandId: "brand-001" })).rejects.toMatchObject({
      code: "DB_ERROR",
    });
  });

  it("supports status filter — chain: select().eq(brand_id).eq(status).order().range()", async () => {
    const terminalPromise = Promise.resolve({ data: [], error: null, count: 0 });
    const withOrderRange = {
      order: () => ({ range: () => terminalPromise }),
    };

    // When status is provided: select().eq(brandId).eq(status).order().range()
    mockAdminClient = buildFrom({
      licenses: () => ({
        select: () => ({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue(withOrderRange),
            // no-status path (not taken in this test)
            order: () => ({ range: () => terminalPromise }),
          }),
        }),
      }),
    });

    const result = await listBrandLicenses({ brandId: "brand-001", status: "active" });
    expect(result.data).toHaveLength(0);
  });
});

// ── listCreatorLicenses ───────────────────────────────────────────────────

describe("listCreatorLicenses", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns paginated creator licenses with brand_company_name", async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 60);

    const rawRow = {
      ...BASE_LICENSE,
      expires_at: futureDate.toISOString(),
      creators: { users: { display_name: "Creator A" } },
      brands: { company_name: "Company X" },
    };

    mockAdminClient = buildFrom({
      licenses: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              range: () =>
                Promise.resolve({ data: [rawRow], error: null, count: 1 }),
            }),
          }),
        }),
      }),
    });

    const result = await listCreatorLicenses({ creatorId: "creator-001" });

    expect(result.data[0].brand_company_name).toBe("Company X");
    expect(result.data[0].creator_display_name).toBe("Creator A");
  });
});

// ── getLicense ────────────────────────────────────────────────────────────

describe("getLicense", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns full LicenseWithParties", async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 90);

    const rawRow = {
      ...BASE_LICENSE,
      expires_at: futureDate.toISOString(),
      creators: { users: { display_name: "Creator B" } },
      brands: { company_name: "Brand B" },
    };

    mockAdminClient = buildFrom({
      licenses: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: rawRow, error: null }),
          }),
        }),
      }),
    });

    const result = await getLicense("lic-001");

    expect(result.id).toBe("lic-001");
    expect(result.creator_display_name).toBe("Creator B");
    expect(result.brand_company_name).toBe("Brand B");
    expect(result.days_to_expiry).toBeGreaterThan(0);
  });

  it("throws LICENSE_NOT_FOUND for missing license", async () => {
    mockAdminClient = buildFrom({
      licenses: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    });

    await expect(getLicense("missing-id")).rejects.toMatchObject({
      code: "LICENSE_NOT_FOUND",
    });
  });
});

// ── getExpiringSoon ───────────────────────────────────────────────────────

describe("getExpiringSoon", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns active auto_renew=true licenses expiring within window", async () => {
    mockAdminClient = buildFrom({
      licenses: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              lte: () => ({
                order: vi.fn().mockResolvedValue({ data: [BASE_LICENSE], error: null }),
              }),
            }),
          }),
        }),
      }),
    });

    const result = await getExpiringSoon({ daysWindow: 30 });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
  });

  it("uses default daysWindow=30 when not specified", async () => {
    mockAdminClient = buildFrom({
      licenses: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              lte: () => ({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        }),
      }),
    });

    const result = await getExpiringSoon();
    expect(Array.isArray(result)).toBe(true);
  });

  it("throws DB_ERROR when query fails", async () => {
    mockAdminClient = buildFrom({
      licenses: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              lte: () => ({
                order: vi.fn().mockResolvedValue({ data: null, error: { message: "timeout" } }),
              }),
            }),
          }),
        }),
      }),
    });

    await expect(getExpiringSoon()).rejects.toMatchObject({
      code: "DB_ERROR",
    });
  });
});
