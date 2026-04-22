// ─────────────────────────────────────────────────────────────────────────────
// GET /api/licenses/[id] — route tests
// ─────────────────────────────────────────────────────────────────────────────
//
// Access gate: only the creator or the brand party on the license_request
// (or an admin) may view it. Everyone else → 403.
// ─────────────────────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();

interface AdminMocks {
  creatorLookup: ReturnType<typeof vi.fn>;
  brandLookup: ReturnType<typeof vi.fn>;
  userLookup: ReturnType<typeof vi.fn>;
  requestLookup: ReturnType<typeof vi.fn>;
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
      if (table === "brands") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: adminMocks.brandLookup }),
          }),
        };
      }
      if (table === "users") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: adminMocks.userLookup }),
          }),
        };
      }
      if (table === "license_requests") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: adminMocks.requestLookup }),
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

async function callGet(id: string) {
  const { GET } = await import("../route");
  const req = new Request(`http://localhost/api/licenses/${id}`, {
    method: "GET",
  });
  return GET(req as unknown as Parameters<typeof GET>[0], {
    params: Promise.resolve({ id }),
  } as Parameters<typeof GET>[1]);
}

function defaultMocks(): AdminMocks {
  return {
    creatorLookup: vi
      .fn()
      .mockResolvedValue({ data: null, error: null }),
    brandLookup: vi.fn().mockResolvedValue({ data: null, error: null }),
    userLookup: vi
      .fn()
      .mockResolvedValue({ data: { role: "brand" }, error: null }),
    requestLookup: vi.fn().mockResolvedValue({
      data: {
        id: "lr-1",
        listing_id: "listing-1",
        creator_id: "creator-1",
        brand_id: "brand-1",
        status: "requested",
        base_paise: 600000,
        commission_paise: 108000,
        gst_on_commission_paise: 19440,
        total_paise: 727440,
        image_quota: 25,
        validity_days: 90,
        release_per_image_paise: 24000,
        brand_notes: null,
        creator_reject_reason: null,
        created_at: "2026-04-22T00:00:00Z",
        updated_at: "2026-04-22T00:00:00Z",
      },
      error: null,
    }),
  };
}

describe("GET /api/licenses/[id]", () => {
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
    const res = await callGet("lr-1");
    expect(res.status).toBe(401);
  });

  it("404 when the license request does not exist", async () => {
    adminMocks.requestLookup.mockResolvedValue({ data: null, error: null });
    adminMocks.brandLookup.mockResolvedValue({
      data: { id: "brand-1" },
      error: null,
    });
    const res = await callGet("lr-ghost");
    expect(res.status).toBe(404);
  });

  it("403 when the caller has no profile at all", async () => {
    const res = await callGet("lr-1");
    expect(res.status).toBe(403);
  });

  it("403 when the caller is a brand on a different request", async () => {
    adminMocks.brandLookup.mockResolvedValue({
      data: { id: "different-brand" },
      error: null,
    });
    const res = await callGet("lr-1");
    expect(res.status).toBe(403);
  });

  it("403 when the caller is a creator on a different request", async () => {
    adminMocks.creatorLookup.mockResolvedValue({
      data: { id: "different-creator" },
      error: null,
    });
    const res = await callGet("lr-1");
    expect(res.status).toBe(403);
  });

  it("happy path: creator party sees the request", async () => {
    adminMocks.creatorLookup.mockResolvedValue({
      data: { id: "creator-1" },
      error: null,
    });
    const res = await callGet("lr-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.license_request).toMatchObject({
      id: "lr-1",
      status: "requested",
      total_paise: 727440,
    });
  });

  it("happy path: brand party sees the request", async () => {
    adminMocks.brandLookup.mockResolvedValue({
      data: { id: "brand-1" },
      error: null,
    });
    const res = await callGet("lr-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.license_request.id).toBe("lr-1");
  });

  it("admin can view any request", async () => {
    adminMocks.userLookup.mockResolvedValue({
      data: { role: "admin" },
      error: null,
    });
    // Neither brand nor creator rows for this user.
    const res = await callGet("lr-1");
    expect(res.status).toBe(200);
  });
});
