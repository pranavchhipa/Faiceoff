"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Megaphone, Loader2, Plus, Clock, CheckCircle2, Zap,
  ArrowRight, Image as ImageIcon, FileImage,
  Send, Globe,
} from "lucide-react";
import Image from "next/image";

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

// `bg`/`color` are kept for any callers that still want the soft-tint chip,
// but the on-image status pill (which sits over arbitrary product photos —
// white iPhone, dark KitKat, etc.) uses `dot` against a dark backdrop so the
// label stays readable on every background. Don't tint the pill itself.
const STATUS_META: Record<string, { label: string; color: string; bg: string; dot: string; icon: React.ComponentType<{ className?: string }> }> = {
  active:    { label: "Active",    color: "text-emerald-600",            bg: "bg-emerald-500/10",            dot: "bg-emerald-400",                icon: Zap },
  completed: { label: "Completed", color: "text-[var(--color-primary)]", bg: "bg-[var(--color-primary)]/10", dot: "bg-[var(--color-primary)]",     icon: CheckCircle2 },
  paused:    { label: "Paused",    color: "text-yellow-600",             bg: "bg-yellow-500/10",             dot: "bg-yellow-400",                 icon: Clock },
};

const TIER_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string; bg: string; bar: string }> = {
  frame:   { label: "Frame",   icon: ImageIcon, color: "text-sky-600",                bg: "bg-sky-500/10",                bar: "bg-sky-500" },
  feature: { label: "Feature", icon: Zap,       color: "text-[var(--color-primary)]", bg: "bg-[var(--color-primary)]/10", bar: "bg-[var(--color-primary)]" },
  cover:   { label: "Cover",   icon: Globe,     color: "text-violet-600",             bg: "bg-violet-500/10",             bar: "bg-violet-500" },
};

function fmt(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

const fadeUp = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };

export default function BrandCollabsPage() {
  const [collabs, setCollabs] = useState<Collab[]>([]);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/collabs", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : { collabs: [], pending_payments: [] })
      .then((d) => {
        setCollabs(d.collabs ?? []);
        // Count pending/accepted requests so we can show a nudge banner
        // pointing the brand to /brand/requests where the request flow lives.
        const reqs = (d.pending_payments ?? []) as { status: string }[];
        setPendingRequestCount(
          reqs.filter((r) => r.status === "pending" || r.status === "accepted").length,
        );
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--color-muted-foreground)]" />
      </div>
    );
  }

  const active    = collabs.filter((c) => c.status === "active");
  const completed = collabs.filter((c) => c.status !== "active");

  // Aggregate stats for the header strip
  const totalApproved   = collabs.reduce((s, c) => s + (c.approved_count ?? 0), 0);
  const totalImagesTarget = collabs.reduce((s, c) => s + (c.final_images_target ?? 0), 0);
  const totalSpentPaise = collabs.reduce((s, c) => s + (c.package_price_paise ?? 0), 0);

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-6 lg:px-8 lg:py-8">
      {/* ── Hero header ── */}
      <motion.div
        variants={fadeUp}
        initial="initial"
        animate="animate"
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between"
      >
        <div>
          <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
            <Megaphone className="mr-1 inline h-3 w-3 text-[var(--color-primary)]" />
            Collabs
          </p>
          <h1 className="mt-1 font-display text-[34px] font-800 leading-[1.05] tracking-tight text-[var(--color-foreground)] lg:text-[42px]">
            Your collabs
          </h1>
          <p className="mt-2 text-[13.5px] text-[var(--color-muted-foreground)]">
            Live workspaces with creators you&apos;ve paid. Each one bundles Studio, Chat, and Vault.
          </p>
        </div>
        <Link
          href="/brand/discover"
          className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-[13px] font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.4)] transition hover:-translate-y-0.5"
        >
          <Plus className="h-3.5 w-3.5" />
          Start new collab
        </Link>
      </motion.div>

      {/* ── Pending requests nudge (links to /brand/requests) ── */}
      {pendingRequestCount > 0 && (
        <Link
          href="/brand/requests"
          className="group mb-6 flex items-center justify-between gap-4 rounded-2xl border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 p-4 transition hover:bg-[var(--color-primary)]/10"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
              <Send className="h-4 w-4" />
            </span>
            <div>
              <p className="font-display text-[14px] font-800 text-[var(--color-foreground)]">
                {pendingRequestCount} {pendingRequestCount === 1 ? "request" : "requests"} in progress
              </p>
              <p className="text-[12px] text-[var(--color-muted-foreground)]">
                Track replies + payment status on the Requests page.
              </p>
            </div>
          </div>
          <span className="flex items-center gap-1 text-[12px] font-700 text-[var(--color-primary)]">
            View requests
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      )}

      {/* ── Stats strip ── */}
      {collabs.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            icon={Zap}
            label="Active"
            value={active.length.toString()}
            accent={active.length > 0}
          />
          <StatTile
            icon={CheckCircle2}
            label="Completed"
            value={completed.length.toString()}
          />
          <StatTile
            icon={ImageIcon}
            label="Images"
            value={`${totalApproved}/${totalImagesTarget || 0}`}
            sub="approved"
          />
          <StatTile
            icon={Megaphone}
            label="Total spent"
            value={fmt(totalSpentPaise)}
          />
        </div>
      )}

      {collabs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] p-12 text-center">
          <Megaphone className="mx-auto mb-3 h-10 w-10 text-[var(--color-muted-foreground)]" />
          <p className="font-display text-[16px] font-700 text-[var(--color-foreground)]">No active collabs yet</p>
          <p className="mt-1 text-[13px] text-[var(--color-muted-foreground)]">
            {pendingRequestCount > 0
              ? "Once a creator accepts your request and you pay, the collab lands here."
              : "Discover a creator and send a collab request to get started."}
          </p>
          <Link
            href={pendingRequestCount > 0 ? "/brand/requests" : "/brand/discover"}
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-5 py-2.5 text-[13px] font-700 text-[var(--color-primary-foreground)]"
          >
            {pendingRequestCount > 0 ? "View requests" : "Discover creators"}
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {/* ── Active ── */}
          {active.length > 0 && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <p className="font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-500">
                  Active
                </p>
                <span className="flex h-4 min-w-[18px] items-center justify-center rounded-full bg-emerald-500/15 px-1.5 font-mono text-[9px] font-700 text-emerald-700 dark:text-emerald-400">
                  {active.length}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {active.map((c, i) => <CollabCard key={c.id} collab={c} delay={i * 0.05} variant="active" />)}
              </div>
            </section>
          )}

          {/* ── Past ── */}
          {completed.length > 0 && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <p className="font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                  Past
                </p>
                <span className="flex h-4 min-w-[18px] items-center justify-center rounded-full bg-[var(--color-secondary)] px-1.5 font-mono text-[9px] font-700 text-[var(--color-muted-foreground)]">
                  {completed.length}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {completed.map((c, i) => <CollabCard key={c.id} collab={c} delay={i * 0.04} variant="past" />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Stat tile (header strip) ── */
function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-3.5 ${
        accent
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-[var(--color-border)] bg-[var(--color-card)]"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-lg ${
            accent
              ? "bg-emerald-500/15 text-emerald-600"
              : "bg-[var(--color-secondary)] text-[var(--color-muted-foreground)]"
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <p className="font-mono text-[9.5px] font-700 uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
          {label}
        </p>
      </div>
      <p className="mt-2 font-display text-[20px] font-800 leading-none tracking-tight text-[var(--color-foreground)]">
        {value}
      </p>
      {sub && (
        <p className="mt-1 font-mono text-[10px] text-[var(--color-muted-foreground)]">
          {sub}
        </p>
      )}
    </div>
  );
}

/* ── Collab card (active / past) ── */
function CollabCard({
  collab,
  delay,
  variant,
}: {
  collab: Collab;
  delay: number;
  variant: "active" | "past";
}) {
  const statusMeta = STATUS_META[collab.status] ?? STATUS_META.active;
  const tier = collab.package_tier ? TIER_META[collab.package_tier] : null;
  const TierIcon = tier?.icon;
  const progress = collab.final_images_target
    ? Math.round((collab.approved_count / collab.final_images_target) * 100)
    : null;
  const creditsLeft = collab.gen_credits_total != null
    ? collab.gen_credits_total - collab.gen_credits_used
    : null;

  // Compact past card — visually quieter
  if (variant === "past") {
    return (
      <motion.div
        variants={{ initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } }}
        initial="initial"
        animate="animate"
        transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
      >
        <Link
          href={`/brand/collabs/${collab.id}`}
          className="group flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 transition-all hover:border-[var(--color-primary)]/30"
        >
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]">
            {collab.product_image_url ? (
              <Image
                src={collab.product_image_url}
                alt={collab.name}
                fill
                sizes="48px"
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <FileImage className="h-4 w-4 text-[var(--color-muted-foreground)]" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-700 text-[13px] text-[var(--color-foreground)]">
              {collab.name}
            </p>
            <p className="truncate font-mono text-[10.5px] text-[var(--color-muted-foreground)]">
              {statusMeta.label} · {collab.approved_count}/{collab.final_images_target ?? 0}
            </p>
          </div>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--color-muted-foreground)] transition-transform group-hover:translate-x-0.5" />
        </Link>
      </motion.div>
    );
  }

  // Big active card — single click anywhere takes you to the full collab
  // workspace (Studio / Vault / Chat / Details tabs).
  return (
    <motion.div
      variants={{ initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } }}
      initial="initial"
      animate="animate"
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link
        href={`/brand/collabs/${collab.id}`}
        className="group block overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] transition-all hover:-translate-y-0.5 hover:border-[var(--color-primary)]/40 hover:shadow-[0_12px_32px_-12px_rgba(201,169,110,0.3)]"
      >
        {/* Top accent bar — colour matches package tier */}
        <div className={`h-1 w-full ${tier?.bar ?? "bg-[var(--color-primary)]"}`} />

        <div className="flex gap-0">
          {/* Product image (left, square) */}
          <div className="relative aspect-square w-[140px] shrink-0 overflow-hidden bg-[var(--color-secondary)] sm:w-[160px]">
            {collab.product_image_url ? (
              <Image
                src={collab.product_image_url}
                alt={collab.name}
                fill
                sizes="160px"
                className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                unoptimized
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <FileImage className="h-8 w-8 text-[var(--color-muted-foreground)]" />
              </div>
            )}
            {/* Status pill on the image — dark backdrop + white text so it
                stays readable on any product background (white iPhone,
                dark KitKat, gradient jersey, etc.). The 10%-alpha tinted
                chip was invisible on light-bg product shots. */}
            <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[9px] font-700 uppercase text-white backdrop-blur-md ring-1 ring-white/10">
              <span className="relative flex h-1.5 w-1.5">
                <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${statusMeta.dot}`} />
                <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${statusMeta.dot}`} />
              </span>
              {statusMeta.label}
            </span>
          </div>

          {/* Right content */}
          <div className="flex min-w-0 flex-1 flex-col justify-between p-4">
            {/* Title + counterpart + tier chip */}
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-display text-[17px] font-800 leading-tight text-[var(--color-foreground)]">
                    {collab.name}
                  </p>
                  <div className="mt-1 flex items-center gap-1.5 text-[12px] text-[var(--color-muted-foreground)]">
                    {collab.counterpart_avatar_url ? (
                      <Image
                        src={collab.counterpart_avatar_url}
                        alt=""
                        width={16}
                        height={16}
                        className="h-4 w-4 rounded-full object-cover ring-1 ring-[var(--color-border)]"
                        unoptimized
                      />
                    ) : (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-secondary)] text-[8px] font-700 text-[var(--color-foreground)]">
                        {collab.counterpart_name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="truncate">with {collab.counterpart_name}</span>
                  </div>
                </div>
                {tier && TierIcon && (
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9.5px] font-700 uppercase ${tier.bg} ${tier.color}`}>
                    <TierIcon className="h-2.5 w-2.5" />
                    {tier.label}
                  </span>
                )}
              </div>
            </div>

            {/* Progress + open hint */}
            <div className="mt-4">
              {progress !== null && (
                <>
                  <div className="mb-1 flex items-center justify-between font-mono text-[10px] text-[var(--color-muted-foreground)]">
                    <span>{collab.approved_count}/{collab.final_images_target} approved</span>
                    {creditsLeft !== null && (
                      <span>
                        <Zap className="mr-0.5 inline h-2.5 w-2.5 text-[var(--color-primary)]" />
                        {creditsLeft} credits left
                      </span>
                    )}
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-secondary)]">
                    <div
                      className={`h-full rounded-full transition-all ${tier?.bar ?? "bg-[var(--color-primary)]"}`}
                      style={{ width: `${Math.min(progress, 100)}%` }}
                    />
                  </div>
                </>
              )}
              <div className="mt-3 flex items-center gap-1 font-mono text-[10.5px] font-700 uppercase tracking-[0.14em] text-[var(--color-primary)]">
                <span>Open workspace</span>
                <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
              </div>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
