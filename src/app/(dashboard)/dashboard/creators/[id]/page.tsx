"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  AtSign,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

/* ── Types ── */

interface CreatorCategory {
  id: string;
  category: string;
  subcategories: string[] | null;
  price_per_generation_paise: number;
  is_active: boolean;
}

interface CreatorProfile {
  id: string;
  bio: string | null;
  instagram_handle: string | null;
  instagram_followers: number | null;
  kyc_status: string | null;
  display_name: string;
  avatar_url: string | null;
  categories: CreatorCategory[];
}

/* ── Constants ── */

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

function formatFollowers(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
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

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, delay, ease: [0.25, 0.46, 0.45, 0.94] as const },
  }),
};

/* ── Component ── */

export default function CreatorProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { supabase, isLoading: authLoading } = useAuth();

  const [creator, setCreator] = useState<CreatorProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCreator = useCallback(async () => {
    if (authLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/creators/${id}`);
      if (!res.ok) {
        setError("Creator not found or is no longer available.");
        setIsLoading(false);
        return;
      }
      const { creator: d } = await res.json();

    const profile: CreatorProfile = {
      id: d.id,
      bio: d.bio,
      instagram_handle: d.instagram_handle,
      instagram_followers: d.instagram_followers,
      kyc_status: d.kyc_status,
      display_name: d.display_name ?? "Creator",
      avatar_url: d.avatar_url ?? null,
      categories: d.categories ?? [],
    };

    setCreator(profile);
    } catch (err) {
      console.error("Failed to fetch creator:", err);
      setError("Creator not found or is no longer available.");
    } finally {
      setIsLoading(false);
    }
  }, [authLoading, id]);

  useEffect(() => {
    fetchCreator();
  }, [fetchCreator]);

  /* ── Loading State ── */
  if (isLoading) {
    return (
      <div className="max-w-5xl">
        <div className="mb-6">
          <div className="h-4 w-32 animate-pulse rounded bg-[var(--color-neutral-200)]" />
        </div>
        <div className="animate-pulse rounded-[var(--radius-card)] bg-white p-8 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-6">
            <div className="size-24 rounded-full bg-[var(--color-neutral-200)]" />
            <div className="flex-1 space-y-3">
              <div className="h-6 w-48 rounded bg-[var(--color-neutral-200)]" />
              <div className="h-4 w-32 rounded bg-[var(--color-neutral-100)]" />
              <div className="h-4 w-64 rounded bg-[var(--color-neutral-100)]" />
            </div>
          </div>
          <div className="mt-8 space-y-3">
            <div className="h-4 w-full rounded bg-[var(--color-neutral-100)]" />
            <div className="h-4 w-3/4 rounded bg-[var(--color-neutral-100)]" />
          </div>
        </div>
      </div>
    );
  }

  /* ── Error / Not Found ── */
  if (error || !creator) {
    return (
      <div className="max-w-5xl">
        <Link
          href="/dashboard/creators"
          className="mb-6 inline-flex items-center gap-2 text-sm font-500 text-[var(--color-neutral-500)] no-underline transition-colors hover:text-[var(--color-ink)]"
        >
          <ArrowLeft className="size-4" />
          Back to creators
        </Link>
        <div className="flex flex-col items-center justify-center rounded-[var(--radius-card)] bg-white py-16 shadow-[var(--shadow-card)]">
          <h3 className="text-lg font-600 text-[var(--color-ink)]">
            Creator not found
          </h3>
          <p className="mt-1 text-sm text-[var(--color-neutral-500)]">
            {error ?? "This creator may no longer be available."}
          </p>
          <Link
            href="/dashboard/creators"
            className="mt-6 inline-flex items-center gap-2 rounded-[var(--radius-button)] bg-[var(--color-gold)] px-5 py-2.5 text-sm font-600 text-white no-underline transition-colors hover:bg-[var(--color-gold-hover)] hover:text-white"
          >
            Browse Creators
          </Link>
        </div>
      </div>
    );
  }

  /* ── Main render ── */
  return (
    <div className="max-w-5xl">
      {/* Back button */}
      <motion.div
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Link
          href="/dashboard/creators"
          className="mb-6 inline-flex items-center gap-2 text-sm font-500 text-[var(--color-neutral-500)] no-underline transition-colors hover:text-[var(--color-ink)]"
        >
          <ArrowLeft className="size-4" />
          Back to creators
        </Link>
      </motion.div>

      {/* Profile Header Card */}
      <motion.div
        custom={0}
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        className="rounded-[var(--radius-card)] bg-white p-8 shadow-[var(--shadow-card)]"
      >
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          {/* Avatar */}
          <div
            className="flex size-24 shrink-0 items-center justify-center rounded-full"
            style={{
              backgroundColor: getAvatarColor(creator.display_name),
            }}
          >
            <span className="text-2xl font-700 text-[var(--color-ink)]">
              {getInitials(creator.display_name)}
            </span>
          </div>

          {/* Info */}
          <div className="flex-1">
            <h1 className="text-2xl font-700 tracking-tight text-[var(--color-ink)]">
              {creator.display_name}
            </h1>

            {/* Instagram */}
            {creator.instagram_handle && (
              <a
                href={`https://instagram.com/${creator.instagram_handle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-sm text-[var(--color-neutral-500)] no-underline transition-colors hover:text-[var(--color-gold)]"
              >
                <AtSign className="size-4" />
                @{creator.instagram_handle}
                {creator.instagram_followers != null && (
                  <span className="ml-1 text-[var(--color-neutral-400)]">
                    ({formatFollowers(creator.instagram_followers)} followers)
                  </span>
                )}
                <ExternalLink className="size-3" />
              </a>
            )}

            {/* Bio */}
            {creator.bio && (
              <p className="mt-4 text-sm leading-relaxed text-[var(--color-neutral-600)]">
                {creator.bio}
              </p>
            )}

            {/* Category badges in header */}
            {creator.categories.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {creator.categories.map((cat, idx) => {
                  const colorSet = MIST_COLORS[idx % MIST_COLORS.length];
                  return (
                    <span
                      key={cat.id}
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
          </div>
        </div>
      </motion.div>

      {/* Categories & Pricing Section */}
      {creator.categories.length > 0 && (
        <motion.div
          custom={0.15}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="mt-6 rounded-[var(--radius-card)] bg-white p-8 shadow-[var(--shadow-card)]"
        >
          <h2 className="text-lg font-700 text-[var(--color-ink)]">
            Categories & Pricing
          </h2>
          <p className="mt-1 text-sm text-[var(--color-neutral-500)]">
            Available content categories and per-generation pricing.
          </p>

          <Separator className="my-5 bg-[var(--color-neutral-200)]" />

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-neutral-200)]">
                  <th className="pb-3 pr-4 font-600 text-[var(--color-neutral-500)]">
                    Category
                  </th>
                  <th className="pb-3 pr-4 font-600 text-[var(--color-neutral-500)]">
                    Subcategories
                  </th>
                  <th className="pb-3 text-right font-600 text-[var(--color-neutral-500)]">
                    Price per Generation
                  </th>
                </tr>
              </thead>
              <tbody>
                {creator.categories.map((cat, idx) => {
                  const colorSet = MIST_COLORS[idx % MIST_COLORS.length];
                  return (
                    <tr
                      key={cat.id}
                      className="border-b border-[var(--color-neutral-100)] last:border-0"
                    >
                      <td className="py-4 pr-4">
                        <span
                          className="rounded-[var(--radius-pill)] px-3 py-1 text-xs font-500"
                          style={{
                            backgroundColor: colorSet.bg,
                            color: colorSet.text,
                          }}
                        >
                          {cat.category}
                        </span>
                      </td>
                      <td className="py-4 pr-4 text-[var(--color-neutral-600)]">
                        {cat.subcategories && cat.subcategories.length > 0
                          ? cat.subcategories.join(", ")
                          : "General"}
                      </td>
                      <td className="py-4 text-right font-600 text-[var(--color-ink)]">
                        {formatINR(cat.price_per_generation_paise)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* Start Campaign CTA */}
      <motion.div
        custom={0.3}
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        className="mt-6 flex flex-col items-center rounded-[var(--radius-card)] bg-white p-8 shadow-[var(--shadow-card)]"
      >
        <Sparkles className="size-8 text-[var(--color-gold)]" />
        <h3 className="mt-3 text-lg font-700 text-[var(--color-ink)]">
          Ready to create with {creator.display_name}?
        </h3>
        <p className="mt-1 text-center text-sm text-[var(--color-neutral-500)]">
          Launch a campaign and start generating AI content with this creator's
          licensed likeness.
        </p>
        <Button
          asChild
          className="mt-5 h-11 rounded-[var(--radius-button)] bg-[var(--color-gold)] px-8 text-sm font-600 text-white hover:bg-[var(--color-gold-hover)]"
        >
          <Link href={`/dashboard/campaigns/new?creator=${creator.id}`}>
            Start Campaign
          </Link>
        </Button>
      </motion.div>
    </div>
  );
}
