"use client";

import { useEffect, useState } from "react";
import {
  useCachedFetch,
  invalidateCache,
} from "@/lib/hooks/use-cached-fetch";
import { motion, AnimatePresence } from "framer-motion";
import {
  Inbox,
  Clock,
  CheckCircle2,
  XCircle,
  Package,
  Loader2,
  Image as ImageIcon,
  Zap,
  Globe,
  ArrowRight,
  IndianRupee,
  FileImage,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";

interface CollabRequest {
  id: string;
  status: "pending" | "accepted" | "declined" | "paid" | "expired" | "cancelled";
  package_tier: "frame" | "feature" | "cover";
  package_price_paise: number;
  final_images: number;
  product_name: string;
  product_image_url: string;
  brief_one_liner: string;
  expires_at: string;
  created_at: string;
  brand_display_name?: string;
}

const TIER_META = {
  frame: {
    label: "Frame",
    badge: "Social Organic · 90 days",
    icon: ImageIcon,
    color: "text-sky-500",
    bg: "bg-sky-500/10",
    border: "border-sky-500/20",
    bar: "bg-sky-500",
  },
  feature: {
    label: "Feature",
    badge: "Social Paid · 6 months",
    icon: Zap,
    color: "text-[var(--color-primary)]",
    bg: "bg-[var(--color-primary)]/10",
    border: "border-[var(--color-primary)]/20",
    bar: "bg-[var(--color-primary)]",
  },
  cover: {
    label: "Cover",
    badge: "Digital Full · 12 months",
    icon: Globe,
    color: "text-violet-500",
    bg: "bg-violet-500/10",
    border: "border-violet-500/20",
    bar: "bg-violet-500",
  },
} as const;

const STATUS_META = {
  pending:   { label: "Pending",   color: "text-amber-600",  bg: "bg-amber-500/10",   icon: Clock },
  accepted:  { label: "Accepted",  color: "text-emerald-600", bg: "bg-emerald-500/10", icon: CheckCircle2 },
  declined:  { label: "Declined",  color: "text-red-500",     bg: "bg-red-500/10",     icon: XCircle },
  paid:      { label: "Active",    color: "text-emerald-600", bg: "bg-emerald-500/10", icon: CheckCircle2 },
  expired:   { label: "Expired",   color: "text-[var(--color-muted-foreground)]", bg: "bg-[var(--color-secondary)]", icon: Clock },
  cancelled: { label: "Cancelled", color: "text-[var(--color-muted-foreground)]", bg: "bg-[var(--color-secondary)]", icon: XCircle },
} as const;

function fmt(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function timeLeft(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(diff / 60_000))}m left`;
  if (h < 24) return `${h}h left`;
  return `${Math.floor(h / 24)}d left`;
}

export default function CreatorRequestsPage() {
  // Tab-back paints from the module cache instantly.
  const { data, loading: rawLoading } = useCachedFetch<{
    requests?: CollabRequest[];
  }>("/api/creator/requests");

  const requests: CollabRequest[] = data?.requests ?? [];
  const loading = rawLoading && !data;
  const [acting, setActing] = useState<string | null>(null);

  // Helper: optimistic local patch via cache invalidation. After every
  // accept/decline we invalidate the cache so the next render re-fetches
  // fresh status — and any other page subscribed to this URL (eg the
  // dashboard nudge counter) also stays in sync.
  function invalidateRequestsAndCounters() {
    invalidateCache("/api/creator/requests");
    invalidateCache("/api/dashboard/stats");
  }

  async function handleAccept(id: string) {
    setActing(id);
    try {
      const res = await fetch(`/api/collab-requests/${id}/accept`, { method: "POST" });
      if (res.ok) invalidateRequestsAndCounters();
    } finally { setActing(null); }
  }

  async function handleDecline(id: string) {
    const reason = window.prompt("Reason for declining (optional):") ?? "";
    setActing(id);
    try {
      const res = await fetch(`/api/collab-requests/${id}/decline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (res.ok) invalidateRequestsAndCounters();
    } finally { setActing(null); }
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[860px] px-4 py-8 space-y-3 lg:px-8">
        <div className="h-8 w-40 animate-pulse rounded-xl bg-[var(--color-secondary)]" />
        {[1, 2].map((i) => (
          <div key={i} className="h-[160px] animate-pulse rounded-2xl bg-[var(--color-secondary)]" />
        ))}
      </div>
    );
  }

  const pending = requests.filter((r) => r.status === "pending");
  const past    = requests.filter((r) => r.status !== "pending");

  return (
    <div className="mx-auto w-full max-w-[860px] px-4 py-6 lg:px-8 lg:py-8">

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mb-7"
      >
        <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
          <Inbox className="mr-1.5 inline h-3 w-3 text-[var(--color-primary)]" />
          Collab Requests
        </p>
        <h1 className="mt-1 font-display text-[30px] font-800 leading-none tracking-tight text-[var(--color-foreground)]">
          Requests
        </h1>
        <p className="mt-1.5 text-[13px] text-[var(--color-muted-foreground)]">
          Accept to unlock the collab. Brand pays only after you accept — you&apos;re never obligated.
        </p>
      </motion.div>

      {/* Empty state */}
      {requests.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] p-14 text-center">
          <Package className="mx-auto mb-3 h-10 w-10 text-[var(--color-muted-foreground)]" />
          <p className="font-display text-[16px] font-700 text-[var(--color-foreground)]">No requests yet</p>
          <p className="mt-1 text-[13px] text-[var(--color-muted-foreground)]">
            Make sure you have an active package and are{" "}
            <Link href="/creator/packages" className="text-[var(--color-primary)] underline">set as Live</Link>.
          </p>
        </div>
      )}

      {/* Pending section */}
      {pending.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <span className="font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">Pending</span>
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-500 px-1.5 font-mono text-[10px] font-700 text-white">
              {pending.length}
            </span>
          </div>
          <div className="space-y-3">
            <AnimatePresence>
              {pending.map((req, i) => (
                <RequestCard
                  key={req.id}
                  req={req}
                  delay={i * 0.06}
                  onAccept={handleAccept}
                  onDecline={handleDecline}
                  acting={acting === req.id}
                />
              ))}
            </AnimatePresence>
          </div>
        </section>
      )}

      {/* Past section */}
      {past.length > 0 && (
        <section>
          <p className="mb-3 font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
            Past requests
          </p>
          <div className="space-y-3">
            {past.map((req, i) => (
              <RequestCard
                key={req.id}
                req={req}
                delay={i * 0.04}
                onAccept={handleAccept}
                onDecline={handleDecline}
                acting={acting === req.id}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function RequestCard({
  req,
  delay,
  onAccept,
  onDecline,
  acting,
}: {
  req: CollabRequest;
  delay: number;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  acting: boolean;
}) {
  const tier     = TIER_META[req.package_tier];
  const status   = STATUS_META[req.status];
  const TierIcon = tier.icon;
  const StatusIcon = status.icon;
  const isPending = req.status === "pending";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.38, delay, ease: [0.22, 1, 0.36, 1] }}
      className={`overflow-hidden rounded-2xl border bg-[var(--color-card)] transition-colors ${
        isPending
          ? `border-[var(--color-border)] hover:border-[var(--color-primary)]/30`
          : "border-[var(--color-border)] opacity-75"
      }`}
    >
      {/* Tier colour bar at top */}
      <div className={`h-0.5 w-full ${tier.bar}`} />

      <div className="flex gap-0">
        {/* Product image — square left column */}
        <div className="relative w-[120px] shrink-0 sm:w-[140px]">
          {req.product_image_url ? (
            <Image
              src={req.product_image_url}
              alt={req.product_name}
              fill
              sizes="140px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[var(--color-secondary)]">
              <FileImage className="h-8 w-8 text-[var(--color-muted-foreground)]" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex min-w-0 flex-1 flex-col gap-0 p-4">

          {/* Top row: product name + status */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-display text-[16px] font-800 text-[var(--color-foreground)]">
                {req.product_name}
              </p>
              <p className="mt-0.5 truncate text-[12px] text-[var(--color-muted-foreground)]">
                {req.brand_display_name ?? "A brand"}
              </p>
            </div>
            <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-700 ${status.bg} ${status.color}`}>
              <StatusIcon className="h-3 w-3" />
              {status.label}
            </span>
          </div>

          {/* Package chips */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-700 ${tier.bg} ${tier.color}`}>
              <TierIcon className="h-3 w-3" />
              {tier.label}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-secondary)] px-2.5 py-0.5 text-[11px] font-600 text-[var(--color-muted-foreground)]">
              <IndianRupee className="h-3 w-3" />
              {fmt(req.package_price_paise)}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-secondary)] px-2.5 py-0.5 text-[11px] font-600 text-[var(--color-muted-foreground)]">
              <FileImage className="h-3 w-3" />
              {req.final_images} images
            </span>
            <span className="font-mono text-[10px] text-[var(--color-muted-foreground)]">
              {tier.badge}
            </span>
          </div>

          {/* Brief */}
          <p className="mt-2.5 line-clamp-2 rounded-lg bg-[var(--color-secondary)] px-3 py-2 text-[12px] text-[var(--color-muted-foreground)]">
            &ldquo;{req.brief_one_liner}&rdquo;
          </p>

          {/* Footer: timer + actions */}
          {isPending ? (
            <div className="mt-3 flex items-center gap-2">
              <span className="mr-auto flex items-center gap-1 font-mono text-[11px] font-600 text-amber-600">
                <Clock className="h-3 w-3" />
                {timeLeft(req.expires_at)}
              </span>
              <button
                onClick={() => onDecline(req.id)}
                disabled={acting}
                className="rounded-xl border border-[var(--color-border)] px-4 py-2 text-[12px] font-700 text-[var(--color-muted-foreground)] transition hover:border-red-400/60 hover:bg-red-500/5 hover:text-red-500 disabled:opacity-50"
              >
                Decline
              </button>
              <button
                onClick={() => onAccept(req.id)}
                disabled={acting}
                className="flex items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-5 py-2 text-[12px] font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.4)] transition active:scale-[0.98] disabled:opacity-50"
              >
                {acting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>Accept <ArrowRight className="h-3.5 w-3.5" /></>
                )}
              </button>
            </div>
          ) : req.status === "accepted" ? (
            <p className="mt-3 text-[12px] text-emerald-600">
              Accepted — waiting for brand payment. Chat unlocks once paid.
            </p>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}
