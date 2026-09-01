// ─────────────────────────────────────────────────────────────────────────────
// POST /api/kyc/bank — route tests
// ─────────────────────────────────────────────────────────────────────────────
//
// Mock surfaces:
//   • @/lib/supabase/server::createClient → auth.getUser
//   • @/lib/supabase/admin::createAdminClient → creators / creator_kyc /
//                                               creator_bank_accounts chain mocks
//
// The external KYC provider is NOT configured (Cashfree removed; penny-drop
// and beneficiary registration pending). The route keeps its gates — auth
// (401), Zod validation (400), creator-only (403) — and then returns 503
// kyc_provider_unavailable for every valid submission WITHOUT persisting
// anything or calling any external API.
//
// Security invariants preserved:
//   • The full 9-18 digit account number MUST NOT be written to the DB
//     (no bank row is inserted at all while the provider is unavailable)
//   • creators.kyc_status must never flip to 'verified' through this stub
// ─────────────────────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();

interface AdminMocks {
  creatorLookup: ReturnType<typeof vi.fn>;
  kycLookup: ReturnType<typeof vi.fn>;
  bankCountLookup: ReturnType<typeof vi.fn>;
  bankInsert: ReturnType<typeof vi.fn>;
  bankUpdate: ReturnType<typeof vi.fn>;
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
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              maybeSingle: () =>
                (adminMocks.bankInsert as (r: unknown) => unknown)(row),
            }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: (col: string, val: string) =>
              (adminMocks.bankUpdate as (
                p: Record<string, unknown>,
                c: string,
                v: string,
              ) => Promise<{ error: unknown }>)(patch, col, val),
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
  const req = new Request("http://localhost/api/kyc/bank", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(req as unknown as Parameters<typeof POST>[0]);
}

function defaultMocks(): AdminMocks {
  return {
    creatorLookup: vi.fn().mockResolvedValue({
      data: { id: "creator-1", user_id: "user-1", kyc_status: "in_progress" },
      error: null,
    }),
    kycLookup: vi.fn().mockResolvedValue({
      data: {
        creator_id: "creator-1",
        pan_verification_status: "verified",
        aadhaar_verified_at: "2026-04-20T00:00:00Z",
        cf_beneficiary_id: null,
        status: "bank_pending",
      },
      error: null,
    }),
    bankCountLookup: vi.fn().mockResolvedValue({ count: 0, error: null }),
    bankInsert: vi.fn().mockResolvedValue({
      data: { id: "bank-1" },
      error: null,
    }),
    bankUpdate: vi.fn().mockResolvedValue({ error: null }),
    kycUpsert: vi.fn().mockResolvedValue({ error: null }),
    kycUpdate: vi.fn().mockResolvedValue({ error: null }),
    creatorUpdate: vi.fn().mockResolvedValue({ error: null }),
  };
}

/** Assert no admin write ever contained the raw account number as a string. */
function expectNoRawAccountPersisted(accountNumber: string) {
  const writeCalls = [
    ...adminMocks.bankInsert.mock.calls,
    ...adminMocks.bankUpdate.mock.calls,
    ...adminMocks.kycUpsert.mock.calls,
    ...adminMocks.kycUpdate.mock.calls,
    ...adminMocks.creatorUpdate.mock.calls,
  ];
  for (const call of writeCalls) {
    const row = call[0] as Record<string, unknown>;
    for (const value of Object.values(row)) {
      if (typeof value === "string") {
        expect(value).not.toContain(accountNumber);
      }
    }
  }
}

describe("POST /api/kyc/bank", () => {
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
      account_number: "123456789012",
      ifsc: "HDFC0001234",
      account_holder_name: "Priya Sharma",
    });
    expect(res.status).toBe(401);
  });

  it("403 when caller has no creator profile", async () => {
    adminMocks.creatorLookup.mockResolvedValue({ data: null, error: null });
    const res = await callRoute({
      account_number: "123456789012",
      ifsc: "HDFC0001234",
      account_holder_name: "Priya Sharma",
    });
    expect(res.status).toBe(403);
  });

  it("400 when IFSC format is invalid — nothing persisted", async () => {
    const res = await callRoute({
      account_number: "123456789012",
      ifsc: "XXXX123", // bad format
      account_holder_name: "Priya Sharma",
    });
    expect(res.status).toBe(400);
    expect(adminMocks.bankInsert).not.toHaveBeenCalled();
  });

  it("400 when account number is too short", async () => {
    const res = await callRoute({
      account_number: "12345", // too short
      ifsc: "HDFC0001234",
      account_holder_name: "Priya Sharma",
    });
    expect(res.status).toBe(400);
    expect(adminMocks.bankInsert).not.toHaveBeenCalled();
  });

  it("503 kyc_provider_unavailable for a valid submission — no bank row inserted", async () => {
    const res = await callRoute({
      account_number: "123456789012",
      ifsc: "HDFC0001234",
      account_holder_name: "Priya Sharma",
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("kyc_provider_unavailable");
    expect(body.message).toContain("support@faiceoff.com");

    // Stub contract: no bank row, no KYC row, no status flip — the full
    // account number never reaches the DB while the provider is unavailable.
    expect(adminMocks.bankInsert).not.toHaveBeenCalled();
    expect(adminMocks.bankUpdate).not.toHaveBeenCalled();
    expect(adminMocks.kycUpsert).not.toHaveBeenCalled();
    expect(adminMocks.creatorUpdate).not.toHaveBeenCalled();
    expectNoRawAccountPersisted("123456789012");
  });

  it("never flips creators.kyc_status to 'verified' through the stub", async () => {
    // Even with PAN + Aadhaar verified and an existing active bank account,
    // the stub must not complete the 3/3 rollup.
    adminMocks.bankCountLookup.mockResolvedValue({ count: 1, error: null });
    const res = await callRoute({
      account_number: "999988887777",
      ifsc: "HDFC0001234",
      account_holder_name: "Priya Sharma",
    });
    expect(res.status).toBe(503);
    const verifiedCall = adminMocks.creatorUpdate.mock.calls.find(
      (call) => (call[0] as Record<string, unknown>).kyc_status === "verified",
    );
    expect(verifiedCall).toBeUndefined();
  });

  it("never calls an external KYC provider (no network I/O)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await callRoute({
      account_number: "123456789012",
      ifsc: "HDFC0001234",
      account_holder_name: "Priya Sharma",
    });
    expect(res.status).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
