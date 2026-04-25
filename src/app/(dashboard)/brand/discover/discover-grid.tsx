"use client";

/**
 * DiscoverGrid — Client island for /brand/discover.
 *
 * Owns the search + category filter state and renders the filtered grid.
 * The parent (server component) fetches the full creator list once and
 * hands it to this island; filtering is in-memory (creator counts are
 * small enough that a server round-trip isn't worth the latency).
 *
 * Filter logic:
 *   • search   → matches display_name | bio | primary_category | followers
 *                (case-insensitive substring)
 *   • category → exact match against creator.categories[] (any one)
 *                "All" disables the category filter
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Filter, Search, Users, X } from "lucide-react";

export interface CreatorCard {
  id: string;
  display_name: string;
  bio: string | null;
  instagram_followers: number | null;
  instagram_handle: string | null;
  hero_photo_url: string | null;
  cheapest_paise: number | null;
  category_count: number;
  primary_category: string | null;
  /** All active categories — used by category filter pills. */
  categories: string[];
  is_verified: boolean;
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

interface Props {
  creators: CreatorCard[];
}

export function DiscoverGrid({ creators }: Props) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("All");

  // Build the category list from the actual creator data so we never show
  // a chip the brand can't filter on. "All" is always first.
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const c of creators) {
      for (const cat of c.categories) {
        set.add(cat);
      }
    }
    return ["All", ...Array.from(set).sort()];
  }, [creators]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return creators.filter((c) => {
      // Category filter
      if (activeCategory !== "All") {
        if (
          !c.categories.some(
            (cat) => cat.toLowerCase() === activeCategory.toLowerCase(),
          )
        ) {
          return false;
        }
      }
      // Search filter
      if (q.length > 0) {
        const haystack = [
          c.display_name,
          c.bio ?? "",
          c.primary_category ?? "",
          c.instagram_handle ?? "",
          c.categories.join(" "),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [creators, query, activeCategory]);

  return (
    <>
      {/* ═══════════ Filter bar ═══════════ */}
      <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 md:flex-row md:items-center md:gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-lg bg-[var(--color-secondary)]/60 px-3 py-2">
          <Search className="h-4 w-4 text-[var(--color-muted-foreground)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, niche, Instagram handle…"
            className="flex-1 border-none bg-transparent text-[13px] text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] focus:outline-none"
          />
          {query.length > 0 && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {categories.map((c) => {
            const active = c === activeCategory;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setActiveCategory(c)}
                className={`rounded-full px-3 py-1.5 font-mono text-[11px] font-700 uppercase tracking-wider transition-colors ${
                  active
                    ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                    : "border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-secondary)] hover:text-[var(--color-foreground)]"
                }`}
              >
                {c}
              </button>
            );
          })}
          {(query.length > 0 || activeCategory !== "All") && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setActiveCategory("All");
              }}
              className="flex items-center gap-1 rounded-full border border-[var(--color-border)] px-3 py-1.5 font-mono text-[11px] font-700 uppercase tracking-wider text-[var(--color-muted-foreground)] hover:bg-[var(--color-secondary)] hover:text-[var(--color-foreground)]"
            >
              <Filter className="h-3 w-3" />
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Result count */}
      {(query.length > 0 || activeCategory !== "All") && (
        <p className="mb-4 font-mono text-[11px] text-[var(--color-muted-foreground)]">
          {filtered.length}{" "}
          {filtered.length === 1 ? "creator" : "creators"} match{" "}
          {query.length > 0 && (
            <>
              search “
              <span className="font-600 text-[var(--color-foreground)]">{query}</span>
              ”
            </>
          )}
          {query.length > 0 && activeCategory !== "All" && " · "}
          {activeCategory !== "All" && (
            <>
              category{" "}
              <span className="font-600 text-[var(--color-foreground)]">
                {activeCategory}
              </span>
            </>
          )}
        </p>
      )}

      {/* ═══════════ Grid ═══════════ */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] p-12 text-center">
          <Users className="mx-auto mb-3 h-10 w-10 text-[var(--color-muted-foreground)]" />
          <p className="font-display text-[16px] font-700 text-[var(--color-foreground)]">
            {creators.length === 0
              ? "No active creators yet"
              : "No creators match your filters"}
          </p>
          <p className="mt-1 text-[12px] text-[var(--color-muted-foreground)]">
            {creators.length === 0
              ? "Onboarding new faces every week. Check back soon."
              : "Try a different search or category, or reset filters."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((c) => (
            <Link
              key={c.id}
              href={`/brand/discover/${c.id}`}
              className="group overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] transition-all hover:-translate-y-0.5 hover:border-[var(--color-primary)]/40 hover:shadow-[0_12px_32px_-18px_rgba(201,169,110,0.4)]"
            >
              {/* Hero */}
              <div className="relative aspect-[4/5] bg-gradient-to-br from-[var(--color-secondary)] to-[var(--color-muted)]">
                {c.hero_photo_url ? (
                  <Image
                    src={c.hero_photo_url}
                    alt={c.display_name}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full items-center justify-center font-display text-[80px] font-800 text-[var(--color-muted-foreground)]/30">
                    {c.display_name[0]?.toUpperCase() ?? "?"}
                  </div>
                )}

                {/* Top chips */}
                <div className="absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
                  {c.primary_category && (
                    <span className="rounded-full bg-black/50 px-2 py-0.5 font-mono text-[9px] font-700 uppercase tracking-wider text-white backdrop-blur-md">
                      {c.primary_category}
                    </span>
                  )}
                  {c.is_verified && (
                    <span className="rounded-full bg-emerald-500/90 px-2 py-0.5 font-mono text-[9px] font-700 uppercase tracking-wider text-white backdrop-blur-md">
                      ✓ KYC
                    </span>
                  )}
                </div>

                {/* Follower count */}
                {c.instagram_followers !== null && (
                  <span className="absolute right-3 top-3 rounded-full bg-black/50 px-2 py-0.5 font-mono text-[9px] font-700 uppercase tracking-wider text-white backdrop-blur-md">
                    @ {formatFollowersShort(c.instagram_followers)}
                  </span>
                )}

                {/* Bottom name overlay */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-4">
                  <p className="font-display text-[18px] font-800 leading-tight tracking-tight text-white">
                    {c.display_name}
                  </p>
                  {c.bio && (
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-white/80">
                      {c.bio}
                    </p>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3">
                <span className="font-mono text-[10px] font-700 uppercase tracking-wider text-[var(--color-muted-foreground)]">
                  {c.category_count} niche{c.category_count === 1 ? "" : "s"}
                </span>
                {c.cheapest_paise !== null && (
                  <span className="font-display text-[14px] font-800 tracking-tight text-[var(--color-foreground)]">
                    from{" "}
                    <span className="text-[var(--color-primary)]">
                      {formatINR(c.cheapest_paise)}
                    </span>
                    <span className="ml-0.5 font-mono text-[10px] font-500 text-[var(--color-muted-foreground)]">
                      /gen
                    </span>
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
