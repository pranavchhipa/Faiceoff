// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/licenses/listings/[id]   — creator updates own listing
// DELETE /api/licenses/listings/[id]  — soft delete (is_active=false)
// Ref plan Task 20
// ─────────────────────────────────────────────────────────────────────────────
//
// Both require:
//   • auth (401 unauth)
//   • caller has a creator profile (403 not-creator)
//   • the target listing.creator_id matches the caller's creator.id (403 cross-account)
//
// PATCH accepts a partial body (at least one of price_paise / image_quota /
// validity_days / is_active). Template is immutable (see domain types.ts).
// DELETE is a soft-delete via is_active=false — we never hard-delete so
// audit + any in-flight license_requests remain referentially valid.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { UpdateListingSchema } from "@/domains/license/types";

interface UpdateAdmin {
  from(table: string): {
    select(cols?: string): {
      eq(col: string, val: string): {
        maybeSingle(): Promise<{
          data: Record<string, unknown> | null;
          error: { message: string } | null;
        }>;
      };
    };
    update(patch: Record<string, unknown>): {
      eq(col: string, val: string): {
        select(): {
          single(): Promise<{
            data: Record<string, unknown> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
}

async function resolveCreatorOwnedListing(
  admin: UpdateAdmin,
  userId: string,
  listingId: string,
): Promise<
  | { error: "no_creator" }
  | { error: "not_found" }
  | { error: "forbidden" }
  | { creatorId: string; listing: Record<string, unknown> }
> {
  const { data: creator } = await admin
    .from("creators")
    .select("id, user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!creator) return { error: "no_creator" };

  const { data: listing } = await admin
    .from("creator_license_listings")
    .select("id, creator_id")
    .eq("id", listingId)
    .maybeSingle();
  if (!listing) return { error: "not_found" };

  if (
    (listing as { creator_id: string }).creator_id !==
    (creator as { id: string }).id
  ) {
    return { error: "forbidden" };
  }

  return {
    creatorId: (creator as { id: string }).id,
    listing,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH
// ─────────────────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = UpdateListingSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const admin = createAdminClient() as unknown as UpdateAdmin;
  const result = await resolveCreatorOwnedListing(admin, user.id, id);
  if ("error" in result) {
    if (result.error === "no_creator") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (result.error === "not_found") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: updated, error } = await admin
    .from("creator_license_listings")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[licenses/listings PATCH] update failed", error);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ listing: updated });
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE (soft)
// ─────────────────────────────────────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient() as unknown as UpdateAdmin;
  const result = await resolveCreatorOwnedListing(admin, user.id, id);
  if ("error" in result) {
    if (result.error === "no_creator") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (result.error === "not_found") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: updated, error } = await admin
    .from("creator_license_listings")
    .update({ is_active: false })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[licenses/listings DELETE] soft-delete failed", error);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ listing: updated, deleted: true });
}
