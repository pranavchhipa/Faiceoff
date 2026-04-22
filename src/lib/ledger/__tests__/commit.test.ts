// ─────────────────────────────────────────────────────────────────────────────
// commit.ts — shallow tests
//
// Integration tests for the PL/pgSQL procedures require a live Postgres with
// the 00020–00029 migrations applied. Those live in e2e (Playwright) land.
//
// Here we verify the TS wrappers: (a) each calls the correct RPC name with
// the correct param shape, (b) each throws LedgerError (not a raw error) when
// admin.rpc returns { error }, (c) success returns undefined.
// ─────────────────────────────────────────────────────────────────────────────

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  LedgerError,
  commitCreditReleaseReserve,
  commitCreditReserve,
  commitCreditSpend,
  commitExpiryRefund,
  commitImageApproval,
  commitLicenseAcceptance,
  commitTopUp,
  commitWithdrawalDeductions,
  commitWithdrawalFailure,
  commitWithdrawalSuccess,
} from "../commit";

type RpcFn = (name: string, params: Record<string, unknown>) =>
  Promise<{ data: unknown; error: { message: string } | null }>;

type MockRpc = ReturnType<typeof vi.fn>;

let mockRpc: MockRpc;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: mockRpc }),
}));

beforeEach(() => {
  // Default: every call returns success.
  mockRpc = vi.fn(() => Promise.resolve({ data: null, error: null }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("commitTopUp", () => {
  it("calls commit_top_up with the top-up id", async () => {
    await commitTopUp("tu-1");
    expect(mockRpc).toHaveBeenCalledWith("commit_top_up", {
      p_top_up_id: "tu-1",
    });
  });

  it("throws LedgerError when the RPC errors", async () => {
    mockRpc = vi.fn(() =>
      Promise.resolve({ data: null, error: { message: "boom" } }),
    ) as unknown as RpcFn as unknown as MockRpc;
    await expect(commitTopUp("tu-x")).rejects.toBeInstanceOf(LedgerError);
  });
});

describe("commitCreditReserve", () => {
  it("passes all 4 params in the expected shape", async () => {
    await commitCreditReserve({
      brandId: "b-1",
      amountPaise: 727440,
      refType: "license_request",
      refId: "lr-1",
    });
    expect(mockRpc).toHaveBeenCalledWith("commit_credit_reserve", {
      p_brand_id: "b-1",
      p_amount_paise: 727440,
      p_ref_type: "license_request",
      p_ref_id: "lr-1",
    });
  });
});

describe("commitCreditReleaseReserve", () => {
  it("calls commit_credit_release_reserve with correct params", async () => {
    await commitCreditReleaseReserve({
      brandId: "b-1",
      amountPaise: 727440,
      refType: "license_request",
      refId: "lr-1",
    });
    expect(mockRpc).toHaveBeenCalledWith("commit_credit_release_reserve", {
      p_brand_id: "b-1",
      p_amount_paise: 727440,
      p_ref_type: "license_request",
      p_ref_id: "lr-1",
    });
  });
});

describe("commitCreditSpend", () => {
  it("calls commit_credit_spend", async () => {
    await commitCreditSpend({
      brandId: "b-1",
      amountPaise: 100,
      refType: "license_request",
      refId: "lr-1",
    });
    expect(mockRpc).toHaveBeenCalledWith("commit_credit_spend", {
      p_brand_id: "b-1",
      p_amount_paise: 100,
      p_ref_type: "license_request",
      p_ref_id: "lr-1",
    });
  });
});

describe("commitLicenseAcceptance", () => {
  it("calls commit_license_acceptance with just the request id", async () => {
    await commitLicenseAcceptance("lr-42");
    expect(mockRpc).toHaveBeenCalledWith("commit_license_acceptance", {
      p_license_request_id: "lr-42",
    });
  });

  it("wraps underlying RPC errors in LedgerError", async () => {
    mockRpc = vi.fn(() =>
      Promise.resolve({
        data: null,
        error: { message: "status was not accepted" },
      }),
    ) as unknown as MockRpc;
    await expect(commitLicenseAcceptance("lr-99")).rejects.toMatchObject({
      name: "LedgerError",
    });
  });
});

describe("commitImageApproval", () => {
  it("passes isFinal as boolean flag", async () => {
    await commitImageApproval({ licenseRequestId: "lr-1", isFinal: true });
    expect(mockRpc).toHaveBeenCalledWith("commit_image_approval", {
      p_license_request_id: "lr-1",
      p_is_final: true,
    });
  });

  it("passes isFinal=false for non-final images", async () => {
    await commitImageApproval({ licenseRequestId: "lr-1", isFinal: false });
    expect(mockRpc).toHaveBeenCalledWith("commit_image_approval", {
      p_license_request_id: "lr-1",
      p_is_final: false,
    });
  });
});

describe("commitExpiryRefund", () => {
  it("calls commit_expiry_refund", async () => {
    await commitExpiryRefund("lr-exp");
    expect(mockRpc).toHaveBeenCalledWith("commit_expiry_refund", {
      p_license_request_id: "lr-exp",
    });
  });
});

describe("withdrawal wrappers", () => {
  it("commitWithdrawalDeductions calls correct RPC", async () => {
    await commitWithdrawalDeductions("w-1");
    expect(mockRpc).toHaveBeenCalledWith("commit_withdrawal_deductions", {
      p_withdrawal_request_id: "w-1",
    });
  });

  it("commitWithdrawalSuccess passes UTR", async () => {
    await commitWithdrawalSuccess({
      withdrawalRequestId: "w-1",
      cfUtr: "UTR123",
    });
    expect(mockRpc).toHaveBeenCalledWith("commit_withdrawal_success", {
      p_withdrawal_request_id: "w-1",
      p_cf_utr: "UTR123",
    });
  });

  it("commitWithdrawalFailure passes reason", async () => {
    await commitWithdrawalFailure({
      withdrawalRequestId: "w-1",
      reason: "bank rejected",
    });
    expect(mockRpc).toHaveBeenCalledWith("commit_withdrawal_failure", {
      p_withdrawal_request_id: "w-1",
      p_reason: "bank rejected",
    });
  });
});

describe("LedgerError", () => {
  it("carries the underlying cause", async () => {
    const underlying = { message: "invariant x", details: "xxx" };
    mockRpc = vi.fn(() =>
      Promise.resolve({ data: null, error: underlying }),
    ) as unknown as MockRpc;

    try {
      await commitTopUp("tu-1");
      expect.fail("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(LedgerError);
      expect((e as LedgerError).cause).toEqual(underlying);
      expect((e as LedgerError).message).toContain("invariant x");
    }
  });
});
