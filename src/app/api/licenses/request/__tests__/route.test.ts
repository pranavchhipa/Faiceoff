// ─────────────────────────────────────────────────────────────────────────────
// POST /api/licenses/request — route tests
// ─────────────────────────────────────────────────────────────────────────────
//
// Mocks:
//   • @/lib/supabase/server::createClient → { auth.getUser }
//   • @/lib/supabase/admin::createAdminClient → per-table chain mock
//   • @/lib/ledger/commit::commitCreditReserve, LedgerError
//
// Pricing to verify (base 6,00,000 paise, quota 25):
//   commission = 18% of 6,00,000  = 1,08,000
//   gst        = 18% of 1,08,000  =   19,440
//   total_paise = 6,00,000 + 1,08,000 + 19,440 = 7,27,440
//   release_per_image = floor(6,00,000 / 25) = 24,000
// ─────────────────────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const commitCreditReserveMock = vi.fn();

// Use a valid RFC-4122 v4 UUID (Zod v4 enforces variant/version bits).
const VALID_LISTING_UUID = "b4e0f0e4-1234-4567-89ab-cdef01234567";

interface AdminMocks {
  brandLookup: ReturnType<typeof vi.fn>;
  listingLookup: ReturnType<typeof vi.fn>;
  requestInsert: ReturnType<typeof vi.fn>;
  requestUpdate: ReturnType<typeof vi.fn>;
}

let adminMocks: AdminMocks;

function buildAdminClient() {
  return {
    from(table: string) {
      if (table === "brands") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: adminMocks.brandLookup }),
          }),
        };
      }
      if (table === "creator_license_listings") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: adminMocks.listingLookup }),
          }),
        };
      }
      if (table === "license_requests") {
        return {
          insert: () => ({
            select: () => ({ single: adminMocks.requestInsert }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: (col: string, val: string) =>
              (adminMocks.requestUpdate as (
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
  createClient: async () => ({ auth: { getUser: getUserMock } }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => buildAdminClient(),
}));

// Keep LedgerError real (route does `instanceof`), mock the reserve fn only.
vi.mock("@/lib/ledger/commit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ledger/commit")>(
    "@/lib/ledger/commit",
  );
  return {
    ...actual,
    commitCreditReserve: commitCreditReserveMock,
  };
});

async function callRoute(body: unknown) {
  const { POST } = await import("../route");
  const req = new Request("http://localhost/api/licenses/request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(req as unknown as Parameters<typeof POST>[0]);
}

function defaultMocks(): AdminMocks {
  return {
    brandLookup: vi.fn().mockResolvedValue({
      data: {
        id: "brand-1",
        credits_balance_paise: 10_00_000, // ₹10,000
        credits_reserved_paise: 0,
      },
      error: null,
    }),
    listingLookup: vi.fn().mockResolvedValue({
      data: {
        id: VALID_LISTING_UUID,
        creator_id: "creator-1",
        template: "creation",
        price_paise: 6_00_000, // ₹6,000
        image_quota: 25,
        validity_days: 90,
        is_active: true,
      },
      error: null,
    }),
    requestInsert: vi.fn().mockResolvedValue({
      data: {
        id: "request-1",
        listing_id: VALID_LISTING_UUID,
        creator_id: "creator-1",
        brand_id: "brand-1",
        status: "requested",
        base_paise: 6_00_000,
        commission_paise: 1_08_000,
        gst_on_commission_paise: 19_440,
        total_paise: 7_27_440,
        image_quota: 25,
        validity_days: 90,
        release_per_image_paise: 24_000,
      },
      error: null,
    }),
    requestUpdate: vi.fn().mockResolvedValue({ error: null }),
  };
}

describe("POST /api/licenses/request", () => {
  beforeEach(() => {
    adminMocks = defaultMocks();
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    commitCreditReserveMock.mockResolvedValue(undefined);
  });

  afterEach(() => vi.clearAllMocks());

  it("401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const res = await callRoute({ listing_id: VALID_LISTING_UUID });
    expect(res.status).toBe(401);
  });

  it("400 when body is malformed JSON", async () => {
    const { POST } = await import("../route");
    const req = new Request("http://localhost/api/licenses/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json{{",
    });
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
  });

  it("400 when listing_id is missing", async () => {
    const res = await callRoute({});
    expect(res.status).toBe(400);
  });

  it("400 when listing_id is not a uuid", async () => {
    const res = await callRoute({ listing_id: "not-a-uuid" });
    expect(res.status).toBe(400);
  });

  it("403 when caller is not a brand", async () => {
    adminMocks.brandLookup.mockResolvedValueOnce({ data: null, error: null });
    const res = await callRoute({ listing_id: VALID_LISTING_UUID });
    expect(res.status).toBe(403);
  });

  it("404 when listing does not exist", async () => {
    adminMocks.listingLookup.mockResolvedValueOnce({ data: null, error: null });
    const res = await callRoute({ listing_id: VALID_LISTING_UUID });
    expect(res.status).toBe(404);
  });

  it("400 when listing is inactive", async () => {
    adminMocks.listingLookup.mockResolvedValueOnce({
      data: {
        id: VALID_LISTING_UUID,
        creator_id: "creator-1",
        template: "creation",
        price_paise: 6_00_000,
        image_quota: 25,
        validity_days: 90,
        is_active: false,
      },
      error: null,
    });
    const res = await callRoute({ listing_id: VALID_LISTING_UUID });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("listing_inactive");
  });

  it("402 when brand has insufficient credits (pre-flight)", async () => {
    adminMocks.brandLookup.mockResolvedValueOnce({
      data: {
        id: "brand-1",
        credits_balance_paise: 5_00_000, // ₹5,000 < ₹7,27,440 total
        credits_reserved_paise: 0,
      },
      error: null,
    });
    const res = await callRoute({ listing_id: VALID_LISTING_UUID });
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe("insufficient_credits");
    expect(body.required_paise).toBe(7_27_440);
    expect(body.available_paise).toBe(5_00_000);
    expect(body.shortfall_paise).toBe(2_27_440);
  });

  it("402 when available = balance - reserved is short", async () => {
    // Balance is 10,00,000 but 8,00,000 is already reserved → 2,00,000 avail.
    adminMocks.brandLookup.mockResolvedValueOnce({
      data: {
        id: "brand-1",
        credits_balance_paise: 10_00_000,
        credits_reserved_paise: 8_00_000,
      },
      error: null,
    });
    const res = await callRoute({ listing_id: VALID_LISTING_UUID });
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.available_paise).toBe(2_00_000);
  });

  it("happy path: creates request row + reserves credits", async () => {
    const res = await callRoute({
      listing_id: VALID_LISTING_UUID,
      brand_notes: "Please use earthy palette",
    });
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.license_request).toMatchObject({
      id: "request-1",
      status: "requested",
    });
    expect(body.checkout_breakdown).toEqual({
      base_paise: 6_00_000,
      commission_paise: 1_08_000,
      gst_on_commission_paise: 19_440,
      total_paise: 7_27_440,
    });

    // Insert row persisted the frozen pricing snapshot.
    expect(adminMocks.requestInsert).toHaveBeenCalled();

    // Reserve was called with the TOTAL (7,27,440), not just base.
    expect(commitCreditReserveMock).toHaveBeenCalledWith({
      brandId: "brand-1",
      amountPaise: 7_27_440,
      refType: "license_request",
      refId: "request-1",
    });
  });

  it("402 when commitCreditReserve fails with 'insufficient credits' race", async () => {
    // Pre-flight passes, but by the time the PL/pgSQL fn runs, another request
    // consumed our balance. The procedure surfaces 'insufficient credits'.
    const { LedgerError } = await import("@/lib/ledger/commit");
    commitCreditReserveMock.mockRejectedValueOnce(
      new LedgerError(
        "commit_credit_reserve failed: insufficient credits",
        null,
      ),
    );
    const res = await callRoute({ listing_id: VALID_LISTING_UUID });
    expect(res.status).toBe(402);

    // Orphan request row is flipped to 'cancelled' so we don't leak phantom
    // 'requested' rows.
    expect(adminMocks.requestUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "cancelled" }),
      "id",
      "request-1",
    );
  });

  it("500 when commitCreditReserve fails for non-credit reason", async () => {
    const { LedgerError } = await import("@/lib/ledger/commit");
    commitCreditReserveMock.mockRejectedValueOnce(
      new LedgerError("commit_credit_reserve failed: brand not found", null),
    );
    const res = await callRoute({ listing_id: VALID_LISTING_UUID });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("reserve_failed");
  });

  it("500 when insert itself fails", async () => {
    adminMocks.requestInsert.mockResolvedValueOnce({
      data: null,
      error: { message: "db boom" },
    });
    const res = await callRoute({ listing_id: VALID_LISTING_UUID });
    expect(res.status).toBe(500);
    // We should NOT have attempted the reserve since insert failed first.
    expect(commitCreditReserveMock).not.toHaveBeenCalled();
  });

  it("400 when brand_notes exceeds max length", async () => {
    const longNotes = "x".repeat(1001);
    const res = await callRoute({
      listing_id: VALID_LISTING_UUID,
      brand_notes: longNotes,
    });
    expect(res.status).toBe(400);
  });
});
