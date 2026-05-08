"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowRight,
  IndianRupee,
  Image as ImageIcon,
  FileImage,
  Plus,
  Zap,
  Globe,
} from "lucide-react";
import Image from "next/image";

interface BrandRequest {
  id: string;
  status: "pending" | "accepted" | "declined" | "paid" | "expired" | "cancelled";
  package_tier: "frame" | "feature" | "cover";
  package_price_paise: number;
  final_images: number;
  product_name: string;
  product_image_url: string;
  brief_one_liner: string;
  creator_name: string;
  expires_at: string;
  decided_at: string | null;
  paid_at: string | null;
  collab_session_id: string | null;
  created_at: string;
}

const TIER_META = {
  frame:   { label: "Frame",   icon: ImageIcon, color: "text-sky-500",                bg: "bg-sky-500/10",                bar: "bg-sky-500" },
  feature: { label: "Feature", icon: Zap,       color: "text-[var(--color-primary)]", bg: "bg-[var(--color-primary)]/10", bar: "bg-[var(--color-primary)]" },
  cover:   { label: "Cover",   icon: Globe,     color: "text-violet-500",             bg: "bg-violet-500/10",             bar: "bg-violet-500" },
} as const;

const STATUS_META = {
  pending:   { label: "Pending",       color: "text-amber-600",                            bg: "bg-amber-500/10",   icon: Clock },
  accepted:  { label: "Accepted",      color: "text-emerald-600",                          bg: "bg-emerald-500/10", icon: CheckCircle2 },
  declined:  { label: "Declined",      color: "text-red-500",                              bg: "bg-red-500/10",     icon: XCircle },
  paid:      { label: "Paid · Active", color: "text-[var(--color-primary)]",               bg: "bg-[var(--color-primary)]/10", icon: CheckCircle2 },
  expired:   { label: "Expired",       color: "text-[var(--color-muted-foreground)]",      bg: "bg-[var(--color-secondary)]", icon: Clock },
  cancelled: { label: "Cancelled",     color: "text-[var(--color-muted-foreground)]",      bg: "bg-[var(--color-secondary)]", icon: XCircle },
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

export default function BrandRequestsPage() {
  const [requests, setRequests] = useState<BrandRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/brand/requests", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        setRequests(d.requests ?? []);
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[860px] space-y-3 px-4 py-8 lg:px-8">
        <div className="h-8 w-40 animate-pulse rounded-xl bg-[var(--color-secondary)]" />
        {[1, 2].map((i) => (
          <div key={i} className="h-[160px] animate-pulse rounded-2xl bg-[var(--color-secondary)]" />
        ))}
      </div>
    );
  }

  const needsAction  = requests.filter((r) => r.status === "accepted");
  const inFlight     = requests.filter((r) => r.status === "pending");
  const active       = requests.filter((r) => r.status === "paid");
  const past         = requests.filter((r) => ["declined", "expired", "cancelled"].includes(r.status));

  return (
    <div className="mx-auto w-full max-w-[860px] px-4 py-6 lg:px-8 lg:py-8">

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mb-7 flex items-start justify-between gap-4"
      >
        <div>
          <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
            <Send className="mr-1.5 inline h-3 w-3 text-[var(--color-primary)]" />
            Collab Requests
          </p>
          <h1 className="mt-1 font-display text-[30px] font-800 leading-none tracking-tight text-[var(--color-foreground)]">
            Requests
          </h1>
          <p className="mt-1.5 text-[13px] text-[var(--color-muted-foreground)]">
            Requests you&apos;ve sent to creators. Pay only after they accept.
          </p>
        </div>
        <Link
          href="/brand/discover"
          className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-[13px] font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.4)]"
        >
          <Plus className="h-3.5 w-3.5" />
          New request
        </Link>
      </motion.div>

      {error && (
        <p className="mb-4 rounded-xl border border-red-500/20 bg-red-500/8 px-4 py-2.5 text-[13px] text-red-500">
          {error}
        </p>
      )}

      {/* Empty */}
      {requests.length === 0 && !error && (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] p-14 text-center">
          <Send className="mx-auto mb-3 h-10 w-10 text-[var(--color-muted-foreground)]" />
          <p className="font-display text-[16px] font-700 text-[var(--color-foreground)]">No requests sent yet</p>
          <p className="mt-1 text-[13px] text-[var(--color-muted-foreground)]">
            Discover a creator, choose a package, and send your first request.
          </p>
          <Link
            href="/brand/discover"
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-5 py-2.5 text-[13px] font-700 text-[var(--color-primary-foreground)]"
          >
            Discover creators <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      {/* ── Pay now — accepted by creator ── */}
      {needsAction.length > 0 && (
        <Section label="Pay now to activate" count={needsAction.length} highlight>
          <AnimatePresence>
            {needsAction.map((r, i) => (
              <RequestCard key={r.id} req={r} delay={i * 0.06} />
            ))}
          </AnimatePresence>
        </Section>
      )}

      {/* ── Waiting for creator ── */}
      {inFlight.length > 0 && (
        <Section label="Waiting for creator" count={inFlight.length}>
          {inFlight.map((r, i) => <RequestCard key={r.id} req={r} delay={i * 0.05} />)}
        </Section>
      )}

      {/* ── Active collabs ── */}
      {active.length > 0 && (
        <Section label="Active collabs" count={active.length}>
          {active.map((r, i) => <RequestCard key={r.id} req={r} delay={i * 0.04} />)}
        </Section>
      )}

      {/* ── Past ── */}
      {past.length > 0 && (
        <Section label="Past requests">
          {past.map((r, i) => <RequestCard key={r.id} req={r} delay={i * 0.03} />)}
        </Section>
      )}
    </div>
  );
}

function Section({ label, count, highlight, children }: {
  label: string;
  count?: number;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center gap-2">
        <span className="font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
          {label}
        </span>
        {count != null && (
          <span className={`flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 font-mono text-[10px] font-700 ${
            highlight ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]" : "bg-[var(--color-secondary)] text-[var(--color-foreground)]"
          }`}>
            {count}
          </span>
        )}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function RequestCard({ req, delay }: { req: BrandRequest; delay: number }) {
  const tier     = TIER_META[req.package_tier] ?? TIER_META.frame;
  const status   = STATUS_META[req.status] ?? STATUS_META.pending;
  const TierIcon = tier.icon;
  const StatusIcon = status.icon;
  const isAccepted = req.status === "accepted";
  const isPending  = req.status === "pending";
  const isPaid     = req.status === "paid";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, delay, ease: [0.22, 1, 0.36, 1] }}
      className={`overflow-hidden rounded-2xl border bg-[var(--color-card)] ${
        isAccepted
          ? "border-[var(--color-primary)]/40"
          : "border-[var(--color-border)]"
      } ${!isAccepted && !isPending && !isPaid ? "opacity-70" : ""}`}
    >
      {/* Tier colour bar */}
      <div className={`h-0.5 w-full ${tier.bar}`} />

      <div className="flex gap-0">
        {/* Product image */}
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
            <div className="flex h-full w-full min-h-[140px] items-center justify-center bg-[var(--color-secondary)]">
              <FileImage className="h-8 w-8 text-[var(--color-muted-foreground)]" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex min-w-0 flex-1 flex-col p-4">
          {/* Top */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-display text-[16px] font-800 text-[var(--color-foreground)]">
                {req.product_name}
              </p>
              <p className="mt-0.5 text-[12px] text-[var(--color-muted-foreground)]">
                with {req.creator_name}
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
          </div>

          {/* Brief */}
          <p className="mt-2.5 line-clamp-1 rounded-lg bg-[var(--color-secondary)] px-3 py-1.5 text-[12px] text-[var(--color-muted-foreground)]">
            &ldquo;{req.brief_one_liner}&rdquo;
          </p>

          {/* Footer */}
          <div className="mt-3 flex items-center gap-3">
            {isAccepted && (
              <>
                <p className="text-[11px] font-600 text-emerald-600">
                  Creator accepted — collab unlocks after payment
                </p>
                <Link
                  href={`/brand/collabs/${req.id}/payment`}
                  className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-5 py-2 text-[13px] font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.5)] transition-all hover:-translate-y-0.5"
                >
                  Pay {fmt(req.package_price_paise)} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </>
            )}
            {isPending && (
              <span className="flex items-center gap-1 text-[11px] font-600 text-amber-600">
                <Clock className="h-3 w-3" />
                {timeLeft(req.expires_at)} to respond
              </span>
            )}
            {isPaid && req.collab_session_id && (
              <Link
                href={`/brand/collabs/${req.collab_session_id}`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-primary)]/40 px-4 py-1.5 text-[12px] font-700 text-[var(--color-primary)] transition hover:bg-[var(--color-primary)]/5"
              >
                Open Studio <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
