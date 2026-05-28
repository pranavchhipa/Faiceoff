import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

/**
 * POST   /api/brand/saved/[creatorId]  — save a creator (heart on)
 * DELETE /api/brand/saved/[creatorId]  — unsave a creator (heart off)
 *
 * Idempotent on both sides:
 *   - POST   uses upsert(...{ onConflict: 'brand_id,creator_id' }) so the
 *            same id can be hearted twice without erroring (the UI optimistic
 *            update can race with realtime; we want both to land softly).
 *   - DELETE deletes by composite key and treats "no row" as success.
 *
 * Server validates the creator id is a real creator so a tampered client
 * can't pollute the table. The brand id is always derived from the auth
 * session — never trusted from the URL.
 */

async function resolveBrandId(userId: string): Promise<string | null> {
  const admin = createAdminClient() as Admin;
  const { data: brand } = await admin
    .from("brands")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  return brand?.id ?? null;
}

async function ensureCreatorExists(creatorId: string): Promise<boolean> {
  const admin = createAdminClient() as Admin;
  const { data } = await admin
    .from("creators")
    .select("id")
    .eq("id", creatorId)
    .maybeSingle();
  return Boolean(data);
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ creatorId: string }> },
) {
  const { creatorId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const brandId = await resolveBrandId(user.id);
  if (!brandId) {
    return NextResponse.json(
      { error: "Brand profile not found — finish onboarding first" },
      { status: 404 },
    );
  }

  if (!(await ensureCreatorExists(creatorId))) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  const admin = createAdminClient() as Admin;
  const { error } = await admin
    .from("brand_saved_creators")
    .upsert(
      { brand_id: brandId, creator_id: creatorId },
      { onConflict: "brand_id,creator_id" },
    );
  if (error) {
    console.error("[brand/saved/POST] upsert failed", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, saved: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ creatorId: string }> },
) {
  const { creatorId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const brandId = await resolveBrandId(user.id);
  if (!brandId) {
    // No brand row = nothing could have been saved. Idempotent success.
    return NextResponse.json({ ok: true, saved: false });
  }

  const admin = createAdminClient() as Admin;
  const { error } = await admin
    .from("brand_saved_creators")
    .delete()
    .eq("brand_id", brandId)
    .eq("creator_id", creatorId);
  if (error) {
    console.error("[brand/saved/DELETE] delete failed", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, saved: false });
}
