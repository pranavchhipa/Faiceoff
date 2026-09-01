// ─────────────────────────────────────────────────────────────────────────────
// POST /api/kyc/aadhaar — route tests
// ─────────────────────────────────────────────────────────────────────────────
//
// Security critical (UIDAI): the full 12-digit Aadhaar must NEVER be stored.
// The external KYC provider is NOT configured (Cashfree removed; Razorpay/
// Signzy pending). The route keeps its gates — auth (401), Zod validation +
// last4 cross-check (400), creator-only (403) — and then returns 503
// kyc_provider_unavailable for every valid submission WITHOUT persisting
// anything or calling any external API. That trivially (and importantly)
// upholds the invariant: the full Aadhaar never reaches the DB.
// ─────────────────────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();

interface AdminMocks {
  creatorLookup: ReturnType<typeof vi.fn>;
  kycLookup: ReturnType<typeof vi.fn>;
  bankCountLookup: ReturnType<typeof vi.fn>;
  kycUpsert: ReturnType<typeof vi.fn>;
  kycUpdate: ReturnType<typeof vi.fn>;
  creatorUpdate: ReturnType<typeof vi.fn>;
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
            eq: () =>
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
  const req = new Request("http://localhost/api/kyc/aadhaar", {
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
    kycLookup: vi.fn().mockResolvedValue({
      data: {
        creator_id: "creator-1",
        pan_verification_status: "verified",
        aadhaar_verified_at: null,
        status: "aadhaar_pending",
      },
      error: null,
    }),
    bankCountLookup: vi.fn().mockResolvedValue({ count: 0, error: null }),
    kycUpsert: vi.fn().mockResolvedValue({ error: null }),
    kycUpdate: vi.fn().mockResolvedValue({ error: null }),
    creatorUpdate: vi.fn().mockResolvedValue({ error: null }),
  };
}

/** Assert no admin write ever contained the full Aadhaar as a string value. */
function expectNoFullAadhaarPersisted(fullAadhaar: string) {
  const writeCalls = [
    ...adminMocks.kycUpsert.mock.calls,
    ...adminMocks.kycUpdate.mock.calls,
    ...adminMocks.creatorUpdate.mock.calls,
  ];
  for (const call of writeCalls) {
    const row = call[0] as Record<string, unknown>;
    for (const value of Object.values(row)) {
      if (typeof value === "string") {
        expect(value).not.toContain(fullAadhaar);
      }
    }
  }
}

describe("POST /api/kyc/aadhaar", () => {
  beforeEach(() => {
    process.env.KYC_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    adminMocks = defaultMocks();
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
  });

  afterEach(() => vi.clearAllMocks());

  it("401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const res = await callRoute({
      aadhaar_last4: "1234",
      full_aadhaar: "123456781234",
      name_as_per_aadhaar: "Priya Sharma",
    });
    expect(res.status).toBe(401);
  });

  it("403 when caller has no creator profile", async () => {
    adminMocks.creatorLookup.mockResolvedValue({ data: null, error: null });
    const res = await callRoute({
      aadhaar_last4: "1234",
      full_aadhaar: "123456781234",
      name_as_per_aadhaar: "Priya Sharma",
    });
    expect(res.status).toBe(403);
  });

  it("400 when full_aadhaar is not 12 digits — nothing persisted", async () => {
    const res = await callRoute({
      aadhaar_last4: "1234",
      full_aadhaar: "12345",
      name_as_per_aadhaar: "Priya Sharma",
    });
    expect(res.status).toBe(400);
    expect(adminMocks.kycUpsert).not.toHaveBeenCalled();
  });

  it("400 when last4 isn't 4 digits", async () => {
    const res = await callRoute({
      aadhaar_last4: "12",
      full_aadhaar: "123456781234",
      name_as_per_aadhaar: "Priya Sharma",
    });
    expect(res.status).toBe(400);
  });

  it("400 when declared last4 doesn't match the tail of full_aadhaar", async () => {
    const res = await callRoute({
      aadhaar_last4: "9999",
      full_aadhaar: "123456781234",
      name_as_per_aadhaar: "Priya Sharma",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.reason).toBe("last4_mismatch");
    expect(adminMocks.kycUpsert).not.toHaveBeenCalled();
  });

  it("503 kyc_provider_unavailable for a valid submission — nothing persisted", async () => {
    const res = await callRoute({
      aadhaar_last4: "1234",
      full_aadhaar: "123456781234",
      name_as_per_aadhaar: "Priya Sharma",
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("kyc_provider_unavailable");
    expect(body.message).toContain("support@faiceoff.com");

    // Stub contract: no KYC row is written — the full Aadhaar can never
    // reach the DB while the provider is unavailable.
    expect(adminMocks.kycUpsert).not.toHaveBeenCalled();
    expect(adminMocks.kycUpdate).not.toHaveBeenCalled();
    // kyc_status must never flip through the stub path.
    expect(adminMocks.creatorUpdate).not.toHaveBeenCalled();
    expectNoFullAadhaarPersisted("123456781234");
  });

  it("never calls an external KYC provider (no network I/O)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await callRoute({
      aadhaar_last4: "1234",
      full_aadhaar: "123456781234",
      name_as_per_aadhaar: "Priya Sharma",
    });
    expect(res.status).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
