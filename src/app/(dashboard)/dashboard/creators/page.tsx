"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Search, Users, ArrowRight, AtSign } from "lucide-react";
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
  categories: {
    category: string;
    price_per_generation_paise: number;
  }[];
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

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getAvatarColor(name: string): string {
  const colors = [
    "var(--color-blush-deep)",
    "var(--color-ocean-deep)",
    "var(--color-lilac-deep)",
    "var(--color-mint-deep)",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
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

  /* ── Fetch creators ── */
  const fetchCreators = useCallback(async () => {
    if (authLoading) return;

    setIsLoading(true);

    const { data: creatorsData, error: creatorsError } = await supabase
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

    if (creatorsError) {
      console.error("Failed to fetch creators:", creatorsError);
      setIsLoading(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapped: CreatorWithDetails[] = (creatorsData ?? []).map((c: any) => ({
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

    setCreators(mapped);
    setIsLoading(false);
  }, [supabase, authLoading]);

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
    <div className="mx-auto max-w-6xl">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-800 tracking-tight text-[var(--color-ink)] lg:text-4xl">
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
          <h3 className="mt-4 font-[family-name:var(--font-display)] text-lg font-600 text-[var(--color-ink)]">
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

            return (
              <motion.div
                key={creator.id}
                variants={cardVariants}
                className="group flex flex-col rounded-[var(--radius-card)] bg-white p-6 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-elevated)]"
              >
                {/* Header: Avatar + Name */}
                <div className="flex items-center gap-4">
                  <div
                    className="flex size-14 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: getAvatarColor(creator.display_name) }}
                  >
                    <span className="font-[family-name:var(--font-display)] text-base font-700 text-[var(--color-ink)]">
                      {getInitials(creator.display_name)}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-[family-name:var(--font-display)] text-base font-700 text-[var(--color-ink)]">
                      {creator.display_name}
                    </h3>
                    {creator.instagram_handle && (
                      <p className="flex items-center gap-1 text-sm text-[var(--color-neutral-500)]">
                        <AtSign className="size-3.5" />
                        @{creator.instagram_handle}
                      </p>
                    )}
                  </div>
                </div>

                {/* Bio */}
                {creator.bio && (
                  <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-[var(--color-neutral-600)]">
                    {creator.bio}
                  </p>
                )}

                {/* Category Badges */}
                {creator.categories.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {creator.categories.map((cat, idx) => {
                      const colorSet = MIST_COLORS[idx % MIST_COLORS.length];
                      return (
                        <span
                          key={cat.category}
                          className="rounded-[var(--radius-pill)] px-3 py-1 text-xs font-500"
                          style={{
                            backgroundColor: colorSet.bg,
                            color: colorSet.text,
                          }}
                        >
                          {cat.category}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Price + CTA */}
                <div className="mt-auto flex items-center justify-between pt-5">
                  {minPrice !== null ? (
                    <p className="text-sm font-600 text-[var(--color-ink)]">
                      From{" "}
                      <span className="text-[var(--color-gold)]">
                        {formatINR(minPrice)}
                      </span>
                      /generation
                    </p>
                  ) : (
                    <p className="text-sm text-[var(--color-neutral-400)]">
                      Pricing unavailable
                    </p>
                  )}

                  <Link
                    href={`/dashboard/creators/${creator.id}`}
                    className="inline-flex items-center gap-1.5 rounded-[var(--radius-button)] bg-[var(--color-gold)] px-4 py-2 text-sm font-600 text-white no-underline transition-colors hover:bg-[var(--color-gold-hover)] hover:text-white"
                  >
                    View Profile
                    <ArrowRight className="size-3.5" />
                  </Link>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
