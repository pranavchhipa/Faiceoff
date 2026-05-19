import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

/**
 * POST /api/creator/profile/publish
 *
 * Body: { published: boolean }
 *
 * Toggles profile_published. Requires at least 1 ready demo sample before
 * the creator can publish (no empty profiles in the wild).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { published?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.published !== "boolean") {
    return NextResponse.json({ error: "published must be boolean" }, { status: 400 });
  }

  const admin = createAdminClient() as Admin;

  const { data: creator } = await admin
    .from("creators")
    .select("id, profile_slug, profile_published, profile_published_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!creator) {
    return NextResponse.json({ error: "Creator profile not found" }, { status: 404 });
  }

  if (body.published) {
    if (!creator.profile_slug) {
      return NextResponse.json(
        { error: "Pick a slug + categories first" },
        { status: 400 },
      );
    }
    const { count: readyCount } = await admin
      .from("creator_demo_samples")
      .select("id", { count: "exact", head: true })
      .eq("creator_id", creator.id)
      .eq("is_visible", true)
      .eq("status", "ready");
    if (!readyCount || readyCount === 0) {
      return NextResponse.json(
        { error: "Wait until at least 1 demo finishes generating before publishing" },
        { status: 400 },
      );
    }
  }

  const update: Record<string, unknown> = { profile_published: body.published };
  if (body.published && !creator.profile_published_at) {
    update.profile_published_at = new Date().toISOString();
  }

  const { error: upErr } = await admin
    .from("creators")
    .update(update)
    .eq("id", creator.id);
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    published: body.published,
    slug: creator.profile_slug,
    url: creator.profile_slug ? `/creators/${creator.profile_slug}` : null,
  });
}
