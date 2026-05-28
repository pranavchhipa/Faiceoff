// ─────────────────────────────────────────────────────────────────────────────
// Public creators — server-side data for SEO surfaces
//
// Powers the /creators directory, /creators/category/[category] pages, and the
// dynamic sitemap. Reads only PUBLISHED profiles via the admin client (these
// are public pages, no auth). Cache with `revalidate` at the page level.
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from "@/lib/supabase/admin";
import type { DemoCategoryKey } from "@/lib/profile/demo-prompts";

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
  account_type: string | null;
  verified: boolean;
  is_live: boolean;
  /** Free-text creator city (Mumbai, Delhi, etc.). Surfaced on cards + profile hero. */
  city: string | null;
  /** ISO timestamp the creator row was created — drives "Newest" sort + "New" badge. */
  created_at: string;
}

/**
 * List published creator profiles, optionally filtered to one category.
 * Returns lightweight card data + a cover image (first ready demo sample).
 */
export async function listPublishedCreators(
  category?: DemoCategoryKey,
  limit = 200,
): Promise<PublicCreatorCard[]> {
  const admin = createAdminClient() as Admin;

  let query = admin
    .from("creators")
    .select(
      `
      id, user_id, profile_slug, selected_categories,
      instagram_followers, instagram_profile_pic_url,
      instagram_account_type, instagram_verified, is_live,
      city, created_at
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
      instagram_account_type: string | null;
      instagram_verified: boolean | null;
      is_live: boolean | null;
      city: string | null;
      created_at: string;
    }) => {
      const u = userById.get(c.user_id);
      return {
        slug: c.profile_slug,
        display_name: u?.display_name ?? "Creator",
        avatar_url: c.instagram_profile_pic_url ?? u?.avatar_url ?? null,
        cover_image_url: coverByCreator.get(c.id) ?? null,
        categories: c.selected_categories ?? [],
        followers: c.instagram_followers,
        account_type: c.instagram_account_type,
        verified: Boolean(c.instagram_verified),
        is_live: Boolean(c.is_live),
        city: c.city ?? null,
        created_at: c.created_at,
      };
    },
  );
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
