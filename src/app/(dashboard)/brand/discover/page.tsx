/**
 * /brand/discover — Browse licensed creators (Linear × Bento)
 *
 * Server component: fetches all active creators + their niches + primary
 * reference photo (signed URL). Hands the data to <DiscoverGrid> (client
 * island) which handles search + category filter state.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Sparkles } from "lucide-react";
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
      user_id,
      kyc_status,
      users!inner ( display_name ),
      creator_categories ( category, price_per_generation_paise, is_active )
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

  // Hero photos via signed URLs
  const heroByCreator = new Map<string, string>();
  if (creatorIds.length > 0) {
    const { data: photos } = await admin
      .from("creator_reference_photos")
      .select("creator_id, storage_path, is_primary")
      .in("creator_id", creatorIds)
      .order("is_primary", { ascending: false });

    const primaryPath = new Map<string, string>();
    for (const p of (photos ?? []) as Array<{
      creator_id: string;
      storage_path: string;
      is_primary: boolean;
    }>) {
      if (!primaryPath.has(p.creator_id)) {
        primaryPath.set(p.creator_id, p.storage_path);
      }
    }

    if (primaryPath.size > 0) {
      const paths = Array.from(primaryPath.values());
      const { data: signed } = await admin.storage
        .from("reference-photos")
        .createSignedUrls(paths, 60 * 60);

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

  return rows.map((c) => {
    const cats = (c.creator_categories ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((cc: any) => cc.is_active) as Array<{
      category: string;
      price_per_generation_paise: number;
    }>;

    const cheapest =
      cats.length > 0
        ? Math.min(...cats.map((cc) => cc.price_per_generation_paise))
        : null;

    return {
      id: c.id,
      display_name: c.users?.display_name ?? "Creator",
      bio: c.bio,
      instagram_followers: c.instagram_followers ?? null,
      instagram_handle: c.instagram_handle ?? null,
      hero_photo_url: heroByCreator.get(c.id) ?? null,
      cheapest_paise: cheapest,
      category_count: cats.length,
      primary_category: cats[0]?.category ?? null,
      categories: cats.map((cc) => cc.category),
      is_verified: c.kyc_status === "approved",
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

  return (
    <div className="w-full max-w-[1320px]">
      {/* ═══════════ Header ═══════════ */}
      <div className="mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
            <Sparkles className="mr-1 inline h-3 w-3 text-[var(--color-primary)]" />
            {creators.length} licensed{" "}
            {creators.length === 1 ? "face" : "faces"} · KYC verified ·
            consented
          </p>
          <h1 className="mt-1 font-display text-[30px] font-800 leading-none tracking-tight text-[var(--color-foreground)] md:text-[36px]">
            Discover creators
          </h1>
          <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
            Browse trained likenesses. Start a session in seconds — every rupee
            goes to the creator.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/brand/sessions"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-[13px] font-600 text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-secondary)]"
          >
            My sessions
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* Search + filter + grid live in the client island so they can
          re-filter without a server round-trip. */}
      <DiscoverGrid creators={creators} />
    </div>
  );
}
