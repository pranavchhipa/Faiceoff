"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Search, Users } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Input } from "@/components/ui/input";

/* ── Types ── */

interface CreatorWithDetails {
  id: string;
  bio: string | null;
  instagram_handle: string | null;
  instagram_followers: number | null;
  display_name: string;
  avatar_url: string | null;
  hero_photo_url: string | null;
  approval_count: number;
  campaigns_last_30d: number;
  rating: number | null;
  categories: { category: string; price_per_generation_paise: number }[];
}

/* ── Constants ── */

const CATEGORIES = [
  "All",
  "Fashion",
  "Beauty",
  "Fitness",
  "Food",
  "Travel",
  "Tech",
  "Entertainment",
  "Education",
  "Lifestyle",
  "Business",
] as const;

const MIST_COLORS = [
  { bg: "var(--color-blush)", text: "var(--color-ink)" },
  { bg: "var(--color-ocean)", text: "var(--color-ink)" },
  { bg: "var(--color-lilac)", text: "var(--color-ink)" },
  { bg: "var(--color-mint)", text: "var(--color-ink)" },
] as const;

/* ── Helpers ── */

function formatINR(paise: number): string {
  const inr = paise / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(inr);
}

function formatFollowersShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

/* ── Animation variants ── */

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.06 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as const },
  },
};

/* ── Component ── */

export default function CreatorCatalogPage() {
  const { supabase, isLoading: authLoading } = useAuth();

  const [creators, setCreators] = useState<CreatorWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("All");

  /* ── Debounce search ── */
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  /* ── Fetch creators via API route (bypasses RLS on users table) ── */
  const fetchCreators = useCallback(async () => {
    if (authLoading) return;

    setIsLoading(true);

    try {
      const res = await fetch("/api/creators");
      if (!res.ok) {
        console.error("Failed to fetch creators:", res.status);
        setIsLoading(false);
        return;
      }
      const data = await res.json();
      setCreators(data.creators ?? []);
    } catch (err) {
      console.error("Failed to fetch creators:", err);
    } finally {
      setIsLoading(false);
    }
  }, [authLoading]);

  useEffect(() => {
    fetchCreators();
  }, [fetchCreators]);

  /* ── Filter creators ── */
  const filteredCreators = useMemo(() => {
    let result = creators;

    if (activeCategory !== "All") {
      result = result.filter((c) =>
        c.categories.some(
          (cat) => cat.category.toLowerCase() === activeCategory.toLowerCase()
        )
      );
    }

    if (debouncedQuery.trim()) {
      const q = debouncedQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.display_name.toLowerCase().includes(q) ||
          c.categories.some((cat) => cat.category.toLowerCase().includes(q))
      );
    }

    return result;
  }, [creators, activeCategory, debouncedQuery]);

  /* ── Get min price for a creator ── */
  function getMinPrice(creator: CreatorWithDetails): number | null {
    if (creator.categories.length === 0) return null;
    return Math.min(
      ...creator.categories.map((c) => c.price_per_generation_paise)
    );
  }

  /* ── Render ── */
  return (
    <div className="max-w-6xl">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-800 tracking-tight text-[var(--color-ink)] lg:text-4xl">
          Discover Creators
        </h1>
        <p className="mt-2 text-base text-[var(--color-neutral-500)]">
          Browse AI-ready creators and start generating authentic content for
          your brand.
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-neutral-400)]" />
        <Input
          type="text"
          placeholder="Search by name or category..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-11 rounded-[var(--radius-button)] border-[var(--color-neutral-200)] bg-white pl-10 text-sm shadow-[var(--shadow-soft)] placeholder:text-[var(--color-neutral-400)] focus-visible:border-[var(--color-gold)] focus-visible:ring-[var(--color-gold)]/20"
        />
      </div>

      {/* Category Filter Pills */}
      <div className="mb-8 flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        {CATEGORIES.map((cat) => (
          <motion.button
            key={cat}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setActiveCategory(cat)}
            className={`shrink-0 rounded-[var(--radius-pill)] px-4 py-2 text-sm font-500 transition-colors ${
              activeCategory === cat
                ? "bg-[var(--color-gold)] text-white shadow-[var(--shadow-soft)]"
                : "bg-white text-[var(--color-neutral-600)] shadow-[var(--shadow-soft)] hover:bg-[var(--color-neutral-100)]"
            }`}
          >
            {cat}
          </motion.button>
        ))}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="animate-pulse rounded-[var(--radius-card)] bg-white p-6 shadow-[var(--shadow-card)]"
            >
              <div className="flex items-center gap-4">
                <div className="size-14 rounded-full bg-[var(--color-neutral-200)]" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 rounded bg-[var(--color-neutral-200)]" />
                  <div className="h-3 w-20 rounded bg-[var(--color-neutral-100)]" />
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <div className="h-3 w-full rounded bg-[var(--color-neutral-100)]" />
                <div className="h-3 w-3/4 rounded bg-[var(--color-neutral-100)]" />
              </div>
              <div className="mt-4 flex gap-2">
                <div className="h-6 w-16 rounded-full bg-[var(--color-neutral-100)]" />
                <div className="h-6 w-16 rounded-full bg-[var(--color-neutral-100)]" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredCreators.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-[var(--radius-card)] bg-white py-16 shadow-[var(--shadow-card)]">
          <div className="flex size-16 items-center justify-center rounded-full bg-[var(--color-neutral-100)]">
            <Users className="size-7 text-[var(--color-neutral-400)]" />
          </div>
          <h3 className="mt-4 text-lg font-600 text-[var(--color-ink)]">
            No creators found
          </h3>
          <p className="mt-1 text-sm text-[var(--color-neutral-500)]">
            {debouncedQuery || activeCategory !== "All"
              ? "Try adjusting your search or filters."
              : "Creators will appear here once they are onboarded."}
          </p>
        </div>
      )}

      {/* Creator Grid */}
      {!isLoading && filteredCreators.length > 0 && (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
        >
          {filteredCreators.map((creator) => {
            const minPrice = getMinPrice(creator);
            const isTop10 = creator.approval_count >= 50;
            const isTrending = creator.campaigns_last_30d >= 5;
            const photo =
              creator.hero_photo_url ??
              creator.avatar_url ??
              `https://ui-avatars.com/api/?name=${encodeURIComponent(
                creator.display_name
              )}&background=c9a96e&color=fff&size=600`;

            const hasPhoto = Boolean(creator.hero_photo_url ?? creator.avatar_url);
            const initials = creator.display_name
              .split(" ")
              .map((w) => w[0])
              .slice(0, 2)
              .join("")
              .toUpperCase();

            return (
              <motion.div
                key={creator.id}
                variants={cardVariants}
                className="group relative overflow-hidden rounded-[var(--radius-card)] shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-elevated)]"
              >
                <Link
                  href={`/dashboard/creators/${creator.id}`}
                  className="block no-underline"
                >
                  <div className="relative aspect-[3/4] min-h-[360px] max-h-[440px] w-full">
                    {(isTop10 || isTrending) && (
                      <span className="absolute left-3 top-3 z-10 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-700 uppercase tracking-wider text-[var(--color-ink)] shadow-sm">
                        {isTop10 ? "⭐ Top 10" : "🔥 Trending"}
                      </span>
                    )}
                    {hasPhoto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photo}
                        alt={creator.display_name}
                        className="h-full w-full object-cover object-top"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[var(--color-blush)] to-[var(--color-ocean)]">
                        <span className="font-['Outfit'] text-5xl font-800 text-[var(--color-ink)]/70">
                          {initials}
                        </span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                      <h3 className="text-[17px] font-700 leading-tight">
                        {creator.display_name}
                      </h3>
                      <p className="mt-0.5 text-[11px] opacity-90">
                        {creator.instagram_handle && `@${creator.instagram_handle} • `}
                        {creator.instagram_followers
                          ? `${formatFollowersShort(creator.instagram_followers)} • `
                          : ""}
                        {creator.rating ? `${creator.rating.toFixed(1)}★` : "New"}
                      </p>
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {creator.categories.slice(0, 2).map((cat, idx) => {
                          const c = MIST_COLORS[idx % MIST_COLORS.length];
                          return (
                            <span
                              key={cat.category}
                              className="rounded-full px-2.5 py-0.5 text-[10px] font-500"
                              style={{ backgroundColor: c.bg, color: c.text }}
                            >
                              {cat.category}
                            </span>
                          );
                        })}
                      </div>
                      {minPrice !== null && (
                        <p className="mt-2.5 text-[13px] font-600">
                          From {formatINR(minPrice)}/image
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
