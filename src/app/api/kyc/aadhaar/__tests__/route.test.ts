// ─────────────────────────────────────────────────────────────────────────────
// POST /api/kyc/aadhaar — route tests
// ─────────────────────────────────────────────────────────────────────────────
//
// Security critical: we MUST NOT store the full 12-digit Aadhaar. We store:
//   • aadhaar_last4 — last 4 digits (plain text, UIDAI-compliant)
//   • aadhaar_hash  — salted HMAC(full_aadhaar) for dedup (unique constraint)
// The full number is in memory only for the Cashfree call. Never logged.
// ─────────────────────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const verifyAadhaarMock = vi.fn();

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

vi.mock("@/lib/payments/cashfree/kyc", () => ({
  verifyAadhaar: verifyAadhaarMock,
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

describe("POST /api/kyc/aadhaar", () => {
  beforeEach(() => {
    process.env.KYC_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    adminMocks = defaultMocks();
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    verifyAadhaarMock.mockResolvedValue({
      verified: true,
      nameMatch: true,
      confidence: 95,
      raw: {},
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

  it("400 when full_aadhaar is not 12 digits", async () => {
    const res = await callRoute({
      aadhaar_last4: "1234",
      full_aadhaar: "12345",
      name_as_per_aadhaar: "Priya Sharma",
    });
    expect(res.status).toBe(400);
    expect(verifyAadhaarMock).not.toHaveBeenCalled();
  });

  it("400 when last4 isn't 4 digits", async () => {
    const res = await callRoute({
      aadhaar_last4: "12",
      full_aadhaar: "123456781234",
      name_as_per_aadhaar: "Priya Sharma",
    });
    expect(res.status).toBe(400);
  });

  it("happy path: aadhaar_last4 + hash stored, NOT the full number", async () => {
    const res = await callRoute({
      aadhaar_last4: "1234",
      full_aadhaar: "123456781234",
      name_as_per_aadhaar: "Priya Sharma",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.aadhaar_verified).toBe(true);

    expect(adminMocks.kycUpsert).toHaveBeenCalled();
    const [upsertedRow] = adminMocks.kycUpsert.mock.calls[0] as [
      Record<string, unknown>,
      unknown,
    ];
    expect(upsertedRow.aadhaar_last4).toBe("1234");
    expect(upsertedRow.aadhaar_hash).toMatch(/^[0-9a-f]{64}$/);
    // NEVER persist the full number
    for (const value of Object.values(upsertedRow)) {
      if (typeof value === "string") {
        expect(value).not.toBe("123456781234");
      }
    }
  });

  it("happy path: Cashfree called with the full number + name", async () => {
    await callRoute({
      aadhaar_last4: "1234",
      full_aadhaar: "123456781234",
      name_as_per_aadhaar: "Priya Sharma",
    });
    expect(verifyAadhaarMock).toHaveBeenCalledWith(
      expect.objectContaining({
        aadhaarNumber: "123456781234",
        name: "Priya Sharma",
      }),
    );
  });

  it("422 when Cashfree says Aadhaar is not verified", async () => {
    verifyAadhaarMock.mockResolvedValue({
      verified: false,
      nameMatch: false,
      confidence: 10,
      raw: {},
    });
    const res = await callRoute({
      aadhaar_last4: "1234",
      full_aadhaar: "123456781234",
      name_as_per_aadhaar: "Priya Sharma",
    });
    expect(res.status).toBe(422);
  });

  it("502 when Cashfree throws", async () => {
    verifyAadhaarMock.mockRejectedValue(new Error("timeout"));
    const res = await callRoute({
      aadhaar_last4: "1234",
      full_aadhaar: "123456781234",
      name_as_per_aadhaar: "Priya Sharma",
    });
    expect(res.status).toBe(502);
  });

  it("transitions to verified when Aadhaar closes the 3/3 set (PAN + bank already done)", async () => {
    adminMocks.kycLookup.mockResolvedValue({
      data: {
        creator_id: "creator-1",
        pan_verification_status: "verified",
        aadhaar_verified_at: null,
        status: "aadhaar_pending",
      },
      error: null,
    });
    adminMocks.bankCountLookup.mockResolvedValue({ count: 1, error: null });

    const res = await callRoute({
      aadhaar_last4: "1234",
      full_aadhaar: "123456781234",
      name_as_per_aadhaar: "Priya Sharma",
    });
    expect(res.status).toBe(200);
    const verifiedCall = adminMocks.creatorUpdate.mock.calls.find(
      (call) => (call[0] as Record<string, unknown>).kyc_status === "verified",
    );
    expect(verifiedCall).toBeDefined();
  });
});
