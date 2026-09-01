// ─────────────────────────────────────────────────────────────────────────────
// Public creators — server-side data for SEO surfaces
//
// Powers the /creators directory, /creators/category/[category] pages, and the
// dynamic sitemap. Reads only PUBLISHED profiles via the admin client (these
// are public pages, no auth). Cache with `revalidate` at the page level.
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from "@/lib/supabase/admin";
import type { DemoCategoryKey } from "@/lib/profile/demo-prompts";
import type { SocialPlatform } from "@/lib/profile/platform-detect";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export interface PublicCreatorCard {
  slug: string;
  display_name: string;
  avatar_url: string | null;
  /** First ready demo image — used as the card cover */
  cover_image_url: string | null;
  categories: DemoCategoryKey[];
  followers: number | null;
  verified: boolean;
  is_live: boolean;
}

/**
 * List published creator profiles, optionally filtered to one category.
 * Returns lightweight card data + a cover image (first ready demo sample).
 * Callers that render fewer cards should pass their own `limit`.
 */
export async function listPublishedCreators(
  category?: DemoCategoryKey,
  limit = 60,
): Promise<PublicCreatorCard[]> {
  const admin = createAdminClient() as Admin;

  let query = admin
    .from("creators")
    .select(
      `
      id, user_id, profile_slug, selected_categories,
      instagram_followers, instagram_profile_pic_url,
      instagram_verified, is_live
      `,
    )
    .eq("profile_published", true)
    .not("profile_slug", "is", null)
    .order("instagram_followers", { ascending: false, nullsFirst: false })
    .limit(limit);

  // Postgres array contains filter for category
  if (category) {
    query = query.contains("selected_categories", [category]);
  }

  const { data: creators, error } = await query;
  if (error || !creators || creators.length === 0) return [];

  const creatorIds = creators.map((c: { id: string }) => c.id);
  const userIds = creators.map((c: { user_id: string }) => c.user_id);

  // Batch-fetch display names + one cover demo per creator (parallel)
  const [usersRes, samplesRes] = await Promise.all([
    admin.from("users").select("id, display_name, avatar_url").in("id", userIds),
    admin
      .from("creator_demo_samples")
      .select("creator_id, image_url, created_at")
      .in("creator_id", creatorIds)
      .eq("is_visible", true)
      .eq("status", "ready")
      .order("created_at", { ascending: true }),
  ]);

  const userById = new Map<string, { display_name: string | null; avatar_url: string | null }>();
  for (const u of usersRes.data ?? []) {
    userById.set(u.id, { display_name: u.display_name, avatar_url: u.avatar_url });
  }

  // First ready sample per creator = cover
  const coverByCreator = new Map<string, string>();
  for (const s of samplesRes.data ?? []) {
    if (!coverByCreator.has(s.creator_id) && s.image_url) {
      coverByCreator.set(s.creator_id, s.image_url);
    }
  }

  return creators.map(
    (c: {
      id: string;
      user_id: string;
      profile_slug: string;
      selected_categories: DemoCategoryKey[] | null;
      instagram_followers: number | null;
      instagram_profile_pic_url: string | null;
      instagram_verified: boolean | null;
      is_live: boolean | null;
    }) => {
      const u = userById.get(c.user_id);
      return {
        slug: c.profile_slug,
        display_name: u?.display_name ?? "Creator",
        avatar_url: c.instagram_profile_pic_url ?? u?.avatar_url ?? null,
        cover_image_url: coverByCreator.get(c.id) ?? null,
        categories: c.selected_categories ?? [],
        followers: c.instagram_followers,
        verified: Boolean(c.instagram_verified),
        is_live: Boolean(c.is_live),
      };
    },
  );
}

export interface PublicCreatorProfile {
  /** creators.id — internal, used for the view-count bump. Never rendered. */
  id: string;
  /** Row owner — used by the profile page for the preview-mode owner check. */
  user_id: string;
  slug: string;
  published: boolean;
  published_at: string | null;
  theme: string;
  is_live: boolean;
  creator: {
    display_name: string;
    avatar_url: string | null;
    bio: string | null;
    instagram_handle: string | null;
    instagram_followers: number | null;
    instagram_account_type: string | null;
    instagram_verified: boolean;
    instagram_media_count: number | null;
    youtube_handle: string | null;
    youtube_subscribers: number | null;
  };
  categories: DemoCategoryKey[];
  links: Array<{
    id: string;
    label: string;
    url: string;
    /**
     * Tagged by the links API when a creator saves their list. Older rows
     * (saved before the tag column landed) don't have this — consumers fall
     * back to detectPlatform() so the icon row still works.
     */
    platform?: SocialPlatform | null;
  }>;
  samples: Array<{
    id: string;
    category: DemoCategoryKey;
    image_url: string;
    created_at: string;
  }>;
  packages: Array<{
    id: string;
    tier: string;
    price_paise: number;
    final_images: number;
    description: string | null;
  }>;
  stats: {
    completed_collabs: number;
    approval_rate_pct: number | null;
  };
}

/**
 * Full public profile for /creators/[slug] — the query logic that used to live
 * in GET /api/public/creators/[slug], callable directly from server components
 * (no self-HTTP round-trip). Public data only; no auth, no view-count bump.
 *
 * Returns null when the slug doesn't exist, or when the profile is
 * unpublished and `includeUnpublished` isn't set. Callers passing
 * `includeUnpublished: true` (owner preview) must do their own owner check
 * against the returned `user_id`.
 */
export async function getPublicCreatorProfile(
  slug: string,
  opts: { includeUnpublished?: boolean } = {},
): Promise<PublicCreatorProfile | null> {
  if (!slug || typeof slug !== "string") return null;

  const admin = createAdminClient() as Admin;

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
      profile_links,
      is_live
      `,
    )
    .eq("profile_slug", slug.toLowerCase())
    .maybeSingle();

  if (!creator) return null;
  if (!creator.profile_published && !opts.includeUnpublished) return null;

  // All creator-scoped reads run in PARALLEL (they only need creator.id)
  const [userRes, samplesRes, packagesRes, completedRes, approvedRes, rejectedRes] =
    await Promise.all([
      admin
        .from("users")
        .select("display_name, avatar_url")
        .eq("id", creator.user_id)
        .maybeSingle(),
      admin
        .from("creator_demo_samples")
        .select("id, category, image_url, created_at")
        .eq("creator_id", creator.id)
        .eq("is_visible", true)
        .eq("status", "ready"),
      admin
        .from("creator_packages")
        .select("id, tier, price_paise, final_images, description")
        .eq("creator_id", creator.id)
        .eq("is_active", true)
        .order("price_paise", { ascending: true }),
      admin
        .from("collab_sessions")
        .select("id", { count: "exact", head: true })
        .eq("creator_id", creator.id)
        .eq("status", "completed"),
      admin
        .from("approvals")
        .select("id", { count: "exact", head: true })
        .eq("creator_id", creator.id)
        .eq("status", "approved"),
      admin
        .from("approvals")
        .select("id", { count: "exact", head: true })
        .eq("creator_id", creator.id)
        .eq("status", "rejected"),
    ]);

  const userRow = userRes.data;

  // Approval rate (approved / (approved + rejected)) — best effort
  let approvalRate: number | null = null;
  const a = approvedRes.count ?? 0;
  const r = rejectedRes.count ?? 0;
  if (a + r >= 3) {
    approvalRate = Math.round((a / (a + r)) * 100);
  }

  return {
    id: creator.id,
    user_id: creator.user_id,
    slug: creator.profile_slug,
    published: Boolean(creator.profile_published),
    published_at: creator.profile_published_at,
    theme: creator.profile_theme ?? "default",
    is_live: Boolean(creator.is_live),
    creator: {
      display_name: userRow?.display_name ?? creator.instagram_handle ?? "Creator",
      avatar_url: creator.instagram_profile_pic_url ?? userRow?.avatar_url ?? null,
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
    links: Array.isArray(creator.profile_links) ? creator.profile_links : [],
    samples: samplesRes.data ?? [],
    packages: packagesRes.data ?? [],
    stats: {
      completed_collabs: completedRes.count ?? 0,
      approval_rate_pct: approvalRate,
    },
  };
}

/**
 * Best-effort profile view counter — call fire-and-forget (`void ...`) from
 * the profile page. Never throws, never blocks render.
 */
export async function bumpProfileViewCount(creatorId: string): Promise<void> {
  try {
    const admin = createAdminClient() as Admin;
    const { data: row } = await admin
      .from("creators")
      .select("profile_view_count")
      .eq("id", creatorId)
      .maybeSingle();
    const next = (row?.profile_view_count ?? 0) + 1;
    await admin
      .from("creators")
      .update({ profile_view_count: next })
      .eq("id", creatorId);
  } catch {
    // ignore — analytics only
  }
}

/** Just the slugs of published creators — for the sitemap. */
export async function listPublishedCreatorSlugs(): Promise<string[]> {
  const admin = createAdminClient() as Admin;
  const { data } = await admin
    .from("creators")
    .select("profile_slug")
    .eq("profile_published", true)
    .not("profile_slug", "is", null);
  return (data ?? [])
    .map((c: { profile_slug: string }) => c.profile_slug)
    .filter(Boolean);
}
