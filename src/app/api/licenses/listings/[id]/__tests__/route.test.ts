// ─────────────────────────────────────────────────────────────────────────────
// PATCH / DELETE /api/licenses/listings/[id] — route tests
// ─────────────────────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();

interface AdminMocks {
  creatorProfile: ReturnType<typeof vi.fn>;
  listingLookup: ReturnType<typeof vi.fn>;
  listingUpdate: ReturnType<typeof vi.fn>;
}

let adminMocks: AdminMocks;

function buildAdminClient() {
  return {
    from(table: string) {
      if (table === "creators") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: adminMocks.creatorProfile }),
          }),
        };
      }
      if (table === "creator_license_listings") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: adminMocks.listingLookup }),
          }),
          update: () => ({
            eq: () => ({
              select: () => ({ single: adminMocks.listingUpdate }),
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

async function callPatch(id: string, body: unknown) {
  const { PATCH } = await import("../route");
  const req = new Request(`http://localhost/api/licenses/listings/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return PATCH(req as unknown as Parameters<typeof PATCH>[0], {
    params: Promise.resolve({ id }),
  } as Parameters<typeof PATCH>[1]);
}

async function callDelete(id: string) {
  const { DELETE } = await import("../route");
  const req = new Request(`http://localhost/api/licenses/listings/${id}`, {
    method: "DELETE",
  });
  return DELETE(req as unknown as Parameters<typeof DELETE>[0], {
    params: Promise.resolve({ id }),
  } as Parameters<typeof DELETE>[1]);
}

function defaultMocks(): AdminMocks {
  return {
    creatorProfile: vi
      .fn()
      .mockResolvedValue({ data: { id: "creator-1" }, error: null }),
    listingLookup: vi.fn().mockResolvedValue({
      data: { id: "listing-1", creator_id: "creator-1" },
      error: null,
    }),
    listingUpdate: vi.fn().mockResolvedValue({
      data: {
        id: "listing-1",
        creator_id: "creator-1",
        template: "creation",
        price_paise: 700000,
        image_quota: 25,
        validity_days: 90,
        ig_post_required: false,
        is_active: true,
      },
      error: null,
    }),
  };
}

describe("PATCH /api/licenses/listings/[id]", () => {
  beforeEach(() => {
    adminMocks = defaultMocks();
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
  });

  afterEach(() => vi.clearAllMocks());

  it("401 unauth", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const res = await callPatch("listing-1", { price_paise: 700000 });
    expect(res.status).toBe(401);
  });

  it("400 empty body", async () => {
    const res = await callPatch("listing-1", {});
    expect(res.status).toBe(400);
  });

  it("403 when caller is not a creator", async () => {
    adminMocks.creatorProfile.mockResolvedValue({ data: null, error: null });
    const res = await callPatch("listing-1", { price_paise: 700000 });
    expect(res.status).toBe(403);
  });

  it("404 when listing does not exist", async () => {
    adminMocks.listingLookup.mockResolvedValue({ data: null, error: null });
    const res = await callPatch("listing-404", { price_paise: 700000 });
    expect(res.status).toBe(404);
  });

  it("403 when listing belongs to another creator", async () => {
    adminMocks.listingLookup.mockResolvedValue({
      data: { id: "listing-x", creator_id: "other-creator" },
      error: null,
    });
    const res = await callPatch("listing-x", { price_paise: 700000 });
    expect(res.status).toBe(403);
  });

  it("happy path: updates price", async () => {
    const res = await callPatch("listing-1", { price_paise: 700000 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.listing.price_paise).toBe(700000);
  });

  it("rejects out-of-range price in PATCH body", async () => {
    const res = await callPatch("listing-1", { price_paise: 50 });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/licenses/listings/[id]", () => {
  beforeEach(() => {
    adminMocks = defaultMocks();
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    // DELETE returns the row with is_active=false.
    adminMocks.listingUpdate.mockResolvedValue({
      data: {
        id: "listing-1",
        creator_id: "creator-1",
        is_active: false,
      },
      error: null,
    });
  });

  afterEach(() => vi.clearAllMocks());

  it("401 unauth", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const res = await callDelete("listing-1");
    expect(res.status).toBe(401);
  });

  it("403 when caller is not a creator", async () => {
    adminMocks.creatorProfile.mockResolvedValue({ data: null, error: null });
    const res = await callDelete("listing-1");
    expect(res.status).toBe(403);
  });

  it("404 when listing does not exist", async () => {
    adminMocks.listingLookup.mockResolvedValue({ data: null, error: null });
    const res = await callDelete("listing-ghost");
    expect(res.status).toBe(404);
  });

  it("403 when listing belongs to another creator", async () => {
    adminMocks.listingLookup.mockResolvedValue({
      data: { id: "listing-x", creator_id: "other-creator" },
      error: null,
    });
    const res = await callDelete("listing-x");
    expect(res.status).toBe(403);
  });

  it("happy path: soft-deletes via is_active=false", async () => {
    const res = await callDelete("listing-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
    expect(body.listing.is_active).toBe(false);
  });
});
