// ─────────────────────────────────────────────────────────────────────────────
// POST /api/kyc/bank — route tests
// ─────────────────────────────────────────────────────────────────────────────
//
// Mock surfaces:
//   • @/lib/supabase/server::createClient → auth.getUser
//   • @/lib/supabase/admin::createAdminClient → creators / creator_kyc /
//                                               creator_bank_accounts chain mocks
//   • @/lib/payments/cashfree/kyc::pennyDrop
//   • @/lib/payments/cashfree/payouts::createBeneficiary
//
// Security invariants:
//   • The full 9-18 digit account number MUST NOT appear in the insert row
//     (only account_number_encrypted Buffer + account_number_last4 do)
//   • On verification failure we MUST NOT call createBeneficiary
// ─────────────────────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const pennyDropMock = vi.fn();
const createBeneficiaryMock = vi.fn();

interface AdminMocks {
  creatorLookup: ReturnType<typeof vi.fn>;
  kycLookup: ReturnType<typeof vi.fn>;
  bankCountLookup: ReturnType<typeof vi.fn>;
  bankInsert: ReturnType<typeof vi.fn>;
  bankUpdate: ReturnType<typeof vi.fn>;
  kycUpsert: ReturnType<typeof vi.fn>;
  kycUpdate: ReturnType<typeof vi.fn>;
  creatorUpdate: ReturnType<typeof vi.fn>;
  userLookup: ReturnType<typeof vi.fn>;
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
      if (table === "users") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: adminMocks.userLookup }),
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
          // Two callers here: one with count opts, one for plain insert /
          // deactivate update.
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

vi.mock("@/lib/payments/cashfree/kyc", () => ({
  pennyDrop: pennyDropMock,
}));

vi.mock("@/lib/payments/cashfree/payouts", () => ({
  createBeneficiary: createBeneficiaryMock,
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
    userLookup: vi.fn().mockResolvedValue({
      data: { id: "user-1", email: "creator@test.com", phone: null },
      error: null,
    }),
  };
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
    pennyDropMock.mockResolvedValue({
      success: true,
      actualName: "PRIYA SHARMA",
      matchScore: 95,
      raw: { bank_name: "HDFC BANK" },
    });
    createBeneficiaryMock.mockResolvedValue({
      beneficiary_id: "user-1",
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

  it("400 when IFSC format is invalid", async () => {
    const res = await callRoute({
      account_number: "123456789012",
      ifsc: "XXXX123", // bad format
      account_holder_name: "Priya Sharma",
    });
    expect(res.status).toBe(400);
    expect(pennyDropMock).not.toHaveBeenCalled();
  });

  it("400 when account number is too short", async () => {
    const res = await callRoute({
      account_number: "12345", // too short
      ifsc: "HDFC0001234",
      account_holder_name: "Priya Sharma",
    });
    expect(res.status).toBe(400);
    expect(pennyDropMock).not.toHaveBeenCalled();
  });

  it("happy path: bank row inserted with encrypted account + last4 — full number NOT persisted", async () => {
    const res = await callRoute({
      account_number: "123456789012",
      ifsc: "HDFC0001234",
      account_holder_name: "Priya Sharma",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bank_verified).toBe(true);

    expect(adminMocks.bankInsert).toHaveBeenCalled();
    const [insertedRow] = adminMocks.bankInsert.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(insertedRow.creator_id).toBe("creator-1");
    expect(insertedRow.account_number_last4).toBe("9012");
    expect(insertedRow.ifsc).toBe("HDFC0001234");
    expect(Buffer.isBuffer(insertedRow.account_number_encrypted)).toBe(true);
    // Full account number MUST NOT appear as any string value
    for (const value of Object.values(insertedRow)) {
      if (typeof value === "string") {
        expect(value).not.toBe("123456789012");
      }
    }
  });

  it("happy path: pennyDrop called with full account number + IFSC + name", async () => {
    await callRoute({
      account_number: "123456789012",
      ifsc: "HDFC0001234",
      account_holder_name: "Priya Sharma",
    });
    expect(pennyDropMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountNumber: "123456789012",
        ifsc: "HDFC0001234",
        expectedName: "Priya Sharma",
      }),
    );
  });

  it("happy path: createBeneficiary called with user_id as stable id", async () => {
    await callRoute({
      account_number: "123456789012",
      ifsc: "HDFC0001234",
      account_holder_name: "Priya Sharma",
    });
    expect(createBeneficiaryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        beneficiaryId: "user-1",
        bankAccountNumber: "123456789012",
        bankIfsc: "HDFC0001234",
      }),
    );
  });

  it("422 when pennyDrop says account is not valid — and beneficiary NOT created", async () => {
    pennyDropMock.mockResolvedValue({
      success: false,
      actualName: undefined,
      matchScore: 0,
      raw: { account_status: "INVALID" },
    });
    const res = await callRoute({
      account_number: "123456789012",
      ifsc: "HDFC0001234",
      account_holder_name: "Priya Sharma",
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.bank_verified).toBe(false);
    expect(createBeneficiaryMock).not.toHaveBeenCalled();
  });

  it("502 when pennyDrop throws", async () => {
    pennyDropMock.mockRejectedValue(new Error("Cashfree timeout"));
    const res = await callRoute({
      account_number: "123456789012",
      ifsc: "HDFC0001234",
      account_holder_name: "Priya Sharma",
    });
    expect(res.status).toBe(502);
    expect(createBeneficiaryMock).not.toHaveBeenCalled();
  });

  it("transitions creators.kyc_status='verified' when bank closes the 3/3 set", async () => {
    // PAN verified + Aadhaar verified already in defaults; bank is the last step.
    const res = await callRoute({
      account_number: "123456789012",
      ifsc: "HDFC0001234",
      account_holder_name: "Priya Sharma",
    });
    expect(res.status).toBe(200);
    const verifiedCall = adminMocks.creatorUpdate.mock.calls.find(
      (call) => (call[0] as Record<string, unknown>).kyc_status === "verified",
    );
    expect(verifiedCall).toBeDefined();
  });

  it("deactivates existing active bank when inserting a new one (one-active-only invariant)", async () => {
    // Simulate an existing active account.
    adminMocks.bankCountLookup.mockResolvedValue({ count: 1, error: null });
    await callRoute({
      account_number: "999988887777",
      ifsc: "HDFC0001234",
      account_holder_name: "Priya Sharma",
    });
    // Previous active accounts deactivated via bankUpdate({is_active:false})
    const deactivateCall = adminMocks.bankUpdate.mock.calls.find(
      (call) => (call[0] as Record<string, unknown>).is_active === false,
    );
    expect(deactivateCall).toBeDefined();
  });
});
