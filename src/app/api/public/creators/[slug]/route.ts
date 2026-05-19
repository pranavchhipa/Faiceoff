import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

/**
 * GET /api/public/creators/[slug]
 *
 * Public endpoint — no auth required by default. Returns the data needed to
 * render the brand-facing creator profile page. Increments profile_view_count.
 *
 * Returns 404 if:
 *   - No creator with this slug
 *   - profile_published = false  AND  ?preview=1 is NOT set / not the owner
 *
 * Preview mode: when `?preview=1` is on the URL and the authenticated user
 * owns this creator row, we bypass the published check so the creator can
 * see exactly what brands will see before flipping the switch.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const url = new URL(request.url);
  const isPreview = url.searchParams.get("preview") === "1";

  if (!slug || typeof slug !== "string") {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  const admin = createAdminClient() as Admin;

  // ── Resolve creator (preview-aware) ──────────────────────────────────────
  // Build the query without the published filter, then enforce it in code so
  // we can branch on auth for preview mode.
  const { data: creator } = await admin
    .from("creators")
    .select(
      `
      id,
      user_id,
      profile_slug,
      profile_published,
      profile_published_at,
      profile_theme,
      selected_categories,
      bio,
      instagram_handle,
      instagram_followers,
      instagram_profile_pic_url,
      instagram_account_type,
      instagram_verified,
      instagram_media_count,
      youtube_handle,
      youtube_subscribers,
      is_live
      `,
    )
    .eq("profile_slug", slug.toLowerCase())
    .maybeSingle();

  if (!creator) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // If not published, only allow viewing in preview mode and only the OWNER.
  if (!creator.profile_published) {
    if (!isPreview) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Owner check via Supabase auth
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== creator.user_id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  // ── Bump view count (best-effort, fire-and-forget) ──────────────────────
  // Skip in preview mode — don't inflate analytics with owner's own views.
  if (!isPreview) {
    void (async () => {
      try {
        const { data: row } = await admin
          .from("creators")
          .select("profile_view_count")
          .eq("id", creator.id)
          .maybeSingle();
        const next = (row?.profile_view_count ?? 0) + 1;
        await admin
          .from("creators")
          .update({ profile_view_count: next })
          .eq("id", creator.id);
      } catch {
        // ignore
      }
    })();
  }

  // ── Display name from users table ────────────────────────────────────────
  const { data: userRow } = await admin
    .from("users")
    .select("display_name, avatar_url")
    .eq("id", creator.user_id)
    .maybeSingle();

  // ── Demo samples (only visible + ready) ─────────────────────────────────
  const { data: samples } = await admin
    .from("creator_demo_samples")
    .select("id, category, image_url, created_at")
    .eq("creator_id", creator.id)
    .eq("is_visible", true)
    .eq("status", "ready");

  // ── Active creator packages (tiers + pricing) ───────────────────────────
  const { data: packages } = await admin
    .from("creator_packages")
    .select("id, tier, price_paise, final_images, description")
    .eq("creator_id", creator.id)
    .eq("is_active", true)
    .order("price_paise", { ascending: true });

  // ── Trust metrics — completed collabs + approval rate ───────────────────
  const { count: completedCollabs } = await admin
    .from("collab_sessions")
    .select("id", { count: "exact", head: true })
    .eq("creator_id", creator.id)
    .eq("status", "completed");

  // Approval rate (approved / (approved + rejected)) — best effort
  let approvalRate: number | null = null;
  const { count: approvedCount } = await admin
    .from("approvals")
    .select("id", { count: "exact", head: true })
    .eq("creator_id", creator.id)
    .eq("status", "approved");
  const { count: rejectedCount } = await admin
    .from("approvals")
    .select("id", { count: "exact", head: true })
    .eq("creator_id", creator.id)
    .eq("status", "rejected");
  const a = approvedCount ?? 0;
  const r = rejectedCount ?? 0;
  if (a + r >= 3) {
    approvalRate = Math.round((a / (a + r)) * 100);
  }

  return NextResponse.json({
    slug: creator.profile_slug,
    published: Boolean(creator.profile_published),
    preview: isPreview && !creator.profile_published,
    published_at: creator.profile_published_at,
    theme: creator.profile_theme ?? "default",
    is_live: Boolean(creator.is_live),
    creator: {
      display_name: userRow?.display_name ?? creator.instagram_handle ?? "Creator",
      avatar_url:
        creator.instagram_profile_pic_url ?? userRow?.avatar_url ?? null,
      bio: creator.bio ?? null,
      instagram_handle: creator.instagram_handle,
      instagram_followers: creator.instagram_followers,
      instagram_account_type: creator.instagram_account_type,
      instagram_verified: Boolean(creator.instagram_verified),
      instagram_media_count: creator.instagram_media_count,
      youtube_handle: creator.youtube_handle ?? null,
      youtube_subscribers: creator.youtube_subscribers ?? null,
    },
    categories: creator.selected_categories ?? [],
    samples: (samples ?? []).map((s: { id: string; category: string; image_url: string; created_at: string }) => ({
      id: s.id,
      category: s.category,
      image_url: s.image_url,
      created_at: s.created_at,
    })),
    packages: (packages ?? []).map(
      (p: { id: string; tier: string; price_paise: number; final_images: number; description: string | null }) => ({
        id: p.id,
        tier: p.tier,
        price_paise: p.price_paise,
        final_images: p.final_images,
        description: p.description,
      }),
    ),
    stats: {
      completed_collabs: completedCollabs ?? 0,
      approval_rate_pct: approvalRate,
    },
  });
}
