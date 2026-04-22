// ─────────────────────────────────────────────────────────────────────────────
// POST /api/withdrawals/create — route tests
// ─────────────────────────────────────────────────────────────────────────────
//
// Flow tested:
//   1. Auth gate (401 unauth / 403 non-creator)
//   2. Zod validation (below min / above max / bad uuid)
//   3. KYC + bank gate (verified creator with active bank)
//   4. Pending balance check — must cover gross
//   5. Insert withdrawal_requests row (status='requested')
//   6. Call commit_withdrawal_deductions RPC → deductions_applied
//   7. Call Cashfree createTransfer → status='processing'
//   8. Cashfree failure path → commit_withdrawal_failure called
// ─────────────────────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const createTransferMock = vi.fn();
const mapTransferStatusMock = vi.fn();
const commitDeductionsMock = vi.fn();
const commitFailureMock = vi.fn();

interface AdminMocks {
  creatorLookup: ReturnType<typeof vi.fn>;
  kycLookup: ReturnType<typeof vi.fn>;
  bankLookup: ReturnType<typeof vi.fn>;
  withdrawalInsert: ReturnType<typeof vi.fn>;
  withdrawalUpdate: ReturnType<typeof vi.fn>;
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
        };
      }
      if (table === "creator_kyc") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: adminMocks.kycLookup }),
          }),
        };
      }
      if (table === "creator_bank_accounts") {
        return {
          select: () => ({
            eq: (_c: string, _v: string) => ({
              // active-bank branch: eq(creator_id).eq(is_active, true).order.limit.maybeSingle
              // specific-id branch: eq(id).eq(creator_id).maybeSingle
              eq: () => ({
                order: () => ({
                  limit: () => ({ maybeSingle: adminMocks.bankLookup }),
                }),
                maybeSingle: adminMocks.bankLookup,
              }),
              maybeSingle: adminMocks.bankLookup,
            }),
          }),
        };
      }
      if (table === "withdrawal_requests") {
        return {
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              maybeSingle: () =>
                (adminMocks.withdrawalInsert as (r: unknown) => unknown)(row),
            }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: (col: string, val: string) =>
              (adminMocks.withdrawalUpdate as (
                p: Record<string, unknown>,
                c: string,
                v: string,
              ) => Promise<{ error: unknown }>)(patch, col, val),
          }),
          select: () => ({
            eq: () => ({ maybeSingle: vi.fn() }),
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

vi.mock("@/lib/payments/cashfree/payouts", () => ({
  createTransfer: createTransferMock,
  mapTransferStatus: mapTransferStatusMock,
}));

vi.mock("@/lib/ledger/commit", () => ({
  commitWithdrawalDeductions: commitDeductionsMock,
  commitWithdrawalFailure: commitFailureMock,
  LedgerError: class LedgerError extends Error {
    cause: unknown;
    constructor(msg: string, cause: unknown) {
      super(msg);
      this.name = "LedgerError";
      this.cause = cause;
    }
  },
}));

async function callRoute(body: unknown) {
  const { POST } = await import("../route");
  const req = new Request("http://localhost/api/withdrawals/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(req as unknown as Parameters<typeof POST>[0]);
}

function defaultMocks(): AdminMocks {
  return {
    creatorLookup: vi.fn().mockResolvedValue({
      data: {
        id: "creator-1",
        user_id: "user-1",
        kyc_status: "verified",
        pending_balance_paise: 100_000, // ₹1000 available
      },
      error: null,
    }),
    kycLookup: vi.fn().mockResolvedValue({
      data: {
        creator_id: "creator-1",
        pan_verification_status: "verified",
        aadhaar_verified_at: "2026-04-20T00:00:00Z",
        is_gstin_registered: false,
        cf_beneficiary_id: "user-1",
        status: "verified",
      },
      error: null,
    }),
    bankLookup: vi.fn().mockResolvedValue({
      data: {
        id: "bank-1",
        account_number_last4: "9012",
        ifsc: "HDFC0001234",
        bank_name: "HDFC BANK",
        cf_beneficiary_id: "user-1",
        is_active: true,
        penny_drop_verified_at: "2026-04-21T00:00:00Z",
      },
      error: null,
    }),
    withdrawalInsert: vi.fn().mockImplementation(async (_row) => ({
      data: {
        id: "wr-1",
        gross_paise: 50_000,
        tcs_paise: 0,
        tds_paise: 0,
        gst_output_paise: 0,
        net_paise: 50_000,
        status: "requested",
      },
      error: null,
    })),
    withdrawalUpdate: vi.fn().mockResolvedValue({ error: null }),
  };
}

describe("POST /api/withdrawals/create", () => {
  beforeEach(() => {
    process.env.KYC_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    adminMocks = defaultMocks();
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1", email: "creator@test.com" } },
      error: null,
    });
    createTransferMock.mockResolvedValue({
      transfer_id: "wr-1",
      status: "PROCESSING",
      cf_transfer_id: "CF_TRANSFER_ABC",
    });
    mapTransferStatusMock.mockReturnValue("processing");
    commitDeductionsMock.mockResolvedValue(undefined);
    commitFailureMock.mockResolvedValue(undefined);
  });

  afterEach(() => vi.clearAllMocks());

  it("401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const res = await callRoute({ amount_paise: 50_000 });
    expect(res.status).toBe(401);
  });

  it("403 when caller has no creator profile", async () => {
    adminMocks.creatorLookup.mockResolvedValue({ data: null, error: null });
    const res = await callRoute({ amount_paise: 50_000 });
    expect(res.status).toBe(403);
  });

  it("400 when amount below minimum (₹500)", async () => {
    const res = await callRoute({ amount_paise: 49_000 });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_input");
    expect(createTransferMock).not.toHaveBeenCalled();
  });

  it("400 when amount above maximum (₹10,00,000)", async () => {
    const res = await callRoute({ amount_paise: 200_000_000 });
    expect(res.status).toBe(400);
  });

  it("409 when creator KYC isn't verified", async () => {
    adminMocks.creatorLookup.mockResolvedValue({
      data: {
        id: "creator-1",
        user_id: "user-1",
        kyc_status: "in_progress",
        pending_balance_paise: 100_000,
      },
      error: null,
    });
    const res = await callRoute({ amount_paise: 50_000 });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("kyc_incomplete");
  });

  it("409 when no active bank account", async () => {
    adminMocks.bankLookup.mockResolvedValue({ data: null, error: null });
    const res = await callRoute({ amount_paise: 50_000 });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("no_active_bank");
  });

  it("409 when pending balance is insufficient", async () => {
    adminMocks.creatorLookup.mockResolvedValue({
      data: {
        id: "creator-1",
        user_id: "user-1",
        kyc_status: "verified",
        pending_balance_paise: 30_000, // below 50,000 gross
      },
      error: null,
    });
    const res = await callRoute({ amount_paise: 50_000 });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("insufficient_balance");
  });

  it("happy path: inserts withdrawal row + commits deductions + calls createTransfer", async () => {
    const res = await callRoute({ amount_paise: 50_000 });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.withdrawal_id).toBe("wr-1");
    expect(body.status).toBe("processing");

    // Insert row with gross + bank snapshot
    expect(adminMocks.withdrawalInsert).toHaveBeenCalled();
    const [insertedRow] = adminMocks.withdrawalInsert.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(insertedRow.creator_id).toBe("creator-1");
    expect(insertedRow.gross_paise).toBe(50_000);
    expect(insertedRow.bank_account_number_masked).toBe("9012");
    expect(insertedRow.bank_ifsc).toBe("HDFC0001234");
    expect(insertedRow.status).toBe("requested");

    // Deductions committed
    expect(commitDeductionsMock).toHaveBeenCalledWith("wr-1");

    // Cashfree transfer initiated
    expect(createTransferMock).toHaveBeenCalledWith(
      expect.objectContaining({
        transferId: "wr-1",
        beneficiaryId: "user-1",
        amountPaise: expect.any(Number), // net amount
      }),
    );
  });

  it("happy path: createTransfer called with NET amount (not gross)", async () => {
    // After deductions: gross=50000, tcs=500, tds=500, gst=0 (no gstin), net=49000
    adminMocks.withdrawalInsert.mockResolvedValue({
      data: {
        id: "wr-1",
        gross_paise: 50_000,
        tcs_paise: 500,
        tds_paise: 500,
        gst_output_paise: 0,
        net_paise: 49_000,
        status: "deductions_applied",
      },
      error: null,
    });
    // Simulate that after commitDeductions the route re-reads the row.
    await callRoute({ amount_paise: 50_000 });
    expect(createTransferMock).toHaveBeenCalledWith(
      expect.objectContaining({ amountPaise: 49_000 }),
    );
  });

  it("uses the specified bank_account_id when provided and active", async () => {
    await callRoute({
      amount_paise: 50_000,
      bank_account_id: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(createTransferMock).toHaveBeenCalled();
  });

  it("reverses via commitWithdrawalFailure when createTransfer throws", async () => {
    createTransferMock.mockRejectedValue(new Error("Cashfree timeout"));
    const res = await callRoute({ amount_paise: 50_000 });
    expect(res.status).toBe(502);
    expect(commitFailureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        withdrawalRequestId: "wr-1",
        reason: expect.stringContaining("Cashfree timeout"),
      }),
    );
  });

  it("returns 500 and does NOT call Cashfree when commitDeductions throws", async () => {
    commitDeductionsMock.mockRejectedValue(new Error("net must be positive"));
    const res = await callRoute({ amount_paise: 50_000 });
    expect(res.status).toBe(500);
    expect(createTransferMock).not.toHaveBeenCalled();
  });
});
