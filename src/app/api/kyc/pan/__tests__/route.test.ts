// ─────────────────────────────────────────────────────────────────────────────
// POST /api/kyc/pan — route tests
// ─────────────────────────────────────────────────────────────────────────────
//
// Mock surfaces:
//   • @/lib/supabase/server::createClient → auth.getUser
//   • @/lib/supabase/admin::createAdminClient → table-specific chain mocks
//   • @/lib/payments/cashfree/kyc::verifyPan
//   • @/lib/kyc/crypto::encryptKycValue (real impl ok too; mocked to speed up)
//
// Flow covered:
//   1. Auth gate (401 unauth, 403 non-creator)
//   2. Zod validation (invalid PAN format, missing GSTIN when flag true)
//   3. Cashfree call + persist (happy path)
//   4. Cashfree verification fails → 422 with name_match etc
//   5. Cashfree HTTP error → 502
//   6. 3/3 rollup: if PAN is the last step, creators.kyc_status → verified
// ─────────────────────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const verifyPanMock = vi.fn();

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

vi.mock("@/lib/payments/cashfree/kyc", () => ({
  verifyPan: verifyPanMock,
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
    // Default: no KYC row yet → upsert will create it.
    kycLookup: vi.fn().mockResolvedValue({
      data: null,
      error: null,
    }),
    // Default: no active bank account yet (3/3 rollup NOT complete yet).
    bankCountLookup: vi.fn().mockResolvedValue({ count: 0, error: null }),
    kycUpsert: vi.fn().mockResolvedValue({ error: null }),
    kycUpdate: vi.fn().mockResolvedValue({ error: null }),
    creatorUpdate: vi.fn().mockResolvedValue({ error: null }),
  };
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
    verifyPanMock.mockResolvedValue({
      verified: true,
      nameMatch: true,
      panName: "PRIYA SHARMA",
      raw: {},
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

  it("400 when PAN format is invalid", async () => {
    const res = await callRoute({
      pan_number: "abc123", // bad format
      name_as_per_pan: "Priya Sharma",
      is_gstin_registered: false,
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_input");
    // Cashfree must NOT be called on pre-flight format fail
    expect(verifyPanMock).not.toHaveBeenCalled();
  });

  it("400 when is_gstin_registered=true but gstin is missing", async () => {
    const res = await callRoute({
      pan_number: "AAAPL1234C",
      name_as_per_pan: "Priya Sharma",
      is_gstin_registered: true,
    });
    expect(res.status).toBe(400);
    expect(verifyPanMock).not.toHaveBeenCalled();
  });

  it("happy path: verified PAN is persisted + 3/3 NOT yet (no bank)", async () => {
    const res = await callRoute({
      pan_number: "AAAPL1234C",
      name_as_per_pan: "Priya Sharma",
      is_gstin_registered: false,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      pan_verified: true,
      name_match: true,
    });
    // Cashfree call made with uppercased trimmed inputs
    expect(verifyPanMock).toHaveBeenCalledWith(
      expect.objectContaining({ pan: "AAAPL1234C", name: "Priya Sharma" }),
    );
    // Upserted with encrypted PAN + verification status
    expect(adminMocks.kycUpsert).toHaveBeenCalled();
    const [upsertedRow] = adminMocks.kycUpsert.mock.calls[0] as [
      Record<string, unknown>,
      unknown,
    ];
    expect(upsertedRow.creator_id).toBe("creator-1");
    expect(upsertedRow.pan_verification_status).toBe("verified");
    expect(upsertedRow.pan_name).toBe("Priya Sharma");
    expect(Buffer.isBuffer(upsertedRow.pan_number_encrypted)).toBe(true);
    // Because bank_count is 0, creators.kyc_status stays 'in_progress' (no 3/3).
    // We accept either no call OR a call that does NOT set kyc_status='verified'.
    const creatorUpdateCalls = adminMocks.creatorUpdate.mock.calls;
    for (const call of creatorUpdateCalls) {
      const patch = call[0] as Record<string, unknown>;
      expect(patch.kyc_status).not.toBe("verified");
    }
  });

  it("happy path with GSTIN sets is_gstin_registered=true + gstin column", async () => {
    const res = await callRoute({
      pan_number: "AAAPL1234C",
      name_as_per_pan: "Priya Sharma",
      is_gstin_registered: true,
      gstin: "27AAAPL1234C1Z5",
    });
    expect(res.status).toBe(200);
    const [upsertedRow] = adminMocks.kycUpsert.mock.calls[0] as [
      Record<string, unknown>,
      unknown,
    ];
    expect(upsertedRow.is_gstin_registered).toBe(true);
    expect(upsertedRow.gstin).toBe("27AAAPL1234C1Z5");
  });

  it("422 when Cashfree says PAN is not verified", async () => {
    verifyPanMock.mockResolvedValue({
      verified: false,
      nameMatch: false,
      panName: undefined,
      raw: { status: "INVALID" },
    });
    const res = await callRoute({
      pan_number: "AAAPL1234C",
      name_as_per_pan: "Priya Sharma",
      is_gstin_registered: false,
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.pan_verified).toBe(false);
    // Row still upserted with pan_verification_status = 'failed' so UI can show the block
    expect(adminMocks.kycUpsert).toHaveBeenCalled();
    const [upsertedRow] = adminMocks.kycUpsert.mock.calls[0] as [
      Record<string, unknown>,
      unknown,
    ];
    expect(upsertedRow.pan_verification_status).toBe("failed");
  });

  it("502 when Cashfree throws (network error)", async () => {
    verifyPanMock.mockRejectedValue(new Error("Cashfree timeout"));
    const res = await callRoute({
      pan_number: "AAAPL1234C",
      name_as_per_pan: "Priya Sharma",
      is_gstin_registered: false,
    });
    expect(res.status).toBe(502);
  });

  it("transitions creators.kyc_status to 'verified' when PAN closes the 3/3 set", async () => {
    // Existing KYC row already has aadhaar + bank done; PAN was pending.
    adminMocks.kycLookup.mockResolvedValue({
      data: {
        creator_id: "creator-1",
        pan_verification_status: null,
        aadhaar_verified_at: "2026-04-20T00:00:00Z",
        status: "pan_pending",
      },
      error: null,
    });
    adminMocks.bankCountLookup.mockResolvedValue({ count: 1, error: null });

    const res = await callRoute({
      pan_number: "AAAPL1234C",
      name_as_per_pan: "Priya Sharma",
      is_gstin_registered: false,
    });
    expect(res.status).toBe(200);
    // creators update called with kyc_status='verified'
    const verifiedCall = adminMocks.creatorUpdate.mock.calls.find(
      (call) => (call[0] as Record<string, unknown>).kyc_status === "verified",
    );
    expect(verifiedCall).toBeDefined();
  });
});
