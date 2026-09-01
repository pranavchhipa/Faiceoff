// ─────────────────────────────────────────────────────────────────────────────
// POST /api/credits/top-up — route tests (Razorpay order era)
// ─────────────────────────────────────────────────────────────────────────────
//
// Mock strategy:
//   • @/lib/supabase/server::createClient → returns { auth.getUser }
//   • @/lib/supabase/admin::createAdminClient → fluent chain mock
//   • @/lib/payments/razorpay/orders::createRazorpayOrder/getRazorpayKeyId → mocks
//   • @/lib/billing::getPackByCode → mock returns CreditPack with new codes
//
// Pack codes are the Chunk E catalog: spark/flow/pro/studio/enterprise.
// `small`/`medium`/`large` are LEGACY (backfilled in migration 00034) and
// rejected by the route's Zod enum.
// ─────────────────────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock surfaces (hoisted via vi.mock) ──────────────────────────────────────

const getUserMock = vi.fn();
const createRazorpayOrderMock = vi.fn();
const getRazorpayKeyIdMock = vi.fn();
const getPackByCodeMock = vi.fn();

interface AdminMocks {
  brandsMaybeSingle: ReturnType<typeof vi.fn>;
  topUpInsertSingle: ReturnType<typeof vi.fn>;
  topUpUpdate: ReturnType<typeof vi.fn>;
}

let adminMocks: AdminMocks;

function buildAdminClient() {
  return {
    from(table: string) {
      if (table === "brands") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: adminMocks.brandsMaybeSingle }),
          }),
        };
      }
      if (table === "credit_top_ups") {
        return {
          insert: () => ({
            select: () => ({ single: adminMocks.topUpInsertSingle }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: (col: string, val: string) =>
              (adminMocks.topUpUpdate as (
                p: Record<string, unknown>,
                c: string,
                v: string,
              ) => Promise<{ error: unknown }>)(patch, col, val),
          }),
        };
      }
      throw new Error(`Unexpected table in admin mock: ${table}`);
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: getUserMock },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => buildAdminClient(),
}));

vi.mock("@/lib/payments/razorpay/orders", () => ({
  createRazorpayOrder: (...args: unknown[]) => createRazorpayOrderMock(...args),
  getRazorpayKeyId: (...args: unknown[]) => getRazorpayKeyIdMock(...args),
}));

vi.mock("@/lib/billing", async () => {
  // Re-export the real BillingError class so the route's instanceof check works.
  const actual = await vi.importActual<typeof import("@/lib/billing")>(
    "@/lib/billing",
  );
  return {
    ...actual,
    getPackByCode: getPackByCodeMock,
  };
});

// ── Pack catalog fixtures (mirror migration 00033 seed) ──────────────────────

const PACK_FIXTURES: Record<
  string,
  {
    code: string;
    display_name: string;
    credits: number;
    bonus_credits: number;
    price_paise: number;
    is_active: boolean;
    is_popular: boolean;
    sort_order: number;
    marketing_tagline: string;
  }
> = {
  spark: {
    code: "spark",
    display_name: "Spark",
    credits: 10,
    bonus_credits: 0,
    price_paise: 30000,
    is_active: true,
    is_popular: false,
    sort_order: 1,
    marketing_tagline: "Get started with Faiceoff",
  },
  flow: {
    code: "flow",
    display_name: "Flow",
    credits: 50,
    bonus_credits: 10,
    price_paise: 120000,
    is_active: true,
    is_popular: false,
    sort_order: 2,
    marketing_tagline: "Save 33% — for regular use",
  },
  pro: {
    code: "pro",
    display_name: "Pro",
    credits: 200,
    bonus_credits: 50,
    price_paise: 450000,
    is_active: true,
    is_popular: true,
    sort_order: 3,
    marketing_tagline: "MOST POPULAR — save 40%",
  },
  studio: {
    code: "studio",
    display_name: "Studio",
    credits: 600,
    bonus_credits: 200,
    price_paise: 1200000,
    is_active: true,
    is_popular: false,
    sort_order: 4,
    marketing_tagline: "Agency-grade — save 50%",
  },
  enterprise: {
    code: "enterprise",
    display_name: "Enterprise",
    credits: 2000,
    bonus_credits: 800,
    price_paise: 5000000,
    is_active: true,
    is_popular: false,
    sort_order: 5,
    marketing_tagline: "Talk to us for custom volume",
  },
};

async function callRoute(body: unknown) {
  const { POST } = await import("../route");
  const req = new Request("http://localhost/api/credits/top-up", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(req as unknown as Parameters<typeof POST>[0]);
}

function defaultAdminMocks(): AdminMocks {
  return {
    brandsMaybeSingle: vi.fn().mockResolvedValue({
      data: { id: "brand-1", user_id: "user-1" },
      error: null,
    }),
    topUpInsertSingle: vi.fn().mockResolvedValue({
      data: {
        id: "topup-uuid-1",
        brand_id: "brand-1",
        pack: "spark",
        credits: 10,
        bonus_credits: 0,
        amount_paise: 30000,
        status: "initiated",
      },
      error: null,
    }),
    topUpUpdate: vi.fn().mockResolvedValue({ error: null }),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/credits/top-up", () => {
  beforeEach(() => {
    adminMocks = defaultAdminMocks();
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1", email: "brand@example.com" } },
      error: null,
    });
    createRazorpayOrderMock.mockResolvedValue({
      id: "order_test_123",
      entity: "order",
      amount: 30000,
      amount_paid: 0,
      amount_due: 30000,
      currency: "INR",
      receipt: "topup-uuid-1",
      status: "created",
      notes: {},
      created_at: 1_750_000_000,
    });
    getRazorpayKeyIdMock.mockReturnValue("rzp_test_key");
    getPackByCodeMock.mockImplementation(async (code: string) => {
      const pack = PACK_FIXTURES[code];
      if (!pack) {
        const { BillingError } = await import("@/lib/billing");
        throw new BillingError(`Pack '${code}' not found`, "PACK_NOT_FOUND");
      }
      return pack;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: returns orderId + keyId and persists row", async () => {
    const res = await callRoute({ pack: "spark" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      orderId: "order_test_123",
      keyId: "rzp_test_key",
      amount_paise: 30000,
      credits: 10,
      bonus_credits: 0,
    });

    expect(createRazorpayOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        amount_paise: 30000,
        receipt: "topup-uuid-1",
        notes: {
          type: "credit_top_up",
          credit_top_up_id: "topup-uuid-1",
          brand_id: "brand-1",
          pack: "spark",
        },
      }),
    );

    expect(adminMocks.topUpUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        cf_order_id: "order_test_123",
        status: "processing",
      }),
      "id",
      "topup-uuid-1",
    );
  });

  it("401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const res = await callRoute({ pack: "spark" });
    expect(res.status).toBe(401);
  });

  it("404 when user has no brand profile", async () => {
    adminMocks.brandsMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });
    const res = await callRoute({ pack: "spark" });
    expect(res.status).toBe(404);
  });

  it("400 when pack is invalid (legacy code)", async () => {
    const res = await callRoute({ pack: "small" });
    expect(res.status).toBe(400);
  });

  it("400 when pack is unknown enum value", async () => {
    const res = await callRoute({ pack: "huge" });
    expect(res.status).toBe(400);
  });

  it("400 when body is missing pack", async () => {
    const res = await callRoute({});
    expect(res.status).toBe(400);
  });

  it("400 when pack=free_signup (not purchasable)", async () => {
    const res = await callRoute({ pack: "free_signup" });
    expect(res.status).toBe(400);
  });

  it("400 when pack is inactive in the catalog", async () => {
    getPackByCodeMock.mockResolvedValueOnce({
      ...PACK_FIXTURES.spark,
      is_active: false,
    });
    const res = await callRoute({ pack: "spark" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("pack_inactive");
  });

  it("502 when Razorpay order creation fails; marks row failed", async () => {
    createRazorpayOrderMock.mockRejectedValueOnce(new Error("Razorpay is down"));
    const res = await callRoute({ pack: "flow" });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("payment_unavailable");

    expect(adminMocks.topUpUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        failure_reason: expect.stringContaining("Razorpay is down"),
      }),
      "id",
      "topup-uuid-1",
    );
  });

  it("uses spec pricing for Flow pack (₹1,200 / 50+10 credits)", async () => {
    const res = await callRoute({ pack: "flow" });
    expect(createRazorpayOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        amount_paise: 120000,
        notes: expect.objectContaining({ pack: "flow" }),
      }),
    );
    const body = await res.json();
    expect(body).toMatchObject({ amount_paise: 120000, credits: 50, bonus_credits: 10 });
  });

  it("uses spec pricing for Pro pack (₹4,500 / 200+50 credits)", async () => {
    const res = await callRoute({ pack: "pro" });
    expect(createRazorpayOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        amount_paise: 450000,
        notes: expect.objectContaining({ pack: "pro" }),
      }),
    );
    const body = await res.json();
    expect(body).toMatchObject({ amount_paise: 450000, credits: 200, bonus_credits: 50 });
  });

  it("uses spec pricing for Studio pack (₹12,000 / 600+200 credits)", async () => {
    const res = await callRoute({ pack: "studio" });
    expect(createRazorpayOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        amount_paise: 1200000,
        notes: expect.objectContaining({ pack: "studio" }),
      }),
    );
    const body = await res.json();
    expect(body).toMatchObject({ amount_paise: 1200000, credits: 600, bonus_credits: 200 });
  });
});
