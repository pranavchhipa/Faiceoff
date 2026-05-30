"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  Handshake,
  Loader2,
  Zap,
  CheckCircle2,
  Clock,
  ImageIcon,
  Globe,
  Image as ImageIconSm,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useCachedFetch } from "@/lib/hooks/use-cached-fetch";

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

const TIER_META: Record<
  string,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    bar: string;
    chipBg: string;
    chipText: string;
  }
> = {
  frame: {
    label: "Frame",
    icon: ImageIconSm,
    bar: "bg-sky-500",
    chipBg: "bg-sky-500",
    chipText: "text-white",
  },
  feature: {
    label: "Feature",
    icon: Zap,
    bar: "bg-[var(--color-primary)]",
    chipBg: "bg-[var(--color-primary)]",
    chipText: "text-[var(--color-primary-foreground)]",
  },
  cover: {
    label: "Cover",
    icon: Globe,
    bar: "bg-violet-500",
    chipBg: "bg-violet-500",
    chipText: "text-white",
  },
};

const STATUS_META: Record<
  string,
  {
    label: string;
    color: string;
    bg: string;
    dot: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  active: {
    label: "Active",
    color: "text-emerald-600",
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
    color: "text-yellow-600",
    bg: "bg-yellow-500/10",
    dot: "bg-yellow-500",
    icon: Clock,
  },
};

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
};

function paiseToInr(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

export default function CreatorCollabsPage() {
  const { data, loading: rawLoading } = useCachedFetch<{ collabs?: Collab[] }>(
    "/api/collabs",
  );
  const collabs = data?.collabs ?? [];
  const loading = rawLoading && !data;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--color-muted-foreground)]" />
      </div>
    );
  }

  const active = collabs.filter((c) => c.status === "active");
  const completed = collabs.filter((c) => c.status !== "active");

  // Stats strip
  const totalActive = active.length;
  const totalApproved = collabs.reduce(
    (sum, c) => sum + (c.approved_count ?? 0),
    0,
  );
  const pendingReview = collabs.reduce((sum, c) => {
    // We don't have status counts per collab in the list response — leave 0.
    return sum;
  }, 0);
  const totalEarnedPaise = collabs.reduce(
    (sum, c) =>
      sum + (c.status === "completed" ? c.package_price_paise ?? 0 : 0),
    0,
  );

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 lg:px-8 lg:py-8">
      <motion.div
        variants={fadeUp}
        initial="initial"
        animate="animate"
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between"
      >
        <div>
          <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
            <Handshake className="mr-1 inline h-3 w-3 text-[var(--color-primary)]" />
            Collabs
          </p>
          <h1 className="mt-1 font-display text-[34px] font-800 leading-[1.05] tracking-tight text-[var(--color-foreground)] sm:text-[40px]">
            Your Collabs
          </h1>
          <p className="mt-2 text-[13px] text-[var(--color-muted-foreground)]">
            Active brand collaborations — review images, chat directly, track
            payouts.
          </p>
        </div>
      </motion.div>

      {/* Stats strip */}
      {collabs.length > 0 && (
        <motion.div
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.4, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
          className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          <Stat
            icon={Zap}
            label="Active"
            value={String(totalActive)}
            tone="primary"
          />
          <Stat
            icon={CheckCircle2}
            label="Approved"
            value={String(totalApproved)}
            sub="lifetime"
            tone="success"
          />
          <Stat
            icon={Sparkles}
            label="Past collabs"
            value={String(completed.length)}
            tone="default"
          />
          <Stat
            icon={TrendingUp}
            label="Past earnings"
            value={totalEarnedPaise > 0 ? paiseToInr(totalEarnedPaise) : "—"}
            sub="from completed"
            tone="default"
          />
        </motion.div>
      )}

      {collabs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] p-12 text-center">
          <Handshake className="mx-auto mb-3 h-10 w-10 text-[var(--color-muted-foreground)]" />
          <p className="font-display text-[16px] font-700 text-[var(--color-foreground)]">
            No collabs yet
          </p>
          <p className="mt-1 text-[13px] text-[var(--color-muted-foreground)]">
            When a brand pays for a collab, it will appear here.
          </p>
          <Link
            href="/creator/requests"
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-5 py-2.5 text-[13px] font-700 text-[var(--color-primary-foreground)]"
          >
            View requests
          </Link>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <section className="mb-8">
              <p className="mb-3 font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                Active — {active.length}
              </p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {active.map((c, i) => (
                  <ActiveCollabCard key={c.id} collab={c} delay={i * 0.05} />
                ))}
              </div>
            </section>
          )}
          {completed.length > 0 && (
            <section>
              <p className="mb-3 font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                Past — {completed.length}
              </p>
              <div className="space-y-2">
                {completed.map((c, i) => (
                  <PastCollabRow key={c.id} collab={c} delay={i * 0.04} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/* ── Active collab card — hero layout with product image + tier accent bar ── */
function ActiveCollabCard({
  collab,
  delay,
}: {
  collab: Collab;
  delay: number;
}) {
  const tier = collab.package_tier
    ? TIER_META[collab.package_tier] ?? TIER_META.frame
    : TIER_META.frame;
  const TierIcon = tier.icon;
  const statusMeta = STATUS_META[collab.status] ?? STATUS_META.active;
  const StatusIcon = statusMeta.icon;
  const target = collab.final_images_target ?? 0;
  const approved = collab.approved_count ?? 0;
  const progress = target > 0 ? Math.round((approved / target) * 100) : 0;

  return (
    <motion.div
      variants={{ initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } }}
      initial="initial"
      animate="animate"
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link
        href={`/creator/collabs/${collab.id}`}
        className="group relative block overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] transition-all hover:-translate-y-0.5 hover:border-[var(--color-primary)]/30 hover:shadow-[0_12px_32px_-12px_rgba(201,169,110,0.3)]"
      >
        {/* Tier accent bar */}
        <div className={`h-[3px] w-full ${tier.bar}`} />

        {/* Product image with overlays */}
        <div className="relative aspect-[16/10] w-full bg-[var(--color-secondary)]">
          {collab.product_image_url ? (
            <Image
              src={collab.product_image_url}
              alt={collab.name}
              fill
              sizes="(max-width: 768px) 100vw, 33vw"
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <ImageIcon className="h-10 w-10 text-[var(--color-muted-foreground)]" />
            </div>
          )}

          {/* Tier chip */}
          <span
            className={`absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-700 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.5)] ${tier.chipBg} ${tier.chipText}`}
          >
            <TierIcon className="h-3 w-3" />
            {tier.label}
          </span>

          {/* Status chip */}
          <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-700 text-white backdrop-blur-md">
            <span className="relative flex h-1.5 w-1.5">
              <span
                className={`absolute inline-flex h-full w-full animate-ping rounded-full ${statusMeta.dot} opacity-60`}
              />
              <span
                className={`relative inline-flex h-1.5 w-1.5 rounded-full ${statusMeta.dot}`}
              />
            </span>
            {statusMeta.label}
          </span>
        </div>

        {/* Body */}
        <div className="p-4">
          <p className="line-clamp-1 font-display text-[16px] font-800 leading-tight text-[var(--color-foreground)]">
            {collab.name}
          </p>

          {/* Counterpart row */}
          <div className="mt-2 flex items-center gap-2">
            {collab.counterpart_avatar_url ? (
              <Image
                src={collab.counterpart_avatar_url}
                alt={collab.counterpart_name}
                width={20}
                height={20}
                className="h-5 w-5 rounded-full object-cover ring-1 ring-[var(--color-border)]"
                unoptimized
              />
            ) : (
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-secondary)] text-[10px] font-700 text-[var(--color-foreground)] ring-1 ring-[var(--color-border)]">
                {(collab.counterpart_name ?? "?").charAt(0).toUpperCase()}
              </div>
            )}
            <p className="truncate text-[12px] text-[var(--color-muted-foreground)]">
              with{" "}
              <span className="font-700 text-[var(--color-foreground)]">
                {collab.counterpart_name}
              </span>
            </p>
          </div>

          {/* Progress */}
          {target > 0 && (
            <div className="mt-3.5">
              <div className="mb-1 flex items-center justify-between font-mono text-[10px] text-[var(--color-muted-foreground)]">
                <span>
                  {approved}/{target} approved
                </span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-secondary)]">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(progress, 100)}%` }}
                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  className={`h-full rounded-full ${tier.bar}`}
                />
              </div>
            </div>
          )}

          {/* Open hint */}
          <p className="mt-3.5 font-mono text-[10px] font-700 uppercase tracking-[0.16em] text-[var(--color-muted-foreground)] transition-colors group-hover:text-[var(--color-primary)]">
            Open workspace →
          </p>
        </div>
      </Link>
    </motion.div>
  );
}

/* ── Past collab — compact single-row ── */
function PastCollabRow({
  collab,
  delay,
}: {
  collab: Collab;
  delay: number;
}) {
  const tier = collab.package_tier
    ? TIER_META[collab.package_tier] ?? TIER_META.frame
    : TIER_META.frame;
  const TierIcon = tier.icon;
  const statusMeta = STATUS_META[collab.status] ?? STATUS_META.completed;

  return (
    <motion.div
      variants={{ initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 } }}
      initial="initial"
      animate="animate"
      transition={{ duration: 0.3, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link
        href={`/creator/collabs/${collab.id}`}
        className="group flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 transition-all hover:border-[var(--color-primary)]/30 hover:bg-[var(--color-secondary)]/30"
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
            <div className="flex h-full items-center justify-center">
              <ImageIcon className="h-4 w-4 text-[var(--color-muted-foreground)]" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[14px] font-700 text-[var(--color-foreground)]">
            {collab.name}
          </p>
          <p className="truncate text-[11px] text-[var(--color-muted-foreground)]">
            with {collab.counterpart_name} · {collab.approved_count} approved
          </p>
        </div>

        {/* Status pills */}
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9px] font-700 uppercase ${statusMeta.bg} ${statusMeta.color}`}
          >
            {statusMeta.label}
          </span>
          <span
            className={`hidden items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9px] font-700 sm:inline-flex ${tier.chipBg} ${tier.chipText}`}
          >
            <TierIcon className="h-2.5 w-2.5" />
            {tier.label}
          </span>
        </div>
      </Link>
    </motion.div>
  );
}

/* ── Stat tile ── */
function Stat({
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
  const toneStyles = {
    default: "text-[var(--color-foreground)]",
    primary: "text-[var(--color-primary)]",
    success: "text-emerald-500",
  } as const;

  const iconBg = {
    default: "bg-[var(--color-secondary)] text-[var(--color-foreground)]",
    primary: "bg-[var(--color-primary)]/10 text-[var(--color-primary)]",
    success: "bg-emerald-500/10 text-emerald-500",
  } as const;

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3.5">
      <div className="flex items-center gap-2">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-lg ${iconBg[tone]}`}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="font-mono text-[10px] font-700 uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
          {label}
        </span>
      </div>
      <p
        className={`mt-2 font-display text-[24px] font-800 leading-none ${toneStyles[tone]}`}
      >
        {value}
        {sub && (
          <span className="ml-1.5 align-middle font-display text-[11px] font-600 text-[var(--color-muted-foreground)]">
            {sub}
          </span>
        )}
      </p>
    </div>
  );
}
