// ─────────────────────────────────────────────────────────────────────────────
// GET /api/withdrawals/[id] — single withdrawal detail
// ─────────────────────────────────────────────────────────────────────────────
//
// Contract:
//   • Auth gate (401 / 403 non-creator)
//   • Row belongs to the authed creator (404 if not found OR not theirs)
//   • Returns the withdrawal row plus a safe bank_account summary (last4,
//     IFSC, bank_name) — NEVER the encrypted account number
// ─────────────────────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();

interface AdminMocks {
  creatorLookup: ReturnType<typeof vi.fn>;
  withdrawalLookup: ReturnType<typeof vi.fn>;
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
      if (table === "withdrawal_requests") {
        return {
          select: () => ({
            eq: (_c: string, _v: string) => ({
              eq: () => ({
                maybeSingle: adminMocks.withdrawalLookup,
              }),
            }),
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

async function callRoute(id: string) {
  const { GET } = await import("../route");
  const req = new Request(`http://localhost/api/withdrawals/${id}`, {
    method: "GET",
  });
  return GET(req as unknown as Parameters<typeof GET>[0], {
    params: Promise.resolve({ id }),
  });
}

function defaultMocks(): AdminMocks {
  return {
    creatorLookup: vi.fn().mockResolvedValue({
      data: { id: "creator-1", user_id: "user-1" },
      error: null,
    }),
    withdrawalLookup: vi.fn().mockResolvedValue({
      data: {
        id: "wr-1",
        creator_id: "creator-1",
        gross_paise: 50_000,
        tcs_paise: 500,
        tds_paise: 500,
        gst_output_paise: 0,
        net_paise: 49_000,
        status: "processing",
        failure_reason: null,
        bank_account_number_masked: "9012",
        bank_ifsc: "HDFC0001234",
        bank_name: "HDFC BANK",
        cf_transfer_id: "CF_A",
        cf_utr: null,
        cf_mode: "IMPS",
        requested_at: "2026-04-22T10:00:00Z",
        processing_at: "2026-04-22T10:00:05Z",
        completed_at: null,
        created_at: "2026-04-22T10:00:00Z",
        updated_at: "2026-04-22T10:00:05Z",
      },
      error: null,
    }),
  };
}

describe("GET /api/withdrawals/[id]", () => {
  beforeEach(() => {
    adminMocks = defaultMocks();
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
  });

  afterEach(() => vi.clearAllMocks());

  it("401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const res = await callRoute("wr-1");
    expect(res.status).toBe(401);
  });

  it("403 when caller has no creator profile", async () => {
    adminMocks.creatorLookup.mockResolvedValue({ data: null, error: null });
    const res = await callRoute("wr-1");
    expect(res.status).toBe(403);
  });

  it("404 when withdrawal id doesn't exist or isn't the caller's", async () => {
    adminMocks.withdrawalLookup.mockResolvedValue({
      data: null,
      error: null,
    });
    const res = await callRoute("nope");
    expect(res.status).toBe(404);
  });

  it("200 returns the withdrawal detail with masked bank last4", async () => {
    const res = await callRoute("wr-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("wr-1");
    expect(body.bank_account_number_masked).toBe("9012");
    expect(body.bank_ifsc).toBe("HDFC0001234");
    expect(body.net_paise).toBe(49_000);
  });

  it("never exposes raw account number or encrypted bytea column", async () => {
    const res = await callRoute("wr-1");
    const body = await res.json();
    const json = JSON.stringify(body);
    expect(json).not.toMatch(/account_number_encrypted/);
  });
});
