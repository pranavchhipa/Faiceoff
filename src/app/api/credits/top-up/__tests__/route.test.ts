// ─────────────────────────────────────────────────────────────────────────────
// POST /api/credits/top-up — route tests (Chunk E rewrite)
// ─────────────────────────────────────────────────────────────────────────────
//
// Mock strategy:
//   • @/lib/supabase/server::createClient → returns { auth.getUser }
//   • @/lib/supabase/admin::createAdminClient → fluent chain mock
//   • @/lib/payments/cashfree/collect::createTopUpOrder → factory mock
//   • @/lib/billing::getPackByCode → mock returns CreditPack with new codes
//
// Pack codes are the Chunk E catalog: spark/flow/pro/studio/enterprise.
// `small`/`medium`/`large` are LEGACY (backfilled in migration 00034) and
// rejected by the route's Zod enum.
// ─────────────────────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock surfaces (hoisted via vi.mock) ──────────────────────────────────────

const getUserMock = vi.fn();
const createTopUpOrderMock = vi.fn();
const getPackByCodeMock = vi.fn();

interface AdminMocks {
  brandsMaybeSingle: ReturnType<typeof vi.fn>;
  usersMaybeSingle: ReturnType<typeof vi.fn>;
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
      if (table === "users") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: adminMocks.usersMaybeSingle }),
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

vi.mock("@/lib/payments/cashfree/collect", () => ({
  createTopUpOrder: createTopUpOrderMock,
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
    usersMaybeSingle: vi.fn().mockResolvedValue({
      data: {
        id: "user-1",
        email: "brand@example.com",
        phone: "9999999999",
        role: "brand",
      },
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
    createTopUpOrderMock.mockResolvedValue({
      orderId: "topup_brand-1_123",
      paymentSessionId: "session_abc",
    });
    getPackByCodeMock.mockImplementation(async (code: string) => {
      const pack = PACK_FIXTURES[code];
      if (!pack) {
        const { BillingError } = await import("@/lib/billing");
        throw new BillingError("PACK_NOT_FOUND", `Pack '${code}' not found`);
      }
      return pack;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: returns orderId + paymentSessionId and persists row", async () => {
    const res = await callRoute({ pack: "spark" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      orderId: "topup_brand-1_123",
      paymentSessionId: "session_abc",
      amount_paise: 30000,
      credits: 10,
      bonus_credits: 0,
    });

    expect(createTopUpOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: "brand-1",
        pack: "spark",
        credits: 10,
        amountPaise: 30000,
        customerEmail: "brand@example.com",
        customerPhone: "9999999999",
      }),
    );

    expect(adminMocks.topUpUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        cf_order_id: "topup_brand-1_123",
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

  it("502 when Cashfree order creation fails; marks row failed", async () => {
    createTopUpOrderMock.mockRejectedValueOnce(new Error("Cashfree is down"));
    const res = await callRoute({ pack: "flow" });
    expect(res.status).toBe(502);

    expect(adminMocks.topUpUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" }),
      "id",
      "topup-uuid-1",
    );
  });

  it("uses spec pricing for Flow pack (₹1,200 / 50+10 credits)", async () => {
    await callRoute({ pack: "flow" });
    expect(createTopUpOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pack: "flow",
        credits: 50,
        amountPaise: 120000,
      }),
    );
  });

  it("uses spec pricing for Pro pack (₹4,500 / 200+50 credits)", async () => {
    await callRoute({ pack: "pro" });
    expect(createTopUpOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pack: "pro",
        credits: 200,
        amountPaise: 450000,
      }),
    );
  });

  it("uses spec pricing for Studio pack (₹12,000 / 600+200 credits)", async () => {
    await callRoute({ pack: "studio" });
    expect(createTopUpOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pack: "studio",
        credits: 600,
        amountPaise: 1200000,
      }),
    );
  });
});
