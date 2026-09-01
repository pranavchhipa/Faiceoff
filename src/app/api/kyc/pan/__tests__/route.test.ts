// ─────────────────────────────────────────────────────────────────────────────
// POST /api/kyc/pan — route tests
// ─────────────────────────────────────────────────────────────────────────────
//
// Mock surfaces:
//   • @/lib/supabase/server::createClient → auth.getUser
//   • @/lib/supabase/admin::createAdminClient → table-specific chain mocks
//
// The external KYC provider is NOT configured (Cashfree removed; Razorpay/
// Signzy pending). The route keeps its gates — auth (401), Zod validation
// (400), creator-only (403) — and then returns 503 kyc_provider_unavailable
// for every valid submission WITHOUT persisting anything or calling any
// external API.
//
// Security invariants preserved:
//   • The raw PAN must never be written to the DB (no writes happen at all)
//   • creators.kyc_status must never flip to 'verified' through this stub
// ─────────────────────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();

interface AdminMocks {
  creatorLookup: ReturnType<typeof vi.fn>;
  kycLookup: ReturnType<typeof vi.fn>;
  kycUpsert: ReturnType<typeof vi.fn>;
  kycUpdate: ReturnType<typeof vi.fn>;
  creatorUpdate: ReturnType<typeof vi.fn>;
  bankCountLookup: ReturnType<typeof vi.fn>;
}

let adminMocks: AdminMocks;

function buildAdminClient() {
  return {
    from(table: string) {
      if (table === "creators") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: adminMocks.creatorLookup }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: (col: string, val: string) =>
              (adminMocks.creatorUpdate as (
                p: Record<string, unknown>,
                c: string,
                v: string,
              ) => Promise<{ error: unknown }>)(patch, col, val),
          }),
        };
      }
      if (table === "creator_kyc") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: adminMocks.kycLookup }),
          }),
          upsert: (row: Record<string, unknown>, opts?: unknown) =>
            (adminMocks.kycUpsert as (
              r: Record<string, unknown>,
              o?: unknown,
            ) => Promise<{ error: unknown }>)(row, opts),
          update: (patch: Record<string, unknown>) => ({
            eq: (col: string, val: string) =>
              (adminMocks.kycUpdate as (
                p: Record<string, unknown>,
                c: string,
                v: string,
              ) => Promise<{ error: unknown }>)(patch, col, val),
          }),
        };
      }
      if (table === "creator_bank_accounts") {
        return {
          select: (_cols: string, opts?: { count?: string; head?: boolean }) => ({
            eq: (_col: string, _val: string) =>
              (adminMocks.bankCountLookup as (o?: unknown) => unknown)(opts),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: getUserMock } }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => buildAdminClient(),
}));

async function callRoute(body: unknown) {
  const { POST } = await import("../route");
  const req = new Request("http://localhost/api/kyc/pan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(req as unknown as Parameters<typeof POST>[0]);
}

function defaultMocks(): AdminMocks {
  return {
    creatorLookup: vi.fn().mockResolvedValue({
      data: { id: "creator-1", kyc_status: "in_progress" },
      error: null,
    }),
    // Default: no KYC row yet.
    kycLookup: vi.fn().mockResolvedValue({
      data: null,
      error: null,
    }),
    kycUpsert: vi.fn().mockResolvedValue({ error: null }),
    kycUpdate: vi.fn().mockResolvedValue({ error: null }),
    creatorUpdate: vi.fn().mockResolvedValue({ error: null }),
    bankCountLookup: vi.fn().mockResolvedValue({ count: 0, error: null }),
  };
}

/** Assert no admin write ever contained the raw PAN as a string value. */
function expectNoRawPanPersisted(pan: string) {
  const writeCalls = [
    ...adminMocks.kycUpsert.mock.calls,
    ...adminMocks.kycUpdate.mock.calls,
    ...adminMocks.creatorUpdate.mock.calls,
  ];
  for (const call of writeCalls) {
    const row = call[0] as Record<string, unknown>;
    for (const value of Object.values(row)) {
      if (typeof value === "string") {
        expect(value).not.toContain(pan);
      }
    }
  }
}

describe("POST /api/kyc/pan", () => {
  beforeEach(() => {
    process.env.KYC_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    adminMocks = defaultMocks();
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1", email: "creator@test.com" } },
      error: null,
    });
  });

  afterEach(() => vi.clearAllMocks());

  it("401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const res = await callRoute({
      pan_number: "AAAPL1234C",
      name_as_per_pan: "Priya Sharma",
      is_gstin_registered: false,
    });
    expect(res.status).toBe(401);
  });

  it("403 when caller has no creator profile", async () => {
    adminMocks.creatorLookup.mockResolvedValue({ data: null, error: null });
    const res = await callRoute({
      pan_number: "AAAPL1234C",
      name_as_per_pan: "Priya Sharma",
      is_gstin_registered: false,
    });
    expect(res.status).toBe(403);
  });

  it("400 when PAN format is invalid — nothing persisted", async () => {
    const res = await callRoute({
      pan_number: "abc123", // bad format
      name_as_per_pan: "Priya Sharma",
      is_gstin_registered: false,
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_input");
    expect(adminMocks.kycUpsert).not.toHaveBeenCalled();
  });

  it("400 when is_gstin_registered=true but gstin is missing", async () => {
    const res = await callRoute({
      pan_number: "AAAPL1234C",
      name_as_per_pan: "Priya Sharma",
      is_gstin_registered: true,
    });
    expect(res.status).toBe(400);
    expect(adminMocks.kycUpsert).not.toHaveBeenCalled();
  });

  it("503 kyc_provider_unavailable for a valid submission — nothing persisted", async () => {
    const res = await callRoute({
      pan_number: "AAAPL1234C",
      name_as_per_pan: "Priya Sharma",
      is_gstin_registered: false,
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("kyc_provider_unavailable");
    expect(body.message).toContain("support@faiceoff.com");

    // Stub contract: no KYC row is written, so no PAN — encrypted or raw —
    // ever reaches the DB while the provider is unavailable.
    expect(adminMocks.kycUpsert).not.toHaveBeenCalled();
    expect(adminMocks.kycUpdate).not.toHaveBeenCalled();
    // kyc_status must never flip through the stub path.
    expect(adminMocks.creatorUpdate).not.toHaveBeenCalled();
    expectNoRawPanPersisted("AAAPL1234C");
  });

  it("503 also for a valid GSTIN-registered submission — gstin not persisted", async () => {
    const res = await callRoute({
      pan_number: "AAAPL1234C",
      name_as_per_pan: "Priya Sharma",
      is_gstin_registered: true,
      gstin: "27AAAPL1234C1Z5",
    });
    expect(res.status).toBe(503);
    expect(adminMocks.kycUpsert).not.toHaveBeenCalled();
  });

  it("never calls an external KYC provider (no network I/O)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await callRoute({
      pan_number: "AAAPL1234C",
      name_as_per_pan: "Priya Sharma",
      is_gstin_registered: false,
    });
    expect(res.status).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
