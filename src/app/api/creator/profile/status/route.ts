import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

/**
 * GET /api/creator/profile/status
 *
 * Returns the authenticated creator's profile state + all visible demo
 * samples (any status). UI polls this every 5s while any sample is pending.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient() as Admin;

  const { data: creator } = await admin
    .from("creators")
    .select(
      "id, profile_slug, selected_categories, profile_published, profile_published_at, profile_theme, profile_view_count, profile_links, cover_image_path",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (!creator) {
    return NextResponse.json({ creator: null });
  }

  const { data: samples } = await admin
    .from("creator_demo_samples")
    .select("id, category, status, image_url, regeneration_count, error_message, created_at")
    .eq("creator_id", creator.id)
    .eq("is_visible", true)
    .order("created_at", { ascending: true });

  // Sign the cover image so the setup page can preview it without exposing
  // the raw storage path. 1h is plenty for the page session.
  let coverImageUrl: string | null = null;
  if (creator.cover_image_path) {
    const { data: signed } = await admin.storage
      .from("reference-photos")
      .createSignedUrl(creator.cover_image_path, 3600);
    coverImageUrl = signed?.signedUrl ?? null;
  }

  return NextResponse.json({
    creator: {
      slug: creator.profile_slug,
      categories: creator.selected_categories ?? [],
      published: Boolean(creator.profile_published),
      published_at: creator.profile_published_at,
      theme: creator.profile_theme,
      view_count: creator.profile_view_count,
      links: creator.profile_links ?? [],
      cover_image_path: creator.cover_image_path ?? null,
      cover_image_url: coverImageUrl,
    },
    samples: samples ?? [],
  });
}
