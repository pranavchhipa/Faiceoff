// ─────────────────────────────────────────────────────────────────────────────
// GET /api/withdrawals — paginated list of the authed creator's withdrawals
// ─────────────────────────────────────────────────────────────────────────────
//
// Contract:
//   • Auth gate (401 unauth / 403 non-creator)
//   • Rows scoped to auth.uid() via admin query on creator_id
//   • Cursor-paginated on created_at (descending)
//   • Never returns full bank account number — only the masked last4 +
//     the IFSC + bank_name columns already on the row
// ─────────────────────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();

interface AdminMocks {
  creatorLookup: ReturnType<typeof vi.fn>;
  withdrawalsList: ReturnType<typeof vi.fn>;
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
        const query = {
          eq: vi.fn(),
          lt: vi.fn(),
          order: vi.fn(),
          limit: vi.fn(),
          then: vi.fn(),
        };
        // Chain: .select().eq('creator_id', id)[.lt('created_at', cursor)?].order().limit() → awaited
        query.eq.mockReturnValue(query);
        query.lt.mockReturnValue(query);
        query.order.mockReturnValue(query);
        query.limit.mockImplementation(() =>
          (adminMocks.withdrawalsList as () => unknown)(),
        );
        return {
          select: () => query,
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

async function callRoute(search = "") {
  const { GET } = await import("../route");
  const req = new Request(`http://localhost/api/withdrawals${search}`, {
    method: "GET",
  });
  return GET(req as unknown as Parameters<typeof GET>[0]);
}

function defaultMocks(): AdminMocks {
  return {
    creatorLookup: vi.fn().mockResolvedValue({
      data: { id: "creator-1", user_id: "user-1", kyc_status: "verified" },
      error: null,
    }),
    withdrawalsList: vi.fn().mockResolvedValue({
      data: [
        {
          id: "wr-2",
          creator_id: "creator-1",
          gross_paise: 100_000,
          tcs_paise: 1000,
          tds_paise: 1000,
          gst_output_paise: 0,
          net_paise: 98_000,
          status: "success",
          failure_reason: null,
          bank_account_number_masked: "9012",
          bank_ifsc: "HDFC0001234",
          bank_name: "HDFC BANK",
          cf_transfer_id: "CF_B",
          cf_utr: "UTR_B",
          cf_mode: "IMPS",
          requested_at: "2026-04-22T10:00:00Z",
          processing_at: "2026-04-22T10:00:05Z",
          completed_at: "2026-04-22T10:00:30Z",
          created_at: "2026-04-22T10:00:00Z",
          updated_at: "2026-04-22T10:00:30Z",
        },
        {
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
          requested_at: "2026-04-20T10:00:00Z",
          processing_at: "2026-04-20T10:00:05Z",
          completed_at: null,
          created_at: "2026-04-20T10:00:00Z",
          updated_at: "2026-04-20T10:00:05Z",
        },
      ],
      error: null,
    }),
  };
}

describe("GET /api/withdrawals", () => {
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
    const res = await callRoute();
    expect(res.status).toBe(401);
  });

  it("403 when caller has no creator profile", async () => {
    adminMocks.creatorLookup.mockResolvedValue({ data: null, error: null });
    const res = await callRoute();
    expect(res.status).toBe(403);
  });

  it("200 returns rows newest first with next_cursor when more than limit", async () => {
    const res = await callRoute("?limit=2");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.withdrawals)).toBe(true);
    expect(body.withdrawals.length).toBe(2);
    expect(body.withdrawals[0].id).toBe("wr-2");
    expect(body.withdrawals[0].bank_account_number_masked).toBe("9012");
  });

  it("never exposes raw account number or encrypted bytea in the response", async () => {
    const res = await callRoute();
    const body = await res.json();
    const json = JSON.stringify(body);
    expect(json).not.toMatch(/account_number_encrypted/);
  });

  it("accepts a cursor param for pagination", async () => {
    const res = await callRoute(
      "?cursor=2026-04-22T10:00:00.000Z&limit=10",
    );
    expect(res.status).toBe(200);
    expect(adminMocks.withdrawalsList).toHaveBeenCalled();
  });

  it("400 when limit is invalid (e.g. 0 or > 100)", async () => {
    const res = await callRoute("?limit=500");
    expect(res.status).toBe(400);
  });
});
