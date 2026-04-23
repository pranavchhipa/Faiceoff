/**
 * /brand/discover — Browse all active creators
 *
 * Server-component grid listing every active creator with their hero photo,
 * starting price, and follower count. Tapping a card routes to the creator
 * detail page where the brand can launch a generation.
 */

import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { Search, Users, ChevronRight, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface CreatorCard {
  id: string;
  display_name: string;
  bio: string | null;
  instagram_followers: number | null;
  hero_photo_url: string | null;
  cheapest_paise: number | null;
  category_count: number;
  primary_category: string | null;
}

function formatINR(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function formatFollowersShort(n: number | null): string | null {
  if (n === null) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

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
      user_id,
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

    const cheapest = cats.length > 0
      ? Math.min(...cats.map((cc) => cc.price_per_generation_paise))
      : null;

    return {
      id: c.id,
      display_name: c.users?.display_name ?? "Creator",
      bio: c.bio,
      instagram_followers: c.instagram_followers ?? null,
      hero_photo_url: heroByCreator.get(c.id) ?? null,
      cheapest_paise: cheapest,
      category_count: cats.length,
      primary_category: cats[0]?.category ?? null,
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
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-800 tracking-tight text-[var(--color-ink)]">
            Discover creators
          </h1>
          <p className="mt-1 text-sm text-[var(--color-neutral-500)]">
            Browse licensed creators and start a generation in seconds.
          </p>
        </div>
        <Link
          href="/brand/sessions"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--color-outline-variant)]/20 bg-white px-3.5 py-2 text-xs font-600 text-[var(--color-ink)] hover:border-[var(--color-outline-variant)]/40 transition-colors"
        >
          View my sessions
          <ChevronRight className="size-3.5" />
        </Link>
      </div>

      {/* Empty state */}
      {creators.length === 0 && (
        <div className="rounded-[var(--radius-card)] border border-[var(--color-outline-variant)]/20 bg-white p-12 text-center">
          <Users className="mx-auto mb-3 size-10 text-[var(--color-neutral-400)]" />
          <p className="text-sm font-600 text-[var(--color-ink)]">
            No active creators yet
          </p>
          <p className="mt-1 text-xs text-[var(--color-neutral-500)]">
            Check back soon — onboarding new creators every week.
          </p>
        </div>
      )}

      {/* Grid */}
      {creators.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {creators.map((c) => (
            <Link
              key={c.id}
              href={`/brand/discover/${c.id}`}
              className="group rounded-[var(--radius-card)] border border-[var(--color-outline-variant)]/15 bg-white overflow-hidden hover:border-[var(--color-outline-variant)]/35 hover:shadow-[var(--shadow-card)] transition-all"
            >
              {/* Hero */}
              <div className="relative aspect-[4/5] bg-[var(--color-blush)]">
                {c.hero_photo_url ? (
                  <Image
                    src={c.hero_photo_url}
                    alt={c.display_name}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Sparkles className="size-10 text-[var(--color-ink)] opacity-40" />
                  </div>
                )}
                {c.primary_category && (
                  <span className="absolute left-3 top-3 rounded-full bg-white/90 backdrop-blur-sm px-2.5 py-1 text-[10px] font-700 uppercase tracking-wider text-[var(--color-ink)]">
                    {c.primary_category}
                  </span>
                )}
              </div>

              {/* Body */}
              <div className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-base font-700 text-[var(--color-ink)] truncate">
                    {c.display_name}
                  </p>
                  {c.instagram_followers !== null && (
                    <span className="shrink-0 text-xs font-600 text-[var(--color-neutral-500)]">
                      {formatFollowersShort(c.instagram_followers)}
                    </span>
                  )}
                </div>
                {c.bio && (
                  <p className="text-xs text-[var(--color-neutral-500)] line-clamp-2 min-h-[2rem]">
                    {c.bio}
                  </p>
                )}
                <div className="flex items-center justify-between pt-1.5 border-t border-[var(--color-outline-variant)]/10">
                  <span className="text-[10px] font-600 uppercase tracking-wider text-[var(--color-neutral-500)]">
                    {c.category_count} categor{c.category_count === 1 ? "y" : "ies"}
                  </span>
                  {c.cheapest_paise !== null && (
                    <span className="text-sm font-700 text-[var(--color-ink)]">
                      {formatINR(c.cheapest_paise)}
                      <span className="text-[10px] font-500 text-[var(--color-neutral-500)] ml-0.5">
                        /img
                      </span>
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Hidden import to silence Search lint if grid grows search later */}
      <Search className="hidden" />
    </div>
  );
}
