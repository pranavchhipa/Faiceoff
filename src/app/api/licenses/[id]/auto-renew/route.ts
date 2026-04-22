// ─────────────────────────────────────────────────────────────────────────────
// POST /api/licenses/[id]/auto-renew — toggle auto-renewal on a license
// Task E14 / Phase 3 Group C
// ─────────────────────────────────────────────────────────────────────────────
//
// Body: { enabled: boolean }
//
// Access: brand party only (brands control their own auto-renewal preference).
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLicense, LicenseError } from "@/lib/licenses";

export async function POST(
  req: NextRequest,
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

  // ── 2. Parse body ────────────────────────────────────────────────────────────
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (
    typeof rawBody !== "object" ||
    rawBody === null ||
    typeof (rawBody as { enabled?: unknown }).enabled !== "boolean"
  ) {
    return NextResponse.json(
      { error: "invalid_input", message: "`enabled` (boolean) is required" },
      { status: 400 },
    );
  }
  const enabled = (rawBody as { enabled: boolean }).enabled;

  // ── 3. Resolve brand ─────────────────────────────────────────────────────────
  const admin = createAdminClient() as any;
  const { data: brandRow } = await admin
    .from("brands")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!brandRow) {
    return NextResponse.json(
      { error: "forbidden", reason: "brands_only" },
      { status: 403 },
    );
  }
  const brandId = (brandRow as { id: string }).id;

  // ── 4. Fetch license and verify brand party ──────────────────────────────────
  let license;
  try {
    license = await getLicense(id);
  } catch (err) {
    if (err instanceof LicenseError) {
      if (err.code === "LICENSE_NOT_FOUND") {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: err.statusCode },
      );
    }
    console.error("[licenses/[id]/auto-renew POST] unexpected error", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (license.brand_id !== brandId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // ── 5. Update auto_renew ─────────────────────────────────────────────────────
  const { error: updateError } = await admin
    .from("licenses")
    .update({ auto_renew: enabled })
    .eq("id", id);

  if (updateError) {
    console.error("[licenses/[id]/auto-renew POST] update failed", updateError);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ auto_renew: enabled });
}
