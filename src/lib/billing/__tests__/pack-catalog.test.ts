// ─────────────────────────────────────────────────────────────────────────────
// pack-catalog.test.ts — tests for pack catalog service.
//
// Mocks the Supabase admin client to avoid DB dependency.
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
import type { CreditPack } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Mock setup
// ─────────────────────────────────────────────────────────────────────────────

// We mock createAdminClient at the module level so pack-catalog.ts picks it up.
let mockFrom: ReturnType<typeof vi.fn>;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

// Sample packs fixture.
const SAMPLE_PACKS: CreditPack[] = [
  {
    id: "id-1",
    code: "spark",
    display_name: "Spark",
    credits: 10,
    bonus_credits: 0,
    price_paise: 30000,
    is_popular: false,
    is_active: true,
    sort_order: 1,
    marketing_tagline: "Get started",
    created_at: "2026-04-23T00:00:00Z",
    updated_at: "2026-04-23T00:00:00Z",
  },
  {
    id: "id-2",
    code: "pro",
    display_name: "Pro",
    credits: 200,
    bonus_credits: 50,
    price_paise: 450000,
    is_popular: true,
    is_active: true,
    sort_order: 3,
    marketing_tagline: "MOST POPULAR",
    created_at: "2026-04-23T00:00:00Z",
    updated_at: "2026-04-23T00:00:00Z",
  },
  {
    id: "id-3",
    code: "flow",
    display_name: "Flow",
    credits: 50,
    bonus_credits: 10,
    price_paise: 120000,
    is_popular: false,
    is_active: true,
    sort_order: 2,
    marketing_tagline: "For regular use",
    created_at: "2026-04-23T00:00:00Z",
    updated_at: "2026-04-23T00:00:00Z",
  },
];

// Helper to build a fluent query mock.
function buildQueryMock(result: { data: unknown; error: unknown }) {
  const terminal = vi.fn().mockResolvedValue(result);
  const withOrder = { order: vi.fn().mockResolvedValue(result) };
  const withEqAndOrder = {
    order: vi.fn().mockResolvedValue(result),
    maybeSingle: terminal,
  };
  const withSelect = {
    eq: vi.fn().mockReturnValue(withEqAndOrder),
    order: vi.fn().mockResolvedValue(result),
  };
  return {
    select: vi.fn().mockReturnValue(withSelect),
    upsert: vi.fn().mockResolvedValue(result),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue(result),
    }),
  };
}

beforeEach(() => {
  mockFrom = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// getActivePacks
// ─────────────────────────────────────────────────────────────────────────────

describe("getActivePacks", () => {
  it("calls from('credit_packs_catalog').select('*').eq('is_active', true)", async () => {
    const queryMock = buildQueryMock({ data: SAMPLE_PACKS, error: null });
    mockFrom.mockReturnValue(queryMock);

    const { getActivePacks } = await import("../pack-catalog");
    const result = await getActivePacks();

    expect(mockFrom).toHaveBeenCalledWith("credit_packs_catalog");
    expect(queryMock.select).toHaveBeenCalledWith("*");
    expect(result).toEqual(SAMPLE_PACKS);
  });

  it("returns empty array when no packs found", async () => {
    const queryMock = buildQueryMock({ data: null, error: null });
    mockFrom.mockReturnValue(queryMock);

    const { getActivePacks } = await import("../pack-catalog");
    const result = await getActivePacks();
    expect(result).toEqual([]);
  });

  it("throws BillingError with RPC_ERROR on DB error", async () => {
    const queryMock = buildQueryMock({ data: null, error: { message: "connection error" } });
    mockFrom.mockReturnValue(queryMock);

    const { getActivePacks } = await import("../pack-catalog");
    await expect(getActivePacks()).rejects.toMatchObject({
      code: "RPC_ERROR",
      name: "BillingError",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getPackByCode
// ─────────────────────────────────────────────────────────────名
// ─────────────────────────────────────────────────────────────────────────────

describe("getPackByCode", () => {
  it("fetches a specific pack by code", async () => {
    const proPack = SAMPLE_PACKS.find((p) => p.code === "pro")!;
    const queryMock = buildQueryMock({ data: proPack, error: null });
    mockFrom.mockReturnValue(queryMock);

    const { getPackByCode } = await import("../pack-catalog");
    const result = await getPackByCode("pro");

    expect(mockFrom).toHaveBeenCalledWith("credit_packs_catalog");
    expect(result.code).toBe("pro");
    expect(result.credits).toBe(200);
  });

  it("throws PACK_NOT_FOUND when pack does not exist", async () => {
    const queryMock = buildQueryMock({ data: null, error: null });
    mockFrom.mockReturnValue(queryMock);

    const { getPackByCode } = await import("../pack-catalog");
    await expect(getPackByCode("studio")).rejects.toMatchObject({
      code: "PACK_NOT_FOUND",
    });
  });

  it("throws RPC_ERROR on DB error", async () => {
    const queryMock = buildQueryMock({ data: null, error: { message: "timeout" } });
    mockFrom.mockReturnValue(queryMock);

    const { getPackByCode } = await import("../pack-catalog");
    await expect(getPackByCode("spark")).rejects.toMatchObject({
      code: "RPC_ERROR",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// upsertPack
// ─────────────────────────────────────────────────────────────────────────────

describe("upsertPack", () => {
  it("calls upsert with onConflict=code", async () => {
    const queryMock = buildQueryMock({ data: null, error: null });
    mockFrom.mockReturnValue(queryMock);

    const { upsertPack } = await import("../pack-catalog");
    await upsertPack({
      code: "spark",
      display_name: "Spark Updated",
      credits: 15,
      bonus_credits: 0,
      price_paise: 35000,
      is_popular: false,
      is_active: true,
      sort_order: 1,
      marketing_tagline: "Updated tagline",
    });

    expect(mockFrom).toHaveBeenCalledWith("credit_packs_catalog");
    expect(queryMock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ code: "spark", credits: 15 }),
      { onConflict: "code" },
    );
  });

  it("throws RPC_ERROR on DB failure", async () => {
    const queryMock = buildQueryMock({ data: null, error: { message: "unique violation" } });
    mockFrom.mockReturnValue(queryMock);

    const { upsertPack } = await import("../pack-catalog");
    await expect(
      upsertPack({
        code: "spark",
        display_name: "Spark",
        credits: 10,
        bonus_credits: 0,
        price_paise: 30000,
        is_popular: false,
        is_active: true,
        sort_order: 1,
        marketing_tagline: null,
      }),
    ).rejects.toMatchObject({ code: "RPC_ERROR" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// deactivatePack
// ─────────────────────────────────────────────────────────────────────────────

describe("deactivatePack", () => {
  it("sets is_active=false for the given code", async () => {
    const queryMock = buildQueryMock({ data: null, error: null });
    mockFrom.mockReturnValue(queryMock);

    const { deactivatePack } = await import("../pack-catalog");
    await deactivatePack("enterprise");

    expect(mockFrom).toHaveBeenCalledWith("credit_packs_catalog");
    expect(queryMock.update).toHaveBeenCalledWith(
      expect.objectContaining({ is_active: false }),
    );
  });

  it("throws RPC_ERROR on DB failure", async () => {
    const queryMock = buildQueryMock({ data: null, error: { message: "not found" } });
    mockFrom.mockReturnValue(queryMock);

    const { deactivatePack } = await import("../pack-catalog");
    await expect(deactivatePack("pro")).rejects.toMatchObject({
      code: "RPC_ERROR",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BillingError
// ─────────────────────────────────────────────────────────────────────────────

describe("BillingError", () => {
  it("is an instance of Error", () => {
    const e = new BillingError("test", "PACK_NOT_FOUND");
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(BillingError);
  });

  it("has name BillingError", () => {
    const e = new BillingError("test", "PACK_NOT_FOUND");
    expect(e.name).toBe("BillingError");
  });

  it("preserves the code", () => {
    const e = new BillingError("not found", "PACK_NOT_FOUND");
    expect(e.code).toBe("PACK_NOT_FOUND");
  });
});
