// ─────────────────────────────────────────────────────────────────────────────
// credits-service.test.ts — tests for all credits service functions.
//
// Mocks callBillingRpc (via rpc.ts) and createAdminClient (for getCredits).
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

// We mock rpc.ts callBillingRpc directly so tests are RPC-call unit tests.
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
// addCredits
// ─────────────────────────────────────────────────────────────────────────────

describe("addCredits", () => {
  it("calls add_credits_for_topup with correct params", async () => {
    mockRpc.mockResolvedValue({
      credits_added: 50,
      bonus_added: 10,
      new_balance: 60,
      idempotent: false,
    });

    const { addCredits } = await import("../credits-service");
    const result = await addCredits({
      brandId: "brand-1",
      topUpId: "topup-1",
    });

    expect(mockRpc).toHaveBeenCalledWith("add_credits_for_topup", {
      p_brand_id: "brand-1",
      p_top_up_id: "topup-1",
    });

    expect(result).toEqual({
      creditsAdded: 50,
      bonusAdded: 10,
      newBalance: 60,
      idempotent: false,
    });
  });

  it("returns idempotent=true when already credited", async () => {
    mockRpc.mockResolvedValue({
      credits_added: 0,
      bonus_added: 0,
      new_balance: 60,
      idempotent: true,
    });

    const { addCredits } = await import("../credits-service");
    const result = await addCredits({ brandId: "b-1", topUpId: "t-1" });
    expect(result.idempotent).toBe(true);
    expect(result.creditsAdded).toBe(0);
  });

  it("propagates BillingError from callBillingRpc", async () => {
    mockRpc.mockRejectedValue(new BillingError("RPC failed", "RPC_ERROR"));

    const { addCredits } = await import("../credits-service");
    await expect(addCredits({ brandId: "b-1", topUpId: "t-bad" }))
      .rejects
      .toBeInstanceOf(BillingError);
  });

  it("throws invariant when brandId is empty", async () => {
    const { addCredits } = await import("../credits-service");
    await expect(addCredits({ brandId: "", topUpId: "t-1" }))
      .rejects
      .toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// deductCredit
// ─────────────────────────────────────────────────────────────────────────────

describe("deductCredit", () => {
  it("calls deduct_credit with correct params", async () => {
    mockRpc.mockResolvedValue({ new_balance: 4 });

    const { deductCredit } = await import("../credits-service");
    const result = await deductCredit({
      brandId: "brand-1",
      generationId: "gen-1",
    });

    expect(mockRpc).toHaveBeenCalledWith("deduct_credit", {
      p_brand_id: "brand-1",
      p_generation_id: "gen-1",
    });

    expect(result).toEqual({ newBalance: 4 });
  });

  it("throws INSUFFICIENT_CREDITS when RPC signals it", async () => {
    mockRpc.mockRejectedValue(
      new BillingError("INSUFFICIENT_CREDITS: brand has no credits", "INSUFFICIENT_CREDITS"),
    );

    const { deductCredit } = await import("../credits-service");
    await expect(deductCredit({ brandId: "b-1", generationId: "g-1" }))
      .rejects
      .toMatchObject({ code: "INSUFFICIENT_CREDITS" });
  });

  it("throws invariant when generationId is empty", async () => {
    const { deductCredit } = await import("../credits-service");
    await expect(deductCredit({ brandId: "b-1", generationId: "" }))
      .rejects
      .toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getCredits
// ─────────────────────────────────────────────────────────────────────────────

describe("getCredits", () => {
  it("returns remaining and lifetime_purchased", async () => {
    mockFrom.mockReturnValue(
      makeMaybeSingle({
        data: { credits_remaining: 42, credits_lifetime_purchased: 100 },
        error: null,
      }),
    );

    const { getCredits } = await import("../credits-service");
    const result = await getCredits("brand-1");

    expect(result).toEqual({
      remaining: 42,
      lifetime_purchased: 100,
    });
  });

  it("throws BRAND_NOT_FOUND when row is null", async () => {
    mockFrom.mockReturnValue(
      makeMaybeSingle({ data: null, error: null }),
    );

    const { getCredits } = await import("../credits-service");
    await expect(getCredits("brand-missing")).rejects.toMatchObject({
      code: "BRAND_NOT_FOUND",
    });
  });

  it("throws RPC_ERROR on DB error", async () => {
    mockFrom.mockReturnValue(
      makeMaybeSingle({ data: null, error: { message: "connection refused" } }),
    );

    const { getCredits } = await import("../credits-service");
    await expect(getCredits("brand-1")).rejects.toMatchObject({
      code: "RPC_ERROR",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// freeSignupGrant
// ─────────────────────────────────────────────────────────────────────────────

describe("freeSignupGrant", () => {
  it("calls add_free_signup_credits with brandId", async () => {
    mockRpc.mockResolvedValue({
      credits_added: 5,
      bonus_added: 0,
      new_balance: 5,
      idempotent: false,
    });

    const { freeSignupGrant } = await import("../credits-service");
    const result = await freeSignupGrant("brand-new");

    expect(mockRpc).toHaveBeenCalledWith("add_free_signup_credits", {
      p_brand_id: "brand-new",
    });

    expect(result).toEqual({
      creditsAdded: 5,
      newBalance: 5,
      idempotent: false,
    });
  });

  it("is idempotent — returns existing balance on second call", async () => {
    mockRpc.mockResolvedValue({
      credits_added: 0,
      bonus_added: 0,
      new_balance: 5,
      idempotent: true,
    });

    const { freeSignupGrant } = await import("../credits-service");
    const result = await freeSignupGrant("brand-existing");

    expect(result.idempotent).toBe(true);
    expect(result.creditsAdded).toBe(0);
    expect(result.newBalance).toBe(5);
  });

  it("throws invariant when brandId is empty", async () => {
    const { freeSignupGrant } = await import("../credits-service");
    await expect(freeSignupGrant("")).rejects.toThrow();
  });
});
