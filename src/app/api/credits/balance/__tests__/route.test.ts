// ─────────────────────────────────────────────────────────────────────────────
// GET /api/credits/balance — route tests
// ─────────────────────────────────────────────────────────────────────────────
//
// Happy path: returns credits_balance_paise, credits_reserved_paise,
// available_paise, lifetime_topup_paise, and last-20 recent_transactions.
//
// Mocks the same as top-up route: server createClient for auth, admin client
// chain for DB reads.
// ─────────────────────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();

interface AdminMocks {
  brandsMaybeSingle: ReturnType<typeof vi.fn>;
  creditTxnsQuery: ReturnType<typeof vi.fn>;
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
      if (table === "credit_transactions") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: adminMocks.creditTxnsQuery,
              }),
            }),
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

async function callRoute() {
  const { GET } = await import("../route");
  const req = new Request("http://localhost/api/credits/balance", {
    method: "GET",
  });
  return GET(req as unknown as Parameters<typeof GET>[0]);
}

function defaultMocks(): AdminMocks {
  return {
    brandsMaybeSingle: vi.fn().mockResolvedValue({
      data: {
        id: "brand-1",
        user_id: "user-1",
        credits_balance_paise: 200000,
        credits_reserved_paise: 50000,
        lifetime_topup_paise: 300000,
      },
      error: null,
    }),
    creditTxnsQuery: vi.fn().mockResolvedValue({
      data: [
        {
          id: "tx-1",
          type: "topup",
          amount_paise: 100000,
          balance_after_paise: 200000,
          description: "Cashfree top-up",
          created_at: "2026-04-20T10:00:00Z",
        },
        {
          id: "tx-2",
          type: "bonus",
          amount_paise: 25000,
          balance_after_paise: 125000,
          description: "Free starter",
          created_at: "2026-04-19T10:00:00Z",
        },
      ],
      error: null,
    }),
  };
}

describe("GET /api/credits/balance", () => {
  beforeEach(() => {
    adminMocks = defaultMocks();
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: returns balances + recent transactions", async () => {
    const res = await callRoute();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.credits_balance_paise).toBe(200000);
    expect(body.credits_reserved_paise).toBe(50000);
    expect(body.available_paise).toBe(150000); // 200000 - 50000
    expect(body.lifetime_topup_paise).toBe(300000);
    expect(body.recent_transactions).toHaveLength(2);
    expect(body.recent_transactions[0]).toMatchObject({
      id: "tx-1",
      type: "topup",
      amount_paise: 100000,
    });
  });

  it("401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const res = await callRoute();
    expect(res.status).toBe(401);
  });

  it("404 when user has no brand profile", async () => {
    adminMocks.brandsMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });
    const res = await callRoute();
    expect(res.status).toBe(404);
  });

  it("returns empty recent_transactions when brand has none", async () => {
    adminMocks.creditTxnsQuery.mockResolvedValueOnce({
      data: [],
      error: null,
    });
    const res = await callRoute();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.recent_transactions).toEqual([]);
  });

  it("available_paise never goes negative even if reserved > balance", async () => {
    // Shouldn't happen in practice — defense in depth.
    adminMocks.brandsMaybeSingle.mockResolvedValueOnce({
      data: {
        id: "brand-1",
        user_id: "user-1",
        credits_balance_paise: 10000,
        credits_reserved_paise: 20000,
        lifetime_topup_paise: 30000,
      },
      error: null,
    });
    const res = await callRoute();
    const body = await res.json();
    expect(body.available_paise).toBe(0);
  });
});
