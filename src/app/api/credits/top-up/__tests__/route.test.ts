// ─────────────────────────────────────────────────────────────────────────────
// POST /api/credits/top-up — route tests
// ─────────────────────────────────────────────────────────────────────────────
//
// Mock strategy:
//   • @/lib/supabase/server::createClient → returns { auth.getUser }
//   • @/lib/supabase/admin::createAdminClient → fluent chain mock
//   • @/lib/payments/cashfree/collect::createTopUpOrder → factory mock
//
// The route itself is tested in isolation — no actual DB, no actual Cashfree call.
// Happy path asserts: creates row, calls Cashfree, returns session.
// Error paths: 401 unauth, 404 no brand, 400 bad pack, 502 Cashfree blow-up.
// ─────────────────────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock surfaces (hoisted via vi.mock) ──────────────────────────────────────

const getUserMock = vi.fn();
const createTopUpOrderMock = vi.fn();

// Admin client chain: we rebuild it per-test so we can tailor `.maybeSingle()`
// returns for each table. Structure:
//   admin.from('brands').select(...).eq(...).maybeSingle() -> { data, error }
//   admin.from('users').select(...).eq(...).maybeSingle() -> { data, error }
//   admin.from('credit_top_ups').insert(...).select().single() -> { data, error }
//   admin.from('credit_top_ups').update(...).eq(...) -> { error }
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

// ── Helpers ──────────────────────────────────────────────────────────────────

async function callRoute(body: unknown) {
  // Dynamic import so mocks above are in place before the module loads.
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
        pack: "small",
        credits: 10,
        amount_paise: 50000,
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
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: returns orderId + paymentSessionId and persists row", async () => {
    const res = await callRoute({ pack: "small" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      orderId: "topup_brand-1_123",
      paymentSessionId: "session_abc",
      amount_paise: 50000,
      credits: 10,
    });

    // Cashfree called with correct params
    expect(createTopUpOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: "brand-1",
        pack: "small",
        credits: 10,
        amountPaise: 50000,
        customerEmail: "brand@example.com",
        customerPhone: "9999999999",
      }),
    );

    // Post-order update sets cf_order_id + status=processing
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
    const res = await callRoute({ pack: "small" });
    expect(res.status).toBe(401);
  });

  it("404 when user has no brand profile", async () => {
    adminMocks.brandsMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });
    const res = await callRoute({ pack: "small" });
    expect(res.status).toBe(404);
  });

  it("400 when pack is invalid", async () => {
    const res = await callRoute({ pack: "huge" });
    expect(res.status).toBe(400);
  });

  it("400 when body is missing pack", async () => {
    const res = await callRoute({});
    expect(res.status).toBe(400);
  });

  it("400 when pack=free_signup (not purchasable)", async () => {
    // free_signup is granted server-side only — brands cannot request it.
    const res = await callRoute({ pack: "free_signup" });
    expect(res.status).toBe(400);
  });

  it("502 when Cashfree order creation fails; marks row failed", async () => {
    createTopUpOrderMock.mockRejectedValueOnce(new Error("Cashfree is down"));
    const res = await callRoute({ pack: "medium" });
    expect(res.status).toBe(502);

    // Row should be marked failed with a reason
    expect(adminMocks.topUpUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" }),
      "id",
      "topup-uuid-1",
    );
  });

  it("uses spec pricing for medium pack (₹2,250 / 50 credits)", async () => {
    await callRoute({ pack: "medium" });
    expect(createTopUpOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pack: "medium",
        credits: 50,
        amountPaise: 225000,
      }),
    );
  });

  it("uses spec pricing for large pack (₹8,000 / 200 credits)", async () => {
    await callRoute({ pack: "large" });
    expect(createTopUpOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pack: "large",
        credits: 200,
        amountPaise: 800000,
      }),
    );
  });
});
