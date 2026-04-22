// ─────────────────────────────────────────────────────────────────────────────
// /api/licenses/listings — creator listings CRUD
// Ref plan Task 20 / spec §5.1 creator_license_listings
// ─────────────────────────────────────────────────────────────────────────────
//
// GET:
//   - No ?creator_id filter + caller is creator → return own listings (all).
//   - No ?creator_id filter + caller is brand   → return all active listings
//                                                  (paginated, default 20/page).
//   - ?creator_id=... + caller is brand/admin   → return that creator's active
//                                                  listings.
//   Each row includes the joined creator profile fields (display_name,
//   avatar_url, instagram_handle) so the brand UI doesn't need a second query.
//
// POST:
//   - role=creator only.
//   - One listing per template (DB unique (creator_id, template)). If the
//     creator already has a listing for this template → 409.
//   - `ig_post_required` is derived from template (never trusts client input).
//
// All DB writes go through the admin client (RLS bypass) after auth has
// established the caller's role + ownership — standard project pattern.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CreateListingSchema,
  type CreatorLicenseListingRow,
  type CreatorLicenseListingWithCreator,
} from "@/domains/license/types";
import { templateRequiresIgPost } from "@/domains/license/templates";

const DEFAULT_PAGE_SIZE = 20;

// ─── Narrow typed handle — DB types don't yet know the migrations 20-30 tables
interface ListingsAdmin {
  from(table: string): {
    select(cols?: string): ListingsSelectBuilder;
    insert(row: Record<string, unknown>): {
      select(): {
        single(): Promise<{
          data: Record<string, unknown> | null;
          error: { message: string; code?: string } | null;
        }>;
      };
    };
  };
}

interface ListingsSelectBuilder {
  eq(col: string, val: string | boolean): ListingsSelectBuilder;
  or(filters: string): ListingsSelectBuilder;
  order(col: string, opts: { ascending: boolean }): ListingsSelectBuilder;
  limit(n: number): ListingsSelectBuilder;
  range(from: number, to: number): ListingsSelectBuilder;
  maybeSingle(): Promise<{
    data: Record<string, unknown> | null;
    error: { message: string; code?: string } | null;
  }>;
  // terminal: plain await returns a list
  then<T>(
    onFulfilled: (v: {
      data: Record<string, unknown>[] | null;
      error: { message: string; code?: string } | null;
    }) => T,
  ): Promise<T>;
}

function isUniqueViolation(error: {
  message: string;
  code?: string;
} | null): boolean {
  if (!error) return false;
  if (error.code === "23505") return true;
  return /duplicate key|unique constraint/i.test(error.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient() as unknown as ListingsAdmin;

  // Resolve caller role — a user may only be one of brand or creator.
  const { data: creator } = await admin
    .from("creators")
    .select("id, user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const { data: brand } = await admin
    .from("brands")
    .select("id, user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!creator && !brand) {
    return NextResponse.json({ error: "no_profile" }, { status: 403 });
  }

  const url = new URL(req.url);
  const creatorIdFilter = url.searchParams.get("creator_id");
  const pageSize = clampInt(
    url.searchParams.get("limit"),
    DEFAULT_PAGE_SIZE,
    1,
    100,
  );
  const cursor = parseInt(url.searchParams.get("cursor") ?? "0", 10);
  const offset = Number.isFinite(cursor) && cursor >= 0 ? cursor : 0;

  // Build query — admin-scoped so RLS isn't in play; we enforce visibility here.
  const selectExpr = `id, creator_id, template, price_paise, image_quota,
    validity_days, ig_post_required, is_active, created_at, updated_at,
    creators:creator_id ( id, display_name, avatar_url, instagram_handle )`;

  const builder = admin
    .from("creator_license_listings")
    .select(selectExpr);

  let filter = builder;
  if (creatorIdFilter) {
    // Scoped query: brands browsing a specific creator. Show only active listings.
    filter = filter.eq("creator_id", creatorIdFilter).eq("is_active", true);
  } else if (creator) {
    // Creator browsing own shelf. Show all (incl. inactive) so they can reactivate.
    filter = filter.eq("creator_id", (creator as { id: string }).id);
  } else {
    // Brand without filter = discovery feed. Active listings only.
    filter = filter.eq("is_active", true);
  }

  const { data: rows, error } = await filter
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (error) {
    console.error("[licenses/listings GET] query failed", error);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  const listings = (rows ?? []).map(normaliseListingWithCreator);
  const next_cursor =
    listings.length === pageSize ? String(offset + pageSize) : undefined;

  return NextResponse.json({ listings, next_cursor });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Role gate: creator only.
  const admin = createAdminClient() as unknown as ListingsAdmin;
  const { data: creator } = await admin
    .from("creators")
    .select("id, user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!creator) {
    return NextResponse.json(
      { error: "forbidden", reason: "only_creators_can_list" },
      { status: 403 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = CreateListingSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const { template, price_paise, image_quota, validity_days } = parsed.data;

  const creatorId = (creator as { id: string }).id;

  const { data: row, error } = await admin
    .from("creator_license_listings")
    .insert({
      creator_id: creatorId,
      template,
      price_paise,
      image_quota,
      validity_days,
      ig_post_required: templateRequiresIgPost(template),
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        {
          error: "listing_exists",
          message:
            "You already have a listing for this template. PATCH it instead.",
        },
        { status: 409 },
      );
    }
    console.error("[licenses/listings POST] insert failed", error);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ listing: normaliseListing(row!) }, { status: 201 });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function clampInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normaliseListing(row: Record<string, unknown>): CreatorLicenseListingRow {
  return {
    id: row.id as string,
    creator_id: row.creator_id as string,
    template: row.template as CreatorLicenseListingRow["template"],
    price_paise: row.price_paise as number,
    image_quota: row.image_quota as number,
    validity_days: row.validity_days as number,
    ig_post_required: row.ig_post_required as boolean,
    is_active: row.is_active as boolean,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function normaliseListingWithCreator(
  row: Record<string, unknown>,
): CreatorLicenseListingWithCreator {
  const base = normaliseListing(row);
  const creatorJoin = (row.creators ?? {}) as Record<string, unknown>;
  return {
    ...base,
    creator: {
      id: (creatorJoin.id as string | null) ?? base.creator_id,
      display_name: (creatorJoin.display_name as string | null) ?? null,
      avatar_url: (creatorJoin.avatar_url as string | null) ?? null,
      instagram_handle: (creatorJoin.instagram_handle as string | null) ?? null,
    },
  };
}
