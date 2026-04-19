"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, AtSign } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { StartCampaignSheet } from "./start-campaign-sheet";

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
  hero_photo_url: string | null;
  categories: CreatorCategory[];
}

interface ProfileStats {
  followers: number | null;
  approval_count: number;
  avg_approval_hours: number | null;
  approval_rate: number | null;
  rating: number | null;
}

interface ProfilePayload {
  creator: CreatorProfile;
  gallery: string[];
  stats: ProfileStats;
}

const MIST_COLORS = [
  { bg: "var(--color-blush)", text: "var(--color-ink)" },
  { bg: "var(--color-ocean)", text: "var(--color-ink)" },
  { bg: "var(--color-lilac)", text: "var(--color-ink)" },
  { bg: "var(--color-mint)", text: "var(--color-ink)" },
] as const;

function formatINR(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function formatFollowersShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, delay, ease: [0.25, 0.46, 0.45, 0.94] as const },
  }),
};

export default function CreatorProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { isLoading: authLoading } = useAuth();

  const [data, setData] = useState<ProfilePayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

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
      const body = (await res.json()) as ProfilePayload;
      setData(body);
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

  if (isLoading) {
    return (
      <div className="max-w-5xl">
        <div className="mb-6 h-4 w-32 animate-pulse rounded bg-[var(--color-neutral-200)]" />
        <div className="animate-pulse rounded-[var(--radius-card)] bg-white p-8 shadow-[var(--shadow-card)]">
          <div className="h-[280px] rounded-xl bg-[var(--color-neutral-200)]" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-5xl">
        <Link
          href="/dashboard/creators"
          className="mb-6 inline-flex items-center gap-2 text-sm font-500 text-[var(--color-neutral-500)] no-underline hover:text-[var(--color-ink)]"
        >
          <ArrowLeft className="size-4" />
          Back to creators
        </Link>
        <div className="flex flex-col items-center justify-center rounded-[var(--radius-card)] bg-white py-16 shadow-[var(--shadow-card)]">
          <h3 className="text-lg font-600 text-[var(--color-ink)]">Creator not found</h3>
          <p className="mt-1 text-sm text-[var(--color-neutral-500)]">
            {error ?? "This creator may no longer be available."}
          </p>
          <Link
            href="/dashboard/creators"
            className="mt-6 inline-flex items-center gap-2 rounded-[var(--radius-button)] bg-[var(--color-gold)] px-5 py-2.5 text-sm font-600 text-white no-underline hover:bg-[var(--color-gold-hover)]"
          >
            Browse Creators
          </Link>
        </div>
      </div>
    );
  }

  const { creator, gallery, stats } = data;
  const heroPhoto =
    creator.hero_photo_url ??
    creator.avatar_url ??
    `https://ui-avatars.com/api/?name=${encodeURIComponent(creator.display_name)}&background=c9a96e&color=fff&size=1200`;
  const minPrice = creator.categories.length
    ? Math.min(...creator.categories.map((c) => c.price_per_generation_paise))
    : null;

  return (
    <div className="max-w-5xl">
      <motion.div
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Link
          href="/dashboard/creators"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--color-neutral-500)] no-underline hover:text-[var(--color-ink)]"
        >
          <ArrowLeft className="size-4" /> Back to creators
        </Link>
      </motion.div>

      <motion.div
        custom={0}
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        className="overflow-hidden rounded-[var(--radius-card)] bg-white shadow-[var(--shadow-card)]"
      >
        {/* HERO */}
        <div className="relative h-[240px] sm:h-[280px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={heroPhoto}
            alt={creator.display_name}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: "center 30%" }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-4 p-7 text-white sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-800 tracking-tight">{creator.display_name}</h1>
              {creator.instagram_handle && (
                <p className="mt-1 flex items-center gap-1 text-sm opacity-90">
                  <AtSign className="size-3.5" />
                  {creator.instagram_handle}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {stats.approval_count >= 50 && (
                  <span className="rounded-full border border-white/30 bg-white/20 px-2.5 py-1 text-[11px] font-600 backdrop-blur">
                    ⭐ Top Creator
                  </span>
                )}
                {creator.kyc_status === "verified" && (
                  <span className="rounded-full border border-white/30 bg-white/20 px-2.5 py-1 text-[11px] font-600 backdrop-blur">
                    ✓ KYC Verified
                  </span>
                )}
                <span className="rounded-full border border-white/30 bg-white/20 px-2.5 py-1 text-[11px] font-600 backdrop-blur">
                  🔒 DPDP Consent
                </span>
              </div>
            </div>
            <Button
              onClick={() => setIsSheetOpen(true)}
              className="rounded-[var(--radius-button)] bg-[var(--color-gold)] px-5 py-3 font-700 text-white shadow-lg hover:bg-[var(--color-gold-hover)]"
            >
              Start Campaign →
            </Button>
          </div>
        </div>

        {/* STATS STRIP */}
        <div className="grid grid-cols-2 gap-4 sm:gap-6 border-b border-[var(--color-neutral-100)] px-5 sm:px-7 py-5 sm:py-6 md:grid-cols-4">
          <Stat big={stats.followers ? formatFollowersShort(stats.followers) : "—"} small="followers" />
          <Stat
            big={stats.rating ? `${stats.rating.toFixed(1)}★` : "—"}
            small={`from ${stats.approval_count} generations`}
          />
          <Stat
            big={stats.avg_approval_hours ? `${stats.avg_approval_hours}h` : "—"}
            small="avg approval time"
          />
          <Stat
            big={stats.approval_rate ? `${stats.approval_rate}%` : "—"}
            small="approval rate"
          />
        </div>

        <div className="space-y-8 p-5 sm:p-7">
          {creator.bio && (
            <section>
              <h3 className="mb-2 text-sm font-700 uppercase tracking-wider text-[var(--color-ink)]">About</h3>
              <p className="text-sm leading-relaxed text-[var(--color-neutral-600)]">{creator.bio}</p>
            </section>
          )}

          {creator.categories.length > 0 && (
            <section>
              <h3 className="mb-3 text-sm font-700 uppercase tracking-wider text-[var(--color-ink)]">Categories</h3>
              <div className="flex flex-wrap gap-2">
                {creator.categories.map((cat, i) => {
                  const c = MIST_COLORS[i % MIST_COLORS.length];
                  return (
                    <span
                      key={cat.id}
                      className="rounded-full px-3 py-1 text-xs font-600"
                      style={{ backgroundColor: c.bg, color: c.text }}
                    >
                      {cat.category}
                    </span>
                  );
                })}
              </div>
            </section>
          )}

          {creator.categories.length > 0 && (
            <section>
              <h3 className="mb-3 text-sm font-700 uppercase tracking-wider text-[var(--color-ink)]">Pricing</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                {creator.categories.map((cat) => (
                  <div
                    key={cat.id}
                    className="rounded-xl border border-[var(--color-neutral-100)] bg-[var(--color-paper)] p-4"
                  >
                    <p className="text-xs text-[var(--color-neutral-500)]">{cat.category}</p>
                    <p className="mt-1 text-lg font-700 text-[var(--color-ink)]">
                      {formatINR(cat.price_per_generation_paise)}
                      <span className="ml-1 text-xs font-400 text-[var(--color-neutral-400)]">
                        /image
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {(() => {
            const validGallery = gallery.filter(
              (u) => typeof u === "string" && /^https?:\/\//.test(u),
            );
            if (validGallery.length === 0) return null;
            return (
              <section>
                <h3 className="mb-3 text-sm font-700 uppercase tracking-wider text-[var(--color-ink)]">
                  Recent AI-Generated Work
                </h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {validGallery.map((url, idx) => (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      key={idx}
                      src={url}
                      alt=""
                      loading="lazy"
                      className="h-[140px] w-full rounded-[10px] object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ))}
                </div>
              </section>
            );
          })()}

          <section className="flex items-start gap-3 rounded-xl bg-[var(--color-mint)] p-4 text-sm text-[var(--color-ink)]">
            <span className="text-xl">🛡️</span>
            <p>
              <strong>Consent-first licensing</strong> — {creator.display_name.split(" ")[0]} reviews
              every generation within 48h before it reaches you. Rejected generations get a full
              refund.
            </p>
          </section>
        </div>
      </motion.div>

      {isSheetOpen && (
        <StartCampaignSheet
          creator={creator}
          minPrice={minPrice}
          onClose={() => setIsSheetOpen(false)}
        />
      )}
    </div>
  );
}

function Stat({ big, small }: { big: string; small: string }) {
  return (
    <div>
      <p className="text-2xl font-800 text-[var(--color-ink)]">{big}</p>
      <p className="mt-0.5 text-xs text-[var(--color-neutral-500)]">{small}</p>
    </div>
  );
}
