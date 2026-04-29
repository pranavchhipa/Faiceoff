import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/creators
 *
 * Returns all active creators with their display name, categories, and pricing.
 * Uses admin client to bypass RLS (users table restricts cross-user reads).
 * Caller must be authenticated.
 */
export async function GET() {
  // Verify the caller is authenticated
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("creators")
    .select(
      `
      id,
      bio,
      instagram_handle,
      instagram_followers,
      user_id,
      users!inner (
        display_name,
        avatar_url
      ),
      creator_categories (
        category,
        price_per_generation_paise,
        is_active
      )
    `
    )
    .eq("is_active", true);

  if (error) {
    console.error("[api/creators] Query error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Shape the base response
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const creators = (data ?? []).map((c: any) => ({
    id: c.id,
    bio: c.bio,
    instagram_handle: c.instagram_handle,
    instagram_followers: c.instagram_followers,
    display_name: c.users?.display_name ?? "Creator",
    avatar_url: c.users?.avatar_url ?? null,
    categories: (c.creator_categories ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((cc: any) => cc.is_active)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((cc: any) => ({
        category: cc.category,
        price_per_generation_paise: cc.price_per_generation_paise,
      })),
  }));

  const creatorIds: string[] = creators.map((c) => c.id);

  // 1. Hero photo: first primary (or earliest) reference photo per creator
  const heroByCreator = new Map<string, string>();
  if (creatorIds.length > 0) {
    const { data: photos } = await admin
      .from("creator_reference_photos")
      .select("creator_id, storage_path, is_primary")
      .in("creator_id", creatorIds)
      .order("is_primary", { ascending: false });

    // Pick one primary path per creator first, then sign them in a single batch.
    const primaryPath = new Map<string, string>();
    for (const p of (photos ?? []) as Array<{ creator_id: string; storage_path: string; is_primary: boolean }>) {
      if (!primaryPath.has(p.creator_id)) {
        primaryPath.set(p.creator_id, p.storage_path);
      }
    }

    if (primaryPath.size > 0) {
      const paths = Array.from(primaryPath.values());
      const { data: signed } = await admin.storage
        .from("reference-photos")
        .createSignedUrls(paths, 60 * 60); // 1 hour

      const urlByPath = new Map<string, string>();
      for (const s of signed ?? []) {
        if (s.signedUrl && s.path) urlByPath.set(s.path, s.signedUrl);
      }

      for (const [creatorId, path] of primaryPath) {
        const url = urlByPath.get(path);
        if (url) heroByCreator.set(creatorId, url);
      }
    }
  }

  // 2. Campaign counts (last 30 days)
  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();
  const campaignsLast30d = new Map<string, number>();
  if (creatorIds.length > 0) {
    const { data: campaignRows } = await admin
      .from("collab_sessions")
      .select("creator_id, created_at")
      .in("creator_id", creatorIds)
      .gte("created_at", thirtyDaysAgo);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const c of (campaignRows ?? []) as any[]) {
      campaignsLast30d.set(
        c.creator_id,
        (campaignsLast30d.get(c.creator_id) ?? 0) + 1
      );
    }
  }

  // 3. Approval counts: approved generations keyed by creator_id
  const approvalsByCreator = new Map<string, number>();
  if (creatorIds.length > 0) {
    const { data: approvedGens } = await admin
      .from("generations")
      .select("creator_id")
      .in("creator_id", creatorIds)
      .eq("status", "approved");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const g of (approvedGens ?? []) as any[]) {
      approvalsByCreator.set(
        g.creator_id,
        (approvalsByCreator.get(g.creator_id) ?? 0) + 1
      );
    }
  }

  // Merge enrichment fields onto each creator
  const enrichedCreators = creators.map((c) => ({
    ...c,
    hero_photo_url: heroByCreator.get(c.id) ?? c.avatar_url,
    approval_count: approvalsByCreator.get(c.id) ?? 0,
    campaigns_last_30d: campaignsLast30d.get(c.id) ?? 0,
    rating: null as number | null,
    avg_approval_hours: null as number | null,
  }));

  return NextResponse.json({ creators: enrichedCreators });
}
