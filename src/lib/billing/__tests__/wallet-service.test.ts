// ─────────────────────────────────────────────────────────────────────────────
// wallet-service.test.ts — tests for all wallet service functions.
//
// Mocks callBillingRpc (via rpc.ts) and createAdminClient (for getWallet).
// Verifies correct RPC names, params, return value shapes, and error propagation.
// ─────────────────────────────────────────────────────────────────────────────

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { BillingError } from "../errors";

// ─────────────────────────────────────────────────────────────────────────────
// Mock setup
// ─────────────────────────────────────────────────────────────────────────────

let mockRpc: ReturnType<typeof vi.fn>;
let mockFrom: ReturnType<typeof vi.fn>;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

vi.mock("../rpc", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callBillingRpc: (...args: unknown[]) => (mockRpc as any)(...args),
  billingAdmin: vi.fn(),
}));

function makeMaybeSingle(result: unknown) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

beforeEach(() => {
  mockRpc = vi.fn();
  mockFrom = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// addWallet
// ─────────────────────────────────────────────────────────────────────────────

describe("addWallet", () => {
  it("calls add_wallet_for_topup with correct params", async () => {
    mockRpc.mockResolvedValue({ added: 100000, new_balance: 100000, idempotent: false });

    const { addWallet } = await import("../wallet-service");
    const result = await addWallet({ brandId: "brand-1", topUpId: "wtu-1" });

    expect(mockRpc).toHaveBeenCalledWith("add_wallet_for_topup", {
      p_brand_id:  "brand-1",
      p_top_up_id: "wtu-1",
    });

    expect(result).toEqual({ added: 100000, newBalance: 100000, idempotent: false });
  });

  it("returns idempotent=true on repeated call", async () => {
    mockRpc.mockResolvedValue({ added: 0, new_balance: 100000, idempotent: true });

    const { addWallet } = await import("../wallet-service");
    const result = await addWallet({ brandId: "b-1", topUpId: "wtu-1" });
    expect(result.idempotent).toBe(true);
    expect(result.added).toBe(0);
  });

  it("throws BillingError from RPC", async () => {
    mockRpc.mockRejectedValue(new BillingError("not found", "TOP_UP_NOT_FOUND"));

    const { addWallet } = await import("../wallet-service");
    await expect(addWallet({ brandId: "b-1", topUpId: "bad" }))
      .rejects
      .toBeInstanceOf(BillingError);
  });

  it("throws invariant when topUpId is empty", async () => {
    const { addWallet } = await import("../wallet-service");
    await expect(addWallet({ brandId: "b-1", topUpId: "" })).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// reserveWallet
// ─────────────────────────────────────────────────────────────────────────────

describe("reserveWallet", () => {
  it("calls reserve_wallet with correct params", async () => {
    mockRpc.mockResolvedValue({ new_reserved: 50000, available: 50000 });

    const { reserveWallet } = await import("../wallet-service");
    const result = await reserveWallet({
      brandId:      "brand-1",
      amountPaise:  50000,
      generationId: "gen-1",
    });

    expect(mockRpc).toHaveBeenCalledWith("reserve_wallet", {
      p_brand_id:      "brand-1",
      p_amount_paise:  50000,
      p_generation_id: "gen-1",
    });

    expect(result).toEqual({ newReserved: 50000, available: 50000 });
  });

  it("throws INSUFFICIENT_WALLET when RPC signals it", async () => {
    mockRpc.mockRejectedValue(
      new BillingError("INSUFFICIENT_WALLET: available=0 < required=50000", "INSUFFICIENT_WALLET"),
    );

    const { reserveWallet } = await import("../wallet-service");
    await expect(
      reserveWallet({ brandId: "b-1", amountPaise: 50000, generationId: "g-1" }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_WALLET" });
  });

  it("throws invariant when amountPaise is 0", async () => {
    const { reserveWallet } = await import("../wallet-service");
    await expect(
      reserveWallet({ brandId: "b-1", amountPaise: 0, generationId: "g-1" }),
    ).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// releaseReserve
// ─────────────────────────────────────────────────────────────────────────────

describe("releaseReserve", () => {
  it("calls release_reserve with p_type=release_reserve", async () => {
    mockRpc.mockResolvedValue({ new_balance: 100000, new_reserved: 0 });

    const { releaseReserve } = await import("../wallet-service");
    const result = await releaseReserve({
      brandId:      "brand-1",
      amountPaise:  50000,
      generationId: "gen-1",
    });

    expect(mockRpc).toHaveBeenCalledWith("release_reserve", {
      p_brand_id:      "brand-1",
      p_amount_paise:  50000,
      p_generation_id: "gen-1",
      p_type:          "release_reserve",
    });

    expect(result).toEqual({ newBalance: 100000, newReserved: 0 });
  });

  it("propagates BillingError from RPC", async () => {
    mockRpc.mockRejectedValue(new BillingError("reserved < amount", "RPC_ERROR"));

    const { releaseReserve } = await import("../wallet-service");
    await expect(
      releaseReserve({ brandId: "b-1", amountPaise: 99999, generationId: "g-1" }),
    ).rejects.toBeInstanceOf(BillingError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// spendWallet
// ─────────────────────────────────────────────────────────────────────────────

describe("spendWallet", () => {
  it("calls spend_wallet with correct params", async () => {
    mockRpc.mockResolvedValue({ new_balance: 50000, new_reserved: 0 });

    const { spendWallet } = await import("../wallet-service");
    const result = await spendWallet({
      brandId:      "brand-1",
      amountPaise:  50000,
      generationId: "gen-approved",
    });

    expect(mockRpc).toHaveBeenCalledWith("spend_wallet", {
      p_brand_id:      "brand-1",
      p_amount_paise:  50000,
      p_generation_id: "gen-approved",
    });

    expect(result).toEqual({ newBalance: 50000, newReserved: 0 });
  });

  it("throws RPC_ERROR when reserved < amount", async () => {
    mockRpc.mockRejectedValue(
      new BillingError("reserved=0 < amount=50000", "RPC_ERROR"),
    );

    const { spendWallet } = await import("../wallet-service");
    await expect(
      spendWallet({ brandId: "b-1", amountPaise: 50000, generationId: "g-1" }),
    ).rejects.toMatchObject({ code: "RPC_ERROR" });
  });

  it("throws invariant when amountPaise is 0", async () => {
    const { spendWallet } = await import("../wallet-service");
    await expect(
      spendWallet({ brandId: "b-1", amountPaise: 0, generationId: "g-1" }),
    ).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// refundWallet
// ─────────────────────────────────────────────────────────────────────────────

describe("refundWallet", () => {
  it("calls release_reserve with p_type=refund", async () => {
    mockRpc.mockResolvedValue({ new_balance: 100000, new_reserved: 0 });

    const { refundWallet } = await import("../wallet-service");
    const result = await refundWallet({
      brandId:      "brand-1",
      amountPaise:  50000,
      generationId: "gen-rejected",
      reason:       "Creator rejected the generation",
    });

    expect(mockRpc).toHaveBeenCalledWith("release_reserve", {
      p_brand_id:      "brand-1",
      p_amount_paise:  50000,
      p_generation_id: "gen-rejected",
      p_type:          "refund",
    });

    expect(result).toEqual({ newBalance: 100000, newReserved: 0 });
  });

  it("throws invariant when reason is empty", async () => {
    const { refundWallet } = await import("../wallet-service");
    await expect(
      refundWallet({
        brandId:      "b-1",
        amountPaise:  50000,
        generationId: "g-1",
        reason:       "",
      }),
    ).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getWallet
// ─────────────────────────────────────────────────────────────────────────────

describe("getWallet", () => {
  it("returns balance, reserved, available, lifetime_topup", async () => {
    mockFrom.mockReturnValue(
      makeMaybeSingle({
        data: {
          wallet_balance_paise:  200000,
          wallet_reserved_paise:  50000,
          lifetime_topup_paise:  500000,
        },
        error: null,
      }),
    );

    const { getWallet } = await import("../wallet-service");
    const result = await getWallet("brand-1");

    expect(result).toEqual({
      balance:        200000,
      reserved:        50000,
      available:      150000, // 200000 - 50000
      lifetime_topup: 500000,
    });
  });

  it("throws BRAND_NOT_FOUND when row is null", async () => {
    mockFrom.mockReturnValue(
      makeMaybeSingle({ data: null, error: null }),
    );

    const { getWallet } = await import("../wallet-service");
    await expect(getWallet("missing-brand")).rejects.toMatchObject({
      code: "BRAND_NOT_FOUND",
    });
  });

  it("throws RPC_ERROR on DB error", async () => {
    mockFrom.mockReturnValue(
      makeMaybeSingle({ data: null, error: { message: "DB failure" } }),
    );

    const { getWallet } = await import("../wallet-service");
    await expect(getWallet("brand-1")).rejects.toMatchObject({
      code: "RPC_ERROR",
    });
  });

  it("available = balance - reserved", async () => {
    mockFrom.mockReturnValue(
      makeMaybeSingle({
        data: {
          wallet_balance_paise:  300000,
          wallet_reserved_paise: 120000,
          lifetime_topup_paise:  300000,
        },
        error: null,
      }),
    );

    const { getWallet } = await import("../wallet-service");
    const result = await getWallet("brand-1");
    expect(result.available).toBe(result.balance - result.reserved);
  });
});
