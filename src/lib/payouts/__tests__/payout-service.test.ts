/**
 * Integration-style unit tests for payout-service.ts.
 *
 * All external dependencies (Supabase admin client, Cashfree adapter) are
 * mocked at the module boundary using Vitest's vi.mock(). Each test controls
 * the stub return values to exercise one code path in isolation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { PayoutError } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Mock factory helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Tracks the current admin client mock configured by each test. */
let currentAdminClient: ReturnType<typeof buildAdminClient>;

function buildAdminClient(fromFn: (table: string) => unknown) {
  return {
    from: fromFn,
    rpc: mockRpc,
  };
}

/** Creates a chainable Supabase select query stub. */
function selectChain(terminalResult: { data: unknown; error: null | { message: string }; count?: number }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(terminalResult),
    maybeSingle: vi.fn().mockResolvedValue(terminalResult),
    single: vi.fn().mockResolvedValue(terminalResult),
    range: vi.fn().mockResolvedValue(terminalResult),
  };
}

/** Creates a chainable Supabase update query stub. */
function updateChain(result: { data: unknown; error: null | { message: string } }) {
  const chain: Record<string, unknown> = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  };
  // Make the chain thenable so fire-and-forget awaits resolve.
  chain.then = (resolve: (v: typeof result) => void) => Promise.resolve(resolve(result));
  return chain;
}

// ─────────────────────────────────────────────────────────────────────────────
// Module mocks — must be at the top level (Vitest hoists vi.mock calls)
// ─────────────────────────────────────────────────────────────────────────────

const mockRpc = vi.fn();
const mockEnsureBeneficiary = vi.fn().mockResolvedValue(undefined);
const mockSubmitTransfer = vi.fn().mockResolvedValue({
  cfTransferId: "cf_transfer_test_123",
  rawStatus: "PROCESSING",
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => currentAdminClient),
}));

vi.mock("../cashfree-payout-adapter", () => ({
  ensureBeneficiary: (...args: unknown[]) => mockEnsureBeneficiary(...args),
  submitTransfer: (...args: unknown[]) => mockSubmitTransfer(...args),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const CREATOR_ID = "creator-uuid-001";
const BANK_ID = "bank-uuid-001";
const PAYOUT_ID = "payout-uuid-001";

const VERIFIED_CREATOR = {
  id: CREATOR_ID,
  user_id: "user-uuid-001",
  kyc_status: "verified",
  pending_balance_paise: 200_000,
};

const ACTIVE_BANK = {
  id: BANK_ID,
  creator_id: CREATOR_ID,
  account_number_last4: "4321",
  ifsc: "HDFC0001234",
  bank_name: "HDFC Bank",
  account_holder_name: "Test Creator",
  is_active: true,
  cf_beneficiary_id: "cf_ben_creator-uuid-001",
};

// Two rows: 75k + 75k = 150k total, needed when requesting 100k gross.
const ESCROW_ROWS = [
  { id: "escrow-001", amount_paise: 75_000, created_at: "2026-04-15T00:00:00Z" },
  { id: "escrow-002", amount_paise: 75_000, created_at: "2026-04-16T00:00:00Z" },
];

const PAYOUT_ROW_REQUESTED = {
  id: PAYOUT_ID,
  creator_id: CREATOR_ID,
  gross_amount_paise: 100_000,
  tds_amount_paise: 1_000,
  processing_fee_paise: 2_500,
  net_amount_paise: 96_500,
  status: "requested" as const,
  cf_transfer_id: null,
  bank_account_last4: "4321",
  failure_reason: null,
  requested_at: "2026-04-23T00:00:00Z",
  completed_at: null,
  escrow_ledger_ids: ["escrow-001", "escrow-002"],
};

const PAYOUT_ROW_PROCESSING = {
  ...PAYOUT_ROW_REQUESTED,
  status: "processing" as const,
  cf_transfer_id: "cf_transfer_test_123",
};

// ─────────────────────────────────────────────────────────────────────────────
// Import subject under test
// ─────────────────────────────────────────────────────────────────────────────

// Imported after mocks are registered.
import { requestPayout, handlePayoutWebhook } from "../payout-service";

beforeEach(() => {
  vi.clearAllMocks();
  // Reset default adapter mocks.
  mockEnsureBeneficiary.mockResolvedValue(undefined);
  mockSubmitTransfer.mockResolvedValue({
    cfTransferId: "cf_transfer_test_123",
    rawStatus: "PROCESSING",
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: build from() sequences for requestPayout
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a from() factory that sequences responses for the requestPayout flow:
 *  call 1 → creators  (maybeSingle)
 *  call 2 → creator_bank_accounts  (maybeSingle)
 *  call 3 → escrow_ledger  (order)
 *  call 4 → creator_payouts update  (single)
 */
function makeRequestPayoutFrom(overrides: {
  creatorData?: unknown;
  creatorError?: { message: string } | null;
  bankData?: unknown;
  bankError?: { message: string } | null;
  escrowData?: unknown;
  escrowError?: { message: string } | null;
  updateData?: unknown;
  updateError?: { message: string } | null;
}) {
  const {
    creatorData = VERIFIED_CREATOR,
    creatorError = null,
    bankData = ACTIVE_BANK,
    bankError = null,
    escrowData = ESCROW_ROWS,
    escrowError = null,
    updateData = PAYOUT_ROW_PROCESSING,
    updateError = null,
  } = overrides;

  let call = 0;
  return (_table: string) => {
    call++;
    if (call === 1) {
      return selectChain({ data: creatorData, error: creatorError });
    }
    if (call === 2) {
      return selectChain({ data: bankData, error: bankError });
    }
    if (call === 3) {
      return selectChain({ data: escrowData, error: escrowError });
    }
    if (call === 4) {
      return updateChain({ data: updateData, error: updateError });
    }
    // Fallback for any additional calls (fire-and-forget updates on rollback paths).
    return updateChain({ data: null, error: null });
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// requestPayout tests
// ─────────────────────────────────────────────────────────────────────────────

describe("requestPayout", () => {
  it("throws KYC_NOT_VERIFIED when creator kyc_status is not verified", async () => {
    currentAdminClient = buildAdminClient(
      makeRequestPayoutFrom({
        creatorData: { ...VERIFIED_CREATOR, kyc_status: "in_progress" },
      }),
    );

    await expect(
      requestPayout({ creatorId: CREATOR_ID, amountPaise: 100_000 }),
    ).rejects.toMatchObject({ code: "KYC_NOT_VERIFIED" });

    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockSubmitTransfer).not.toHaveBeenCalled();
  });

  it("throws BANK_ACCOUNT_MISSING when no active bank account exists", async () => {
    currentAdminClient = buildAdminClient(
      makeRequestPayoutFrom({ bankData: null }),
    );

    await expect(
      requestPayout({ creatorId: CREATOR_ID, amountPaise: 100_000 }),
    ).rejects.toMatchObject({ code: "BANK_ACCOUNT_MISSING" });
  });

  it("throws BELOW_MIN_PAYOUT when amountPaise < 50000", async () => {
    currentAdminClient = buildAdminClient(makeRequestPayoutFrom({}));

    await expect(
      requestPayout({ creatorId: CREATOR_ID, amountPaise: 49_999 }),
    ).rejects.toMatchObject({ code: "BELOW_MIN_PAYOUT" });
  });

  it("throws INSUFFICIENT_AVAILABLE when no escrow rows exist", async () => {
    currentAdminClient = buildAdminClient(
      makeRequestPayoutFrom({ escrowData: [] }),
    );

    await expect(
      requestPayout({ creatorId: CREATOR_ID, amountPaise: 100_000 }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_AVAILABLE" });

    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("throws INSUFFICIENT_AVAILABLE when escrow total < requested gross", async () => {
    currentAdminClient = buildAdminClient(
      makeRequestPayoutFrom({
        escrowData: [{ id: "escrow-tiny", amount_paise: 30_000, created_at: "2026-04-15T00:00:00Z" }],
      }),
    );

    await expect(
      requestPayout({ creatorId: CREATOR_ID, amountPaise: 100_000 }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_AVAILABLE" });
  });

  it("calls RPC with correct TDS/fee/net deductions", async () => {
    mockRpc.mockResolvedValue({ data: PAYOUT_ROW_REQUESTED, error: null });
    currentAdminClient = buildAdminClient(makeRequestPayoutFrom({}));

    await requestPayout({ creatorId: CREATOR_ID, amountPaise: 100_000 });

    // TDS = 1% of 100000 = 1000; fee = 2500; net = 96500
    expect(mockRpc).toHaveBeenCalledWith("request_payout", {
      p_creator_id: CREATOR_ID,
      p_amount_paise: 100_000,
      p_tds_paise: 1_000,
      p_fee_paise: 2_500,
      p_net_paise: 96_500,
      p_bank_last4: "4321",
      // Greedy: escrow-001 (75k) alone < 100k, so escrow-002 (75k) added: 150k >= 100k
      p_escrow_ids: ["escrow-001", "escrow-002"],
    });
  });

  it("calls Cashfree adapter with NET amount (not gross)", async () => {
    mockRpc.mockResolvedValue({ data: PAYOUT_ROW_REQUESTED, error: null });
    currentAdminClient = buildAdminClient(makeRequestPayoutFrom({}));

    await requestPayout({ creatorId: CREATOR_ID, amountPaise: 100_000 });

    expect(mockSubmitTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        amountPaise: 96_500,          // net, not gross
        beneficiaryId: ACTIVE_BANK.cf_beneficiary_id,
        payoutId: PAYOUT_ID,
      }),
    );
  });

  it("returns payout in processing status on happy path", async () => {
    mockRpc.mockResolvedValue({ data: PAYOUT_ROW_REQUESTED, error: null });
    currentAdminClient = buildAdminClient(makeRequestPayoutFrom({}));

    const result = await requestPayout({ creatorId: CREATOR_ID, amountPaise: 100_000 });

    expect(result).toMatchObject({
      id: PAYOUT_ID,
      creator_id: CREATOR_ID,
      status: "processing",
      cf_transfer_id: "cf_transfer_test_123",
      gross_amount_paise: 100_000,
      tds_amount_paise: 1_000,
      processing_fee_paise: 2_500,
      net_amount_paise: 96_500,
    });
  });

  it("throws ESCROW_LOCK_RACE when RPC fails with race condition", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "Failed to lock all escrow rows (race condition)" },
    });
    currentAdminClient = buildAdminClient(makeRequestPayoutFrom({}));

    await expect(
      requestPayout({ creatorId: CREATOR_ID, amountPaise: 100_000 }),
    ).rejects.toMatchObject({ code: "ESCROW_LOCK_RACE" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handlePayoutWebhook tests
// ─────────────────────────────────────────────────────────────────────────────

describe("handlePayoutWebhook", () => {
  /** Build admin client for webhook path. call 1 = lookup, 2+ = updates. */
  function makeWebhookFrom(
    payoutLookup: { id: string; status: string } | null,
    lookupError: { message: string } | null = null,
  ) {
    let call = 0;
    return (_table: string) => {
      call++;
      if (call === 1) {
        return selectChain({ data: payoutLookup, error: lookupError });
      }
      // Update calls (success / failure / escrow release).
      return updateChain({ data: {}, error: null });
    };
  }

  it("marks payout success on TRANSFER_SUCCESS", async () => {
    currentAdminClient = buildAdminClient(
      makeWebhookFrom({ id: PAYOUT_ID, status: "processing" }),
    );

    await expect(
      handlePayoutWebhook({
        cfTransferId: "cf_transfer_test_123",
        type: "TRANSFER_SUCCESS",
      }),
    ).resolves.toBeUndefined();
  });

  it("marks payout failed and releases escrow on TRANSFER_FAILED", async () => {
    currentAdminClient = buildAdminClient(
      makeWebhookFrom({ id: PAYOUT_ID, status: "processing" }),
    );

    await expect(
      handlePayoutWebhook({
        cfTransferId: "cf_transfer_test_123",
        type: "TRANSFER_FAILED",
        failureReason: "Insufficient bank balance",
      }),
    ).resolves.toBeUndefined();
  });

  it("marks payout reversed on TRANSFER_REVERSED", async () => {
    currentAdminClient = buildAdminClient(
      makeWebhookFrom({ id: PAYOUT_ID, status: "processing" }),
    );

    await expect(
      handlePayoutWebhook({
        cfTransferId: "cf_transfer_test_123",
        type: "TRANSFER_REVERSED",
      }),
    ).resolves.toBeUndefined();
  });

  it("is idempotent — does nothing for unknown cf_transfer_id", async () => {
    currentAdminClient = buildAdminClient(makeWebhookFrom(null));

    await expect(
      handlePayoutWebhook({
        cfTransferId: "unknown-cf-id",
        type: "TRANSFER_SUCCESS",
      }),
    ).resolves.toBeUndefined();
  });

  it("is idempotent — does nothing when payout is already success", async () => {
    currentAdminClient = buildAdminClient(
      makeWebhookFrom({ id: PAYOUT_ID, status: "success" }),
    );

    await expect(
      handlePayoutWebhook({
        cfTransferId: "cf_transfer_test_123",
        type: "TRANSFER_SUCCESS",
      }),
    ).resolves.toBeUndefined();
  });

  it("throws PayoutError on DB lookup error", async () => {
    currentAdminClient = buildAdminClient(
      makeWebhookFrom(null, { message: "Connection timeout" }),
    );

    await expect(
      handlePayoutWebhook({
        cfTransferId: "cf_transfer_test_123",
        type: "TRANSFER_SUCCESS",
      }),
    ).rejects.toBeInstanceOf(PayoutError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PayoutError tests
// ─────────────────────────────────────────────────────────────────────────────

describe("PayoutError", () => {
  it("has the correct name and code", () => {
    const err = new PayoutError("KYC_NOT_VERIFIED", "KYC check failed");
    expect(err.name).toBe("PayoutError");
    expect(err.code).toBe("KYC_NOT_VERIFIED");
    expect(err.message).toBe("KYC check failed");
  });

  it("is an instance of Error", () => {
    const err = new PayoutError("DB_ERROR", "DB down");
    expect(err).toBeInstanceOf(Error);
  });

  it("is an instance of PayoutError", () => {
    const err = new PayoutError("CASHFREE_ERROR", "API timeout");
    expect(err).toBeInstanceOf(PayoutError);
  });
});
