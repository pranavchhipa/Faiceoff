"use client";

/**
 * /brand/collabs — "Your collabs"
 *
 * Visual language matches the rest of the dashboard (brand/requests,
 * brand/dashboard, creator/dashboard) — canonical `var(--color-*)` tokens,
 * Tailwind utilities, framer-motion fade-up entries. No scoped CSS namespace
 * and no custom --bg / film-grain overlay; the page sits flush with the
 * dashboard chrome.
 *
 * Data layer: /api/collabs returns { collabs, pending_payments }. We split
 * collabs into active/past and surface the 4-tile stat strip + a nudge to
 * the requests page when any are mid-flight.
 */

import { useCachedFetch } from "@/lib/hooks/use-cached-fetch";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Image as ImageIcon,
  Megaphone,
  Plus,
  Send,
  Sparkles,
  Zap,
} from "lucide-react";

/* ───────── Types ───────── */

interface Collab {
  id: string;
  name: string;
  status: string;
  package_tier: string | null;
  package_price_paise: number | null;
  final_images_target: number | null;
  approved_count: number;
  gen_credits_total: number | null;
  gen_credits_used: number;
  counterpart_name: string;
  counterpart_avatar_url: string | null;
  product_image_url: string | null;
  is_legacy: boolean;
  created_at: string;
}

/* ───────── Helpers ───────── */

function formatINR(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

const STATUS_META: Record<
  string,
  { label: string; color: string; bg: string; dot: string; icon: React.ComponentType<{ className?: string }> }
> = {
  active: {
    label: "Active",
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    dot: "bg-emerald-500",
    icon: Zap,
  },
  completed: {
    label: "Completed",
    color: "text-[var(--color-primary)]",
    bg: "bg-[var(--color-primary)]/10",
    dot: "bg-[var(--color-primary)]",
    icon: CheckCircle2,
  },
  paused: {
    label: "Paused",
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    dot: "bg-amber-500",
    icon: Clock,
  },
};

const TIER_META: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  frame: { label: "Frame", icon: ImageIcon },
  feature: { label: "Feature", icon: Zap },
  cover: { label: "Cover", icon: Sparkles },
};

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
};

/* ───────── Faiceoff verified seal (kept inline — used only here + discover) ───────── */

function FaSealDefs() {
  return (
    <svg
      width="0"
      height="0"
      style={{ position: "absolute", pointerEvents: "none" }}
      aria-hidden
    >
      <defs>
        <radialGradient
          id="faSealCollabs"
          cx="34"
          cy="28"
          r="58"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#fff1b8" />
          <stop offset="0.4" stopColor="#f0c34a" />
          <stop offset="0.85" stopColor="#a87a2a" />
          <stop offset="1" stopColor="#7a5418" />
        </radialGradient>
        <symbol id="faSealCollabsSym" viewBox="0 0 100 100">
          <g fill="url(#faSealCollabs)">
            <circle cx="50" cy="50" r="36" />
            <circle cx="50" cy="14" r="9" />
            <circle cx="75.46" cy="24.54" r="9" />
            <circle cx="86" cy="50" r="9" />
            <circle cx="75.46" cy="75.46" r="9" />
            <circle cx="50" cy="86" r="9" />
            <circle cx="24.54" cy="75.46" r="9" />
            <circle cx="14" cy="50" r="9" />
            <circle cx="24.54" cy="24.54" r="9" />
          </g>
          <ellipse
            cx="36"
            cy="25"
            rx="11"
            ry="4.5"
            fill="#ffffff"
            opacity="0.45"
            transform="rotate(-32 36 25)"
          />
          <path
            d="M 34 51 L 45 62 L 67 39"
            fill="none"
            stroke="#ffffff"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </symbol>
      </defs>
    </svg>
  );
}

function Seal({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <use href="#faSealCollabsSym" />
    </svg>
  );
}

/* ───────── Page ───────── */

export default function BrandCollabsPage() {
  const { data, loading: rawLoading } = useCachedFetch<{
    collabs?: Collab[];
    pending_payments?: { status: string }[];
  }>("/api/collabs");

  const collabs: Collab[] = data?.collabs ?? [];
  const pendingRequestCount = (data?.pending_payments ?? []).filter(
    (r) => r.status === "pending" || r.status === "accepted",
  ).length;
  const loading = rawLoading && !data;

  const active = collabs.filter((c) => c.status === "active");
  const past = collabs.filter((c) => c.status !== "active");

  const totalApproved = collabs.reduce(
    (s, c) => s + (c.approved_count ?? 0),
    0,
  );
  const totalImagesTarget = collabs.reduce(
    (s, c) => s + (c.final_images_target ?? 0),
    0,
  );
  const totalSpentPaise = collabs.reduce(
    (s, c) => s + (c.package_price_paise ?? 0),
    0,
  );

  if (loading) return <CollabsSkeleton />;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 pt-4 pb-10 lg:px-8 lg:pt-5 lg:pb-12">
      <FaSealDefs />

      {/* ═══════════ Header ═══════════ */}
      <motion.header
        variants={fadeUp}
        initial="initial"
        animate="animate"
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] as const }}
        className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
            <Megaphone className="mr-1.5 inline h-3 w-3 text-[var(--color-primary)]" />
            Collabs
          </p>
          <h1 className="mt-1 font-display text-[30px] font-800 leading-none tracking-tight text-[var(--color-foreground)] lg:text-[40px]">
            Your collabs
          </h1>
          <p className="mt-1.5 max-w-xl text-[13px] text-[var(--color-muted-foreground)] lg:text-[14px]">
            Live workspaces with creators you&apos;ve paid. Each one bundles
            Studio, Chat, and Vault.
          </p>
        </div>

        <Link
          href="/brand/discover"
          className="inline-flex items-center gap-1.5 rounded-[var(--radius-button)] bg-[var(--color-primary)] px-5 py-2.5 text-[13px] font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.4)] transition-transform hover:-translate-y-0.5"
        >
          <Plus className="h-3.5 w-3.5" />
          Start new collab
        </Link>
      </motion.header>

      {/* ═══════════ Pending requests nudge ═══════════ */}
      {pendingRequestCount > 0 && (
        <motion.div
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{
            duration: 0.4,
            delay: 0.05,
            ease: [0.22, 1, 0.36, 1] as const,
          }}
        >
          <Link
            href="/brand/requests"
            className="group flex items-center gap-3 rounded-2xl border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/8 p-4 transition-colors hover:bg-[var(--color-primary)]/12"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
              <Send className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-[14px] font-700 text-[var(--color-foreground)]">
                {pendingRequestCount}{" "}
                {pendingRequestCount === 1 ? "request" : "requests"} in progress
              </p>
              <p className="text-[12px] text-[var(--color-muted-foreground)]">
                Track replies + payment status on the Requests page.
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] font-700 uppercase tracking-wider text-[var(--color-primary)] transition-transform group-hover:translate-x-0.5">
              View requests
              <ArrowRight className="h-3 w-3" />
            </span>
          </Link>
        </motion.div>
      )}

      {/* ═══════════ Stats strip ═══════════ */}
      {collabs.length > 0 && (
        <motion.div
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{
            duration: 0.4,
            delay: 0.1,
            ease: [0.22, 1, 0.36, 1] as const,
          }}
          className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        >
          <StatTile
            icon={Zap}
            label="Active"
            value={String(active.length)}
            tone={active.length > 0 ? "success" : "default"}
          />
          <StatTile
            icon={CheckCircle2}
            label="Completed"
            value={String(past.length)}
            tone="default"
          />
          <StatTile
            icon={ImageIcon}
            label="Images"
            value={`${totalApproved}/${totalImagesTarget || 0}`}
            sub="approved"
            tone="default"
          />
          <StatTile
            icon={Megaphone}
            label="Total spent"
            value={formatINR(totalSpentPaise)}
            tone="primary"
          />
        </motion.div>
      )}

      {/* ═══════════ Empty state ═══════════ */}
      {collabs.length === 0 && (
        <EmptyState pendingRequests={pendingRequestCount} />
      )}

      {/* ═══════════ Active section ═══════════ */}
      {active.length > 0 && (
        <motion.section
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{
            duration: 0.4,
            delay: 0.15,
            ease: [0.22, 1, 0.36, 1] as const,
          }}
        >
          <SectionHeader
            label="Active"
            count={active.length}
            tone="success"
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {active.map((c, i) => (
              <CollabCard key={c.id} collab={c} delay={i * 0.04} />
            ))}
          </div>
        </motion.section>
      )}

      {/* ═══════════ Past section ═══════════ */}
      {past.length > 0 && (
        <motion.section
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{
            duration: 0.4,
            delay: 0.2,
            ease: [0.22, 1, 0.36, 1] as const,
          }}
        >
          <SectionHeader label="Past" count={past.length} tone="muted" />
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {past.map((c, i) => (
              <CollabRow key={c.id} collab={c} delay={i * 0.03} />
            ))}
          </div>
        </motion.section>
      )}
    </div>
  );
}

/* ───────── Section header ───────── */

function SectionHeader({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "success" | "muted";
}) {
  const labelColor =
    tone === "success"
      ? "text-emerald-500"
      : "text-[var(--color-muted-foreground)]";
  return (
    <div className="mb-4 flex items-center gap-2.5">
      <p
        className={`font-mono text-[10px] font-700 uppercase tracking-[0.22em] ${labelColor}`}
      >
        {label}
      </p>
      <span className="inline-flex h-5 min-w-[22px] items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-secondary)] px-1.5 font-mono text-[10px] font-700 text-[var(--color-foreground)]">
        {count}
      </span>
    </div>
  );
}

/* ───────── Stat tile ───────── */

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "primary" | "success";
}) {
  const accentBorder =
    tone === "success"
      ? "border-emerald-500/30"
      : tone === "primary"
        ? "border-[var(--color-primary)]/30"
        : "border-[var(--color-border)]";
  const iconBg =
    tone === "success"
      ? "bg-emerald-500/10 text-emerald-500"
      : tone === "primary"
        ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
        : "bg-[var(--color-secondary)] text-[var(--color-foreground)]";
  const valueColor =
    tone === "success"
      ? "text-emerald-500"
      : tone === "primary"
        ? "text-[var(--color-primary)]"
        : "text-[var(--color-foreground)]";

  return (
    <div
      className={`rounded-2xl border bg-[var(--color-card)] p-4 lg:p-5 ${accentBorder}`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-lg ${iconBg}`}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="font-mono text-[10px] font-700 uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
          {label}
        </span>
      </div>
      <p
        className={`mt-2.5 font-display text-[24px] font-800 leading-none tracking-tight ${valueColor} lg:text-[28px]`}
      >
        {value}
      </p>
      {sub && (
        <p className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
          {sub}
        </p>
      )}
    </div>
  );
}

/* ───────── Active collab card ───────── */

function CollabCard({ collab, delay }: { collab: Collab; delay: number }) {
  const status = STATUS_META[collab.status] ?? STATUS_META.active;
  const tier = collab.package_tier ? TIER_META[collab.package_tier] : null;
  const TierIcon = tier?.icon;

  const progress =
    collab.final_images_target && collab.final_images_target > 0
      ? Math.round((collab.approved_count / collab.final_images_target) * 100)
      : null;

  const creditsLeft =
    collab.gen_credits_total != null
      ? collab.gen_credits_total - collab.gen_credits_used
      : null;

  return (
    <motion.div
      variants={fadeUp}
      initial="initial"
      animate="animate"
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] as const }}
    >
      <Link
        href={`/brand/collabs/${collab.id}`}
        className="group flex overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] transition-all hover:-translate-y-0.5 hover:border-[var(--color-primary)]/30 hover:shadow-[0_12px_32px_-12px_rgba(201,169,110,0.25)]"
      >
        {/* Product image */}
        <div className="relative aspect-square w-[140px] shrink-0 overflow-hidden bg-[var(--color-secondary)] sm:w-[160px]">
          {collab.product_image_url ? (
            <Image
              src={collab.product_image_url}
              alt={collab.name}
              fill
              sizes="160px"
              className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <ImageIcon className="h-8 w-8 text-[var(--color-muted-foreground)]" />
            </div>
          )}
          {/* Status pill — dark backdrop for legibility on any image */}
          <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 font-mono text-[9px] font-700 uppercase tracking-wider text-white backdrop-blur-md">
            <span className="relative flex h-1.5 w-1.5">
              <span
                className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${status.dot}`}
              />
              <span
                className={`relative inline-flex h-1.5 w-1.5 rounded-full ${status.dot}`}
              />
            </span>
            {status.label}
          </span>
        </div>

        {/* Body */}
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 p-4 sm:p-5">
          <div className="min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="line-clamp-2 font-display text-[15px] font-800 leading-tight tracking-tight text-[var(--color-foreground)]">
                {collab.name}
              </h3>
              {tier && TierIcon && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 px-2 py-0.5 font-mono text-[9px] font-700 uppercase tracking-wider text-[var(--color-primary)]">
                  <TierIcon className="h-2.5 w-2.5" />
                  {tier.label}
                </span>
              )}
            </div>

            <div className="mt-2 flex items-center gap-1.5 text-[12px] text-[var(--color-muted-foreground)]">
              {collab.counterpart_avatar_url ? (
                <Image
                  src={collab.counterpart_avatar_url}
                  alt=""
                  width={18}
                  height={18}
                  className="h-[18px] w-[18px] shrink-0 rounded-full object-cover ring-1 ring-[var(--color-border)]"
                  unoptimized
                />
              ) : (
                <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[var(--color-secondary)] font-display text-[9px] font-800 text-[var(--color-foreground)] ring-1 ring-[var(--color-border)]">
                  {collab.counterpart_name.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="truncate">
                with{" "}
                <span className="font-600 text-[var(--color-foreground)]">
                  {collab.counterpart_name}
                </span>
              </span>
              <Seal size={11} />
            </div>
          </div>

          <div>
            {progress !== null && (
              <>
                <div className="mb-1.5 flex items-center justify-between gap-2 font-mono text-[10px] text-[var(--color-muted-foreground)]">
                  <span>
                    <span className="font-700 text-[var(--color-foreground)]">
                      {collab.approved_count}
                    </span>
                    /{collab.final_images_target} approved
                  </span>
                  {creditsLeft !== null && (
                    <span className="inline-flex items-center gap-1 text-[var(--color-primary)]">
                      <Zap className="h-2.5 w-2.5" />
                      {creditsLeft} credits left
                    </span>
                  )}
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-secondary)]">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(progress, 100)}%` }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    className="h-full rounded-full bg-gradient-to-r from-[var(--color-primary)]/70 to-[var(--color-primary)]"
                  />
                </div>
              </>
            )}

            <p className="mt-3 inline-flex items-center gap-1 font-mono text-[10px] font-700 uppercase tracking-[0.16em] text-[var(--color-muted-foreground)] transition-colors group-hover:text-[var(--color-primary)]">
              Open workspace
              <ArrowRight className="h-3 w-3" />
            </p>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

/* ───────── Past collab row ───────── */

function CollabRow({ collab, delay }: { collab: Collab; delay: number }) {
  const status = STATUS_META[collab.status] ?? STATUS_META.completed;

  return (
    <motion.div
      variants={fadeUp}
      initial="initial"
      animate="animate"
      transition={{ duration: 0.3, delay, ease: [0.22, 1, 0.36, 1] as const }}
    >
      <Link
        href={`/brand/collabs/${collab.id}`}
        className="group flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 transition-colors hover:border-[var(--color-primary)]/30 hover:bg-[var(--color-secondary)]/30"
      >
        {/* Thumbnail */}
        <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-[var(--color-secondary)]">
          {collab.product_image_url ? (
            <Image
              src={collab.product_image_url}
              alt=""
              fill
              sizes="48px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <ImageIcon className="h-4 w-4 text-[var(--color-muted-foreground)]" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[13.5px] font-700 text-[var(--color-foreground)]">
            {collab.name}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-[var(--color-muted-foreground)]">
            <span className={`font-600 ${status.color}`}>{status.label}</span>
            <span className="text-[var(--color-border)]">·</span>
            <span className="truncate">with {collab.counterpart_name}</span>
            <span className="text-[var(--color-border)]">·</span>
            <span className="shrink-0">
              {collab.approved_count}/{collab.final_images_target ?? 0} imgs
            </span>
          </p>
        </div>

        <ArrowRight className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)] transition-all group-hover:translate-x-0.5 group-hover:text-[var(--color-primary)]" />
      </Link>
    </motion.div>
  );
}

/* ───────── Empty state ───────── */

function EmptyState({ pendingRequests }: { pendingRequests: number }) {
  const hasPending = pendingRequests > 0;
  return (
    <motion.div
      variants={fadeUp}
      initial="initial"
      animate="animate"
      transition={{
        duration: 0.4,
        delay: 0.1,
        ease: [0.22, 1, 0.36, 1] as const,
      }}
      className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] p-12 text-center"
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
        <Megaphone className="h-6 w-6" />
      </div>
      <p className="font-display text-[18px] font-800 tracking-tight text-[var(--color-foreground)]">
        No active collabs yet
      </p>
      <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-[var(--color-muted-foreground)]">
        {hasPending
          ? "Once a creator accepts your request and you pay, the collab lands here."
          : "Discover a creator and send a collab request to get started."}
      </p>
      <Link
        href={hasPending ? "/brand/requests" : "/brand/discover"}
        className="mt-5 inline-flex items-center gap-1.5 rounded-[var(--radius-button)] bg-[var(--color-primary)] px-5 py-2.5 text-[13px] font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.4)] transition-transform hover:-translate-y-0.5"
      >
        {hasPending ? "View requests" : "Discover creators"}
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </motion.div>
  );
}

/* ───────── Skeleton ───────── */

function CollabsSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 pt-4 pb-10 lg:px-8 lg:pt-5 lg:pb-12">
      <div className="flex items-end justify-between">
        <div>
          <div className="h-3 w-20 animate-pulse rounded bg-[var(--color-secondary)]" />
          <div className="mt-2 h-9 w-56 animate-pulse rounded-xl bg-[var(--color-secondary)]" />
          <div className="mt-2 h-3 w-72 animate-pulse rounded bg-[var(--color-secondary)]" />
        </div>
        <div className="h-10 w-44 animate-pulse rounded-xl bg-[var(--color-secondary)]" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-[110px] animate-pulse rounded-2xl bg-[var(--color-secondary)]"
          />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-[180px] animate-pulse rounded-2xl bg-[var(--color-secondary)]"
          />
        ))}
      </div>
    </div>
  );
}
