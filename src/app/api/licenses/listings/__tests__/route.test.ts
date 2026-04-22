// ─────────────────────────────────────────────────────────────────────────────
// GET / POST /api/licenses/listings — route tests
// ─────────────────────────────────────────────────────────────────────────────
//
// Mocks:
//   • @/lib/supabase/server::createClient → { auth.getUser }
//   • @/lib/supabase/admin::createAdminClient → per-table chain mock
//
// The builder mock supports the exact chain we use:
//   admin.from(X).select(cols)
//     .eq(col, val)                     // optional, 0-2x
//     .order(col, opts)                 // optional
//     .range(from, to)                  // terminal for list queries
//   or
//     .maybeSingle()                    // terminal for 0-or-1 queries
//
// We simulate a chainable builder that collects the filter state and returns
// fixture data when a terminal is awaited.
// ─────────────────────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();

type Thenable = { data: unknown; error: unknown };

// Per-table terminal handlers — tests set these via adminMocks.
// We type listingsQuery as a callable mock so TS knows it can be invoked inside
// the chain builder (vi.fn()'s generic ReturnType erases the callable sig here).
interface AdminMocks {
  creatorProfile: ReturnType<typeof vi.fn>;
  brandProfile: ReturnType<typeof vi.fn>;
  listingsQuery: ReturnType<typeof vi.fn> &
    ((filters: Record<string, unknown>) => Promise<Thenable>);
  listingInsert: ReturnType<typeof vi.fn>;
}

let adminMocks: AdminMocks;

function makeListingsBuilder() {
  const filters: Record<string, unknown> = {};
  const builder: {
    eq(col: string, val: unknown): typeof builder;
    order(col: string, opts: unknown): typeof builder;
    range(from: number, to: number): Promise<Thenable>;
    maybeSingle(): Promise<Thenable>;
  } = {
    eq(col, val) {
      filters[col] = val;
      return builder;
    },
    order() {
      return builder;
    },
    async range() {
      return adminMocks.listingsQuery(filters);
    },
    async maybeSingle() {
      return adminMocks.listingsQuery(filters);
    },
  };
  return builder;
}

function buildAdminClient() {
  return {
    from(table: string) {
      if (table === "creators") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: adminMocks.creatorProfile,
            }),
          }),
        };
      }
      if (table === "brands") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: adminMocks.brandProfile,
            }),
          }),
        };
      }
      if (table === "creator_license_listings") {
        return {
          select: () => makeListingsBuilder(),
          insert: () => ({
            select: () => ({ single: adminMocks.listingInsert }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
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

async function callGet(query: string = "") {
  const { GET } = await import("../route");
  const req = new Request(`http://localhost/api/licenses/listings${query}`, {
    method: "GET",
  });
  return GET(req as unknown as Parameters<typeof GET>[0]);
}

async function callPost(body: unknown) {
  const { POST } = await import("../route");
  const req = new Request("http://localhost/api/licenses/listings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(req as unknown as Parameters<typeof POST>[0]);
}

function defaultMocks(): AdminMocks {
  return {
    creatorProfile: vi
      .fn()
      .mockResolvedValue({ data: null, error: null }),
    brandProfile: vi.fn().mockResolvedValue({ data: null, error: null }),
    listingsQuery: vi.fn().mockResolvedValue({
      data: [
        {
          id: "listing-1",
          creator_id: "creator-1",
          template: "creation",
          price_paise: 600000,
          image_quota: 25,
          validity_days: 90,
          ig_post_required: false,
          is_active: true,
          created_at: "2026-04-20T00:00:00Z",
          updated_at: "2026-04-20T00:00:00Z",
          creators: {
            id: "creator-1",
            display_name: "Priya",
            avatar_url: null,
            instagram_handle: "priya_ai",
          },
        },
      ],
      error: null,
    }),
    listingInsert: vi.fn().mockResolvedValue({
      data: {
        id: "listing-new",
        creator_id: "creator-1",
        template: "creation",
        price_paise: 600000,
        image_quota: 25,
        validity_days: 90,
        ig_post_required: false,
        is_active: true,
        created_at: "2026-04-22T00:00:00Z",
        updated_at: "2026-04-22T00:00:00Z",
      },
      error: null,
    }),
  };
}

describe("GET /api/licenses/listings", () => {
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
    const res = await callGet();
    expect(res.status).toBe(401);
  });

  it("403 when user has neither brand nor creator profile", async () => {
    const res = await callGet();
    expect(res.status).toBe(403);
  });

  it("creator sees own listings when no filter provided", async () => {
    adminMocks.creatorProfile.mockResolvedValue({
      data: { id: "creator-1", user_id: "user-1" },
      error: null,
    });

    const res = await callGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.listings).toHaveLength(1);
    expect(body.listings[0]).toMatchObject({
      id: "listing-1",
      template: "creation",
      price_paise: 600000,
      creator: {
        id: "creator-1",
        display_name: "Priya",
      },
    });
  });

  it("brand sees active listings (discovery) when no filter provided", async () => {
    adminMocks.brandProfile.mockResolvedValue({
      data: { id: "brand-1", user_id: "user-1" },
      error: null,
    });

    const res = await callGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    // Filter set by route: is_active=true
    const filters = adminMocks.listingsQuery.mock.calls[0]![0];
    expect(filters).toMatchObject({ is_active: true });
    expect(body.listings).toHaveLength(1);
  });

  it("brand with ?creator_id= filter queries that creator + active", async () => {
    adminMocks.brandProfile.mockResolvedValue({
      data: { id: "brand-1" },
      error: null,
    });

    await callGet("?creator_id=creator-xyz");
    const filters = adminMocks.listingsQuery.mock.calls[0]![0];
    expect(filters).toMatchObject({
      creator_id: "creator-xyz",
      is_active: true,
    });
  });

  it("returns next_cursor when page is full", async () => {
    adminMocks.brandProfile.mockResolvedValue({
      data: { id: "brand-1" },
      error: null,
    });
    adminMocks.listingsQuery.mockResolvedValue({
      data: Array.from({ length: 20 }, (_, i) => ({
        id: `listing-${i}`,
        creator_id: "creator-1",
        template: "creation",
        price_paise: 600000,
        image_quota: 25,
        validity_days: 90,
        ig_post_required: false,
        is_active: true,
        created_at: "2026-04-20T00:00:00Z",
        updated_at: "2026-04-20T00:00:00Z",
        creators: {
          id: "creator-1",
          display_name: "Priya",
          avatar_url: null,
          instagram_handle: null,
        },
      })),
      error: null,
    });

    const res = await callGet();
    const body = await res.json();
    expect(body.next_cursor).toBe("20");
  });
});

describe("POST /api/licenses/listings", () => {
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
    const res = await callPost({
      template: "creation",
      price_paise: 600000,
      image_quota: 25,
      validity_days: 90,
    });
    expect(res.status).toBe(401);
  });

  it("403 when caller is not a creator", async () => {
    const res = await callPost({
      template: "creation",
      price_paise: 600000,
      image_quota: 25,
      validity_days: 90,
    });
    expect(res.status).toBe(403);
  });

  it("400 when body is invalid", async () => {
    adminMocks.creatorProfile.mockResolvedValue({
      data: { id: "creator-1" },
      error: null,
    });

    const res = await callPost({ template: "bogus", price_paise: 600000 });
    expect(res.status).toBe(400);
  });

  it("happy path: creates listing with ig_post_required derived from template", async () => {
    adminMocks.creatorProfile.mockResolvedValue({
      data: { id: "creator-1" },
      error: null,
    });

    const res = await callPost({
      template: "creation_promotion",
      price_paise: 1500000,
      image_quota: 10,
      validity_days: 30,
    });

    expect(res.status).toBe(201);
    // Insert call was made with ig_post_required=true for creation_promotion.
    expect(adminMocks.listingInsert).toHaveBeenCalled();
  });

  it("409 when creator already has a listing for this template", async () => {
    adminMocks.creatorProfile.mockResolvedValue({
      data: { id: "creator-1" },
      error: null,
    });
    adminMocks.listingInsert.mockResolvedValueOnce({
      data: null,
      error: {
        message: "duplicate key value violates unique constraint",
        code: "23505",
      },
    });

    const res = await callPost({
      template: "creation",
      price_paise: 600000,
      image_quota: 25,
      validity_days: 90,
    });
    expect(res.status).toBe(409);
  });

  it("400 when price is below ₹1,000 floor", async () => {
    adminMocks.creatorProfile.mockResolvedValue({
      data: { id: "creator-1" },
      error: null,
    });

    const res = await callPost({
      template: "creation",
      price_paise: 99999,
      image_quota: 25,
      validity_days: 90,
    });
    expect(res.status).toBe(400);
  });
});
