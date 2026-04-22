// ─────────────────────────────────────────────────────────────────────────────
// GET /api/licenses/[id] — detail view for a license_request
// Ref plan Task 22 / spec §4.3
// ─────────────────────────────────────────────────────────────────────────────
//
// Access gate: caller must be one of
//   • the creator on the request
//   • the brand   on the request
//   • a platform admin (users.role = 'admin')
//
// Otherwise 403 (request not theirs) or 404 (request does not exist). We
// deliberately return 404 before 403 when the row is missing because there's
// nothing to be "forbidden" from.
//
// RLS would cover this at the DB layer too, but we use the admin client for
// the read so we can serve a single crisp error per case (not "empty result").
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { type LicenseRequestRow } from "@/domains/license/types";

interface DetailAdmin {
  from(table: string): {
    select(cols?: string): {
      eq(col: string, val: string): {
        maybeSingle(): Promise<{
          data: Record<string, unknown> | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient() as unknown as DetailAdmin;

  // ── 2. Resolve caller's roles in parallel.
  // A user may have neither, one, or (in edge cases) both rows. We also
  // check the users.role for admin.
  const [creatorRes, brandRes, userRes] = await Promise.all([
    admin
      .from("creators")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle(),
    admin
      .from("brands")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle(),
    admin
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const creatorId = (creatorRes.data as { id?: string } | null)?.id;
  const brandId = (brandRes.data as { id?: string } | null)?.id;
  const isAdmin =
    (userRes.data as { role?: string } | null)?.role === "admin";

  if (!creatorId && !brandId && !isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // ── 3. Load the request.
  const { data: row, error } = await admin
    .from("license_requests")
    .select(
      // Explicit column list in case we ever add internal-only columns.
      "id, listing_id, creator_id, brand_id, status, base_paise, commission_paise, gst_on_commission_paise, total_paise, image_quota, validity_days, release_per_image_paise, images_requested, images_approved, images_rejected, requested_at, accepted_at, activated_at, expires_at, completed_at, brand_notes, creator_reject_reason, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[licenses/:id GET] lookup failed", error);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // ── 4. Party gate.
  const licenseCreatorId = (row as { creator_id: string }).creator_id;
  const licenseBrandId = (row as { brand_id: string }).brand_id;
  const isParty =
    (creatorId && creatorId === licenseCreatorId) ||
    (brandId && brandId === licenseBrandId);

  if (!isParty && !isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    license_request: row as unknown as LicenseRequestRow,
  });
}
