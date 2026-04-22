// ─────────────────────────────────────────────────────────────────────────────
// GET /api/vault/[id] — single vault image detail
// Task E13 / Phase 3 Group C
// ─────────────────────────────────────────────────────────────────────────────
//
// Access: brand users only, scoped to their own generations.
// 404 if the image does not exist or belongs to a different brand.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVaultImage, VaultError } from "@/lib/vault";

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

  // ── 2. Resolve brand ─────────────────────────────────────────────────────────
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

  // ── 3. Fetch vault image (service enforces brand scoping) ────────────────────
  try {
    const image = await getVaultImage({ brandId, imageId: id });
    return NextResponse.json(image);
  } catch (err) {
    if (err instanceof VaultError) {
      if (err.code === "NOT_FOUND") {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      console.error("[vault/[id] GET] service error", err.code, err.message);
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: 500 },
      );
    }
    console.error("[vault/[id] GET] unexpected error", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
