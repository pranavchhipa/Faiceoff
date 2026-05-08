"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Image as ImageIcon,
  Zap,
  Globe,
  ArrowRight,
  Clock,
  Check,
  X,
  Info,
  Sparkles,
  Calendar,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

interface Package {
  id: string;
  tier: "frame" | "feature" | "cover";
  price_paise: number;
  final_images: number;
  is_active: boolean;
}

const TIER_DETAILS = {
  frame: {
    label: "Frame",
    badge: "Social · Organic",
    duration: "90 days",
    icon: ImageIcon,
    band: "from-sky-400 via-sky-500 to-sky-600",
    iconBg: "bg-sky-500/15",
    iconColor: "text-sky-400",
    accentText: "text-sky-400",
    accentRing: "ring-sky-500/30",
    cardBg: "bg-sky-500/[0.03]",
    cardBorder: "border-sky-500/15",
    btnBg: "bg-sky-500 hover:bg-sky-400 shadow-[0_4px_14px_-4px_rgba(56,189,248,0.5)]",
    short: "Organic posts on a single platform. Short-term visibility boost.",
    tagline: "Your toe in the water",
    perfect_for: "Testing brand fit · Limited campaigns · Single product launches",
    highlights: [
      "Organic-only social posts",
      "Single platform of your choice",
      "90-day usage window",
    ],
    allowed: [
      "Instagram organic feed posts",
      "Instagram Stories and Reels (organic)",
      "Tag the creator's handle",
      "License certificate downloadable as PDF",
    ],
    restricted: [
      "Paid ads or boosted posts",
      "Cross-platform usage (e.g. YouTube + Insta)",
      "Website, email, or OOH placements",
      "Repurposing after 90 days",
    ],
  },
  feature: {
    label: "Feature",
    badge: "Social · Paid",
    duration: "6 months",
    icon: Zap,
    band: "from-[#c9a96e] via-[#d4b87f] to-[#e8c89a]",
    iconBg: "bg-[var(--color-primary)]/15",
    iconColor: "text-[var(--color-primary)]",
    accentText: "text-[var(--color-primary)]",
    accentRing: "ring-[var(--color-primary)]/30",
    cardBg: "bg-[var(--color-primary)]/[0.04]",
    cardBorder: "border-[var(--color-primary)]/20",
    btnBg: "bg-[var(--color-primary)] hover:opacity-90 shadow-[0_4px_14px_-4px_rgba(201,169,110,0.5)]",
    short: "Paid + boosted ads across all social platforms. Full 6-month run.",
    tagline: "Most brands pick this",
    perfect_for: "Performance campaigns · Multi-platform ads · Always-on social",
    highlights: [
      "Paid social ad rights included",
      "All major social platforms",
      "6-month usage window",
    ],
    allowed: [
      "Instagram ads (Feed, Stories, Reels)",
      "YouTube ads (in-stream + Shorts)",
      "Facebook + Meta paid distribution",
      "Google Display Network",
      "Boosted organic posts + A/B testing",
      "License certificate + EXIF metadata audit",
    ],
    restricted: [
      "Brand website or landing pages",
      "Email marketing campaigns",
      "Out-of-home (billboards, transit)",
      "Product packaging or print collateral",
    ],
  },
  cover: {
    label: "Cover",
    badge: "Full Digital",
    duration: "12 months",
    icon: Globe,
    band: "from-violet-500 via-purple-500 to-purple-600",
    iconBg: "bg-violet-500/15",
    iconColor: "text-violet-400",
    accentText: "text-violet-400",
    accentRing: "ring-violet-500/30",
    cardBg: "bg-violet-500/[0.03]",
    cardBorder: "border-violet-500/15",
    btnBg: "bg-violet-600 hover:bg-violet-500 shadow-[0_4px_14px_-4px_rgba(139,92,246,0.5)]",
    short: "Unlimited digital usage — web, email, OOH, packaging, all ad platforms.",
    tagline: "The full toolkit",
    perfect_for: "Brand campaigns · Long-term creative · Maximum flexibility",
    highlights: [
      "Every digital surface",
      "All ad networks",
      "12-month usage window",
    ],
    allowed: [
      "Everything in Frame + Feature",
      "Brand website + landing pages",
      "Email marketing + newsletters",
      "Digital OOH (screens, billboards)",
      "Product packaging (digital previews)",
      "Influencer programs + repurposing",
      "Internal use (decks, training)",
    ],
    restricted: [
      "Physical print runs (case-by-case)",
      "TV broadcast (separate license)",
      "Resale or sublicensing",
      "Use beyond 12 months without renewal",
    ],
  },
} as const;

function fmt(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

interface Props {
  creatorId: string;
  packages: Package[];
  isLive: boolean;
}

export function PackageList({ creatorId, packages, isLive }: Props) {
  const [openTier, setOpenTier] = useState<Package["tier"] | null>(null);

  const ordered = (["frame", "feature", "cover"] as const)
    .map((t) => packages.find((p) => p.tier === t))
    .filter(Boolean) as Package[];

  if (ordered.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-5 py-10 text-center">
        <p className="font-display text-[16px] font-700 text-[var(--color-foreground)]">
          No packages yet
        </p>
        <p className="mt-1 text-[13px] text-[var(--color-muted-foreground)]">
          This creator hasn&apos;t set up packages yet. Check back soon.
        </p>
      </div>
    );
  }

  const openPkg = openTier ? ordered.find((p) => p.tier === openTier) ?? null : null;
  const openMeta = openTier ? TIER_DETAILS[openTier] : null;

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {ordered.map((pkg) => {
          const meta = TIER_DETAILS[pkg.tier];
          const Icon = meta.icon;
          const isPopular = pkg.tier === "feature";

          return (
            <motion.div
              key={pkg.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className={`group relative flex flex-col overflow-hidden rounded-2xl border ${meta.cardBorder} ${meta.cardBg} transition-all hover:-translate-y-1 hover:shadow-2xl`}
            >
              {/* Coloured top band */}
              <div className={`h-1.5 w-full bg-gradient-to-r ${meta.band}`} />

              {/* Popular ribbon */}
              {isPopular && (
                <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-[var(--color-primary)] px-2 py-0.5 font-mono text-[9px] font-700 uppercase tracking-[0.14em] text-[var(--color-primary-foreground)] shadow-md">
                  <Sparkles className="h-2.5 w-2.5" /> Popular
                </span>
              )}

              <div className="flex flex-1 flex-col gap-4 p-5">
                {/* Tier header */}
                <div className="flex items-start gap-3">
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${meta.iconBg}`}>
                    <Icon className={`h-5 w-5 ${meta.iconColor}`} />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-display text-[20px] font-800 leading-none tracking-tight text-[var(--color-foreground)]">
                      {meta.label}
                    </h3>
                    <p className={`mt-1 font-mono text-[10px] font-700 uppercase tracking-[0.16em] ${meta.accentText}`}>
                      {meta.badge}
                    </p>
                  </div>
                </div>

                {/* Tagline */}
                <p className={`text-[12px] font-600 ${meta.accentText}`}>
                  {meta.tagline}
                </p>

                {/* Price */}
                <div>
                  <p className="font-display text-[34px] font-800 leading-none tracking-tight text-[var(--color-foreground)]">
                    {fmt(pkg.price_paise)}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">
                    one-time payment · {pkg.final_images} images
                  </p>
                </div>

                {/* Quick highlights */}
                <ul className="space-y-2">
                  {meta.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-2 text-[12.5px] text-[var(--color-foreground)] leading-snug">
                      <Check className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${meta.accentText}`} />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>

                {/* Stats strip */}
                <div className="flex items-center gap-3 border-t border-[var(--color-border)] pt-3 text-[11px] text-[var(--color-muted-foreground)]">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> {meta.duration}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3" /> Licensed
                  </span>
                </div>

                {/* CTAs */}
                <div className="mt-auto flex flex-col gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setOpenTier(pkg.tier)}
                    className="inline-flex items-center justify-center gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] py-2 text-[12px] font-700 text-[var(--color-foreground)] transition-colors hover:border-[var(--color-primary)]/40"
                  >
                    <Info className="h-3.5 w-3.5" /> View full info
                  </button>

                  <Link
                    href={isLive ? `/brand/discover/${creatorId}/request?package=${pkg.id}` : "#"}
                    className={`flex items-center justify-center gap-1.5 rounded-xl py-3 text-[13px] font-700 text-white transition-all ${
                      isLive
                        ? meta.btnBg
                        : "pointer-events-none bg-[var(--color-secondary)] text-[var(--color-muted-foreground)] opacity-50"
                    }`}
                  >
                    Send request <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* ── Detailed info modal ── */}
      <AnimatePresence>
        {openTier && openPkg && openMeta && (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/70 backdrop-blur-sm sm:items-center"
            onClick={() => setOpenTier(null)}
          >
            <motion.div
              initial={{ y: 30, opacity: 0, scale: 0.97 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 30, opacity: 0, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 280, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
              className="relative my-6 w-full max-w-xl overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl"
            >
              {/* Header */}
              <div className={`h-2 w-full bg-gradient-to-r ${openMeta.band}`} />

              <div className="p-6 sm:p-7">
                <button
                  type="button"
                  onClick={() => setOpenTier(null)}
                  aria-label="Close"
                  className="absolute right-4 top-5 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-secondary)] hover:text-[var(--color-foreground)]"
                >
                  <X className="h-4 w-4" />
                </button>

                {/* Title */}
                <div className="mb-4 flex items-start gap-3 pr-8">
                  <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${openMeta.iconBg}`}>
                    <openMeta.icon className={`h-6 w-6 ${openMeta.iconColor}`} />
                  </span>
                  <div>
                    <p className={`font-mono text-[10px] font-700 uppercase tracking-[0.18em] ${openMeta.accentText}`}>
                      {openMeta.badge} · {openMeta.duration}
                    </p>
                    <h3 className="mt-0.5 font-display text-[26px] font-800 leading-tight tracking-tight text-[var(--color-foreground)]">
                      {openMeta.label} <span className="text-[var(--color-muted-foreground)]">— {fmt(openPkg.price_paise)}</span>
                    </h3>
                  </div>
                </div>

                <p className="mb-5 text-[14px] leading-relaxed text-[var(--color-muted-foreground)]">
                  {openMeta.short}
                </p>

                {/* Perfect for */}
                <div className={`mb-5 rounded-xl border ${openMeta.cardBorder} ${openMeta.cardBg} px-4 py-3`}>
                  <p className={`font-mono text-[10px] font-700 uppercase tracking-[0.16em] ${openMeta.accentText}`}>
                    Perfect for
                  </p>
                  <p className="mt-1 text-[13px] text-[var(--color-foreground)]">
                    {openMeta.perfect_for}
                  </p>
                </div>

                {/* Allowed / Restricted */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-2.5 inline-flex items-center gap-1.5 font-mono text-[10px] font-700 uppercase tracking-[0.16em] text-emerald-500">
                      <Check className="h-3 w-3" /> What you can do
                    </p>
                    <ul className="space-y-2">
                      {openMeta.allowed.map((a) => (
                        <li key={a} className="flex items-start gap-2 text-[12.5px] text-[var(--color-foreground)] leading-relaxed">
                          <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
                          <span>{a}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-2.5 inline-flex items-center gap-1.5 font-mono text-[10px] font-700 uppercase tracking-[0.16em] text-red-400">
                      <X className="h-3 w-3" /> Out of scope
                    </p>
                    <ul className="space-y-2">
                      {openMeta.restricted.map((r) => (
                        <li key={r} className="flex items-start gap-2 text-[12.5px] text-[var(--color-muted-foreground)] leading-relaxed">
                          <X className="mt-0.5 h-3 w-3 shrink-0 text-red-400" />
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Footer */}
                <div className="mt-6 flex flex-col gap-2 border-t border-[var(--color-border)] pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[11px] text-[var(--color-muted-foreground)]">
                    Faiceoff holds payment in escrow until collab completes.
                  </p>
                  <Link
                    href={isLive ? `/brand/discover/${creatorId}/request?package=${openPkg.id}` : "#"}
                    onClick={() => setOpenTier(null)}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-5 py-2.5 text-[13px] font-700 text-white transition-all ${
                      isLive
                        ? openMeta.btnBg
                        : "pointer-events-none bg-[var(--color-secondary)] text-[var(--color-muted-foreground)] opacity-60"
                    }`}
                  >
                    Send request <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
