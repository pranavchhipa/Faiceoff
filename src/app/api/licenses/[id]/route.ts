// ─────────────────────────────────────────────────────────────────────────────
// GET /api/licenses/[id] — per-generation license detail (NEW system, Chunk E)
// Task E14 / Phase 3 Group C
// ─────────────────────────────────────────────────────────────────────────────
//
// COLLISION NOTE: This file previously handled the OLD `license_requests` system
// (Chunk C). That implementation has been moved to /api/legacy-licenses/[id]/
// (src/app/api/legacy-licenses/[id]/route.ts) to preserve it.
//
// The OLD sub-routes (accept, reject, contract) remain under this directory
// because they only handle POST/GET for their specific paths and don't conflict
// with the new sub-routes (certificate, auto-renew, revoke).
//
// This GET handler now serves the new `licenses` table (migration 00032).
// Access gate: caller must be brand OR creator party on the license.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLicense, LicenseError } from "@/lib/licenses";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  // ── 1. Auth ─────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ── 2. Resolve caller identity (brand OR creator) ────────────────────────────
  const admin = createAdminClient() as any;
  const [brandRes, creatorRes] = await Promise.all([
    admin.from("brands").select("id").eq("user_id", user.id).maybeSingle(),
    admin.from("creators").select("id").eq("user_id", user.id).maybeSingle(),
  ]);

  const brandId = (brandRes.data as { id?: string } | null)?.id;
  const creatorId = (creatorRes.data as { id?: string } | null)?.id;

  if (!brandId && !creatorId) {
    return NextResponse.json({ error: "forbidden", reason: "no_profile" }, { status: 403 });
  }

  // ── 3. Fetch license ─────────────────────────────────────────────────────────
  let license;
  try {
    license = await getLicense(id);
  } catch (err) {
    if (err instanceof LicenseError) {
      if (err.code === "LICENSE_NOT_FOUND") {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      console.error("[licenses/[id] GET] service error", err.code, err.message);
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: err.statusCode },
      );
    }
    console.error("[licenses/[id] GET] unexpected error", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  // ── 4. Party gate ────────────────────────────────────────────────────────────
  const isBrandParty = brandId && brandId === license.brand_id;
  const isCreatorParty = creatorId && creatorId === license.creator_id;

  if (!isBrandParty && !isCreatorParty) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json(license);
}
