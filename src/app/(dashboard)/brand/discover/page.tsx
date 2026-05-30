/**
 * /brand/discover — Browse licensed creators (Linear × Bento)
 *
 * Server component: fetches all active creators + their niches + primary
 * reference photo (signed URL). Hands the data to <DiscoverGrid> (client
 * island) which handles search + category filter state.
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DiscoverGrid, type CreatorCard } from "./discover-grid";

async function loadCreators(): Promise<CreatorCard[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data, error } = await admin
    .from("creators")
    .select(
      `
      id,
      bio,
      instagram_followers,
      instagram_handle,
      cover_image_path,
      user_id,
      kyc_status,
      is_verified,
      is_live,
      city,
      created_at,
      users!inner ( display_name ),
      creator_categories ( category, is_active ),
      creator_packages ( tier, price_paise, is_active )
    `,
    )
    .eq("is_active", true)
    .limit(100);

  if (error || !data) {
    console.error("[brand/discover] creators query failed:", error);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = data as any[];
  const creatorIds = rows.map((c) => c.id as string);

  // Hero photos — prefer cover_image_path (if set), else primary reference photo
  const heroByCreator = new Map<string, string>();
  if (creatorIds.length > 0) {
    // Collect all paths that need signing: cover paths + fallback reference paths
    const coverPathByCreator = new Map<string, string>();
    for (const c of rows) {
      if (c.cover_image_path) coverPathByCreator.set(c.id as string, c.cover_image_path as string);
    }

    // Reference photos only for creators without a cover
    const needsRef = creatorIds.filter((id) => !coverPathByCreator.has(id));
    const refPathByCreator = new Map<string, string>();
    if (needsRef.length > 0) {
      const { data: photos } = await admin
        .from("creator_reference_photos")
        .select("creator_id, storage_path, is_primary")
        .in("creator_id", needsRef)
        .order("is_primary", { ascending: false });
      for (const p of (photos ?? []) as Array<{
        creator_id: string; storage_path: string; is_primary: boolean;
      }>) {
        if (!refPathByCreator.has(p.creator_id)) {
          refPathByCreator.set(p.creator_id, p.storage_path);
        }
      }
    }

    // Sign all paths in one batch
    const allPaths = [
      ...Array.from(coverPathByCreator.values()),
      ...Array.from(refPathByCreator.values()),
    ];
    if (allPaths.length > 0) {
      const { data: signed } = await admin.storage
        .from("reference-photos")
        .createSignedUrls(allPaths, 60 * 60);
      const urlByPath = new Map<string, string>();
      for (const s of signed ?? []) {
        if (s.signedUrl && s.path) urlByPath.set(s.path, s.signedUrl);
      }
      for (const [id, path] of coverPathByCreator) {
        const url = urlByPath.get(path);
        if (url) heroByCreator.set(id, url);
      }
      for (const [id, path] of refPathByCreator) {
        const url = urlByPath.get(path);
        if (url && !heroByCreator.has(id)) heroByCreator.set(id, url);
      }
    }
  }

  return rows.map((c) => {
    const cats = (c.creator_categories ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((cc: any) => cc.is_active) as Array<{ category: string }>;

    // Cheapest active package price (new pricing source)
    const pkgs = (c.creator_packages ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((p: any) => p.is_active) as Array<{ tier: string; price_paise: number }>;

    const cheapestPkg = pkgs.length > 0
      ? Math.min(...pkgs.map((p) => p.price_paise))
      : null;

    return {
      id: c.id,
      display_name: c.users?.display_name ?? "Creator",
      bio: c.bio,
      instagram_followers: c.instagram_followers ?? null,
      instagram_handle: c.instagram_handle ?? null,
      hero_photo_url: heroByCreator.get(c.id) ?? null,
      cheapest_paise: cheapestPkg,
      category_count: cats.length,
      primary_category: cats[0]?.category ?? null,
      categories: cats.map((cc) => cc.category),
      // Gold tick = manually verified by a Control Centre operator.
      is_verified: c.is_verified === true,
      city: c.city ?? null,
      created_at: c.created_at ?? null,
    };
  });
}

export default async function BrandDiscoverPage() {
  // ── Auth gate ──────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const creators = await loadCreators();

  // DiscoverGrid owns the entire UI: header + filter bar + chip strip + grid
  // + mobile sheet. Visual language now matches the rest of the dashboard
  // (canonical var(--color-*) tokens; no scoped CSS namespace).
  return <DiscoverGrid creators={creators} />;
}
