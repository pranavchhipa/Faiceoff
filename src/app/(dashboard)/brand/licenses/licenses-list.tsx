"use client";

/**
 * Brand licenses list — full revamp.
 *
 * Replaces the legacy SSR-then-client setup that produced an "0 licenses"
 * header (server fetch failed without auth cookies) plus "Unknown Creator"
 * rows (field-name mismatch with the API). This single client component
 * owns header + filter + list + pagination state.
 *
 * Surface design follows the same language as /brand/collabs:
 *   - canonical color tokens (no --color-neutral-*, no --color-ink)
 *   - rounded-2xl cards on bg-[var(--color-card)]
 *   - product/generation image as the row anchor (96px square thumb)
 *   - status pill = dark backdrop + animated colored dot (readable on any bg)
 *   - exclusive licenses get a gold ribbon
 */

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useCachedFetch } from "@/lib/hooks/use-cached-fetch";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  FileSignature,
  ImageIcon,
  Download,
  AlertTriangle,
  Zap,
  CheckCircle2,
  ShieldOff,
} from "lucide-react";

/* ────────────────────────────────────────────────────────────────────────── */
/* Types                                                                     */
/* ────────────────────────────────────────────────────────────────────────── */

interface LicenseItem {
  id: string;
  generation_id: string;
  creator_display_name: string;
  creator_avatar_url: string | null;
  brand_company_name: string;
  generation_image_url: string | null;
  scope: "digital" | "digital_print" | "digital_print_packaging";
  is_category_exclusive: boolean;
  exclusive_category: string | null;
  amount_paid_paise: number;
  issued_at: string;
  expires_at: string;
  status: "active" | "expired" | "revoked";
  auto_renew: boolean;
  cert_url: string | null;
  days_to_expiry: number;
}

interface ListResponse {
  items: LicenseItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Constants                                                                 */
/* ────────────────────────────────────────────────────────────────────────── */

const PAGE_SIZE = 20;

const FILTERS = [
  { label: "All",            value: "" },
  { label: "Active",         value: "active" },
  { label: "Expiring soon",  value: "expiring_soon" },
  { label: "Expired",        value: "expired" },
  { label: "Revoked",        value: "revoked" },
] as const;

const SCOPE_LABEL: Record<LicenseItem["scope"], string> = {
  digital: "Digital",
  digital_print: "Digital + Print",
  digital_print_packaging: "Digital + Print + Packaging",
};

const STATUS_META: Record<
  LicenseItem["status"],
  { label: string; dot: string; icon: React.ComponentType<{ className?: string }> }
> = {
  active:  { label: "Active",  dot: "bg-emerald-400",                icon: Zap },
  expired: { label: "Expired", dot: "bg-rose-400",                   icon: AlertTriangle },
  revoked: { label: "Revoked", dot: "bg-[var(--color-muted-foreground)]", icon: ShieldOff },
};

/* ────────────────────────────────────────────────────────────────────────── */
/* Utilities                                                                 */
/* ────────────────────────────────────────────────────────────────────────── */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function expiryChipClasses(days: number): string {
  if (days < 0)  return "bg-rose-500/15 text-rose-300 ring-rose-500/25";
  if (days < 30) return "bg-amber-500/15 text-amber-300 ring-amber-500/30";
  if (days < 90) return "bg-amber-500/10 text-amber-200 ring-amber-500/20";
  return "bg-emerald-500/15 text-emerald-300 ring-emerald-500/25";
}

function expiryLabel(days: number, expiresAt: string): string {
  if (days < 0) return "Expired";
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  if (days < 30) return `${days}d left`;
  return formatDate(expiresAt);
}


/* ────────────────────────────────────────────────────────────────────────── */
/* Card                                                                      */
/* ────────────────────────────────────────────────────────────────────────── */

function LicenseCard({ license, delay }: { license: LicenseItem; delay: number }) {
  const status = STATUS_META[license.status];
  const isRevoked = license.status === "revoked";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.25, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link
        href={`/brand/licenses/${license.id}`}
        className="group block overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] transition-all hover:-translate-y-0.5 hover:border-[var(--color-primary)]/40 hover:shadow-[0_12px_32px_-12px_rgba(201,169,110,0.25)]"
      >
        {/* Exclusive ribbon */}
        {license.is_category_exclusive && (
          <div className="flex items-center gap-1.5 bg-[var(--color-primary)] px-4 py-1.5 text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-primary-foreground)]">
            <FileSignature className="h-3 w-3" />
            Category exclusive
            {license.exclusive_category && (
              <span className="opacity-80">· {license.exclusive_category}</span>
            )}
          </div>
        )}

        <div className="flex flex-col gap-0 sm:flex-row">
          {/* Generated image (left, square) */}
          <div className="relative aspect-square w-full shrink-0 overflow-hidden bg-[var(--color-secondary)] sm:w-[120px]">
            {license.generation_image_url ? (
              <Image
                src={license.generation_image_url}
                alt={license.creator_display_name}
                fill
                sizes="(max-width: 640px) 100vw, 120px"
                className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                unoptimized
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <ImageIcon className="h-8 w-8 text-[var(--color-muted-foreground)]" />
              </div>
            )}
            {/* Status pill on image — dark backdrop pattern from /brand/collabs */}
            <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[9px] font-700 uppercase text-white backdrop-blur-md ring-1 ring-white/10">
              <span className="relative flex h-1.5 w-1.5">
                {!isRevoked && (
                  <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${status.dot}`} />
                )}
                <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${status.dot}`} />
              </span>
              {status.label}
            </span>
          </div>

          {/* Right content */}
          <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:p-5">
            {/* Top row: creator + license id + scope chip */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                {license.creator_avatar_url ? (
                  <Image
                    src={license.creator_avatar_url}
                    alt={license.creator_display_name}
                    width={32}
                    height={32}
                    className="h-8 w-8 rounded-full object-cover ring-1 ring-[var(--color-border)]"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-secondary)] font-display text-[12px] font-800 text-[var(--color-foreground)] ring-1 ring-[var(--color-border)]">
                    {(license.creator_display_name ?? "?").charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate font-display text-[15px] font-800 leading-tight text-[var(--color-foreground)]">
                    {license.creator_display_name}
                  </p>
                  <p className="font-mono text-[10px] text-[var(--color-muted-foreground)]">
                    LIC · {license.id.slice(0, 8)}
                  </p>
                </div>
              </div>

              {/* Scope chip — canonical token */}
              <span className="shrink-0 rounded-full bg-[var(--color-secondary)] px-2.5 py-1 text-[10px] font-700 uppercase tracking-wider text-[var(--color-foreground)] ring-1 ring-[var(--color-border)]">
                {SCOPE_LABEL[license.scope]}
              </span>
            </div>

            {/* Bottom row: dates + actions */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--color-border)] pt-3">
              <div className="flex flex-col">
                <span className="font-mono text-[9px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                  Issued
                </span>
                <span className="text-[12px] font-600 text-[var(--color-foreground)]">
                  {formatDate(license.issued_at)}
                </span>
              </div>

              <div className="flex flex-col">
                <span className="font-mono text-[9px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                  Expires
                </span>
                <span
                  className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11px] font-700 ring-1 ${expiryChipClasses(
                    license.days_to_expiry,
                  )}`}
                >
                  {expiryLabel(license.days_to_expiry, license.expires_at)}
                </span>
              </div>

              <div className="ml-auto flex items-center gap-3">

                {/* Cert PDF */}
                {license.cert_url && (
                  <a
                    href={license.cert_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-secondary)] px-2.5 py-1 text-[11px] font-600 text-[var(--color-foreground)] transition-colors hover:border-[var(--color-primary)]/60"
                    title="Download license certificate"
                  >
                    <Download className="h-3 w-3" />
                    Cert
                  </a>
                )}

                <ExternalLink className="h-4 w-4 text-[var(--color-muted-foreground)] transition-colors group-hover:text-[var(--color-primary)]" />
              </div>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Main                                                                       */
/* ────────────────────────────────────────────────────────────────────────── */

export default function LicensesList() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [page, setPage] = useState(() =>
    Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1),
  );
  const [activeFilter, setActiveFilter] = useState<string>(
    searchParams.get("status") ?? "",
  );

  // Build the API URL from current page+filter. Cache key follows naturally,
  // so re-mounting with the same filter+page paints from cache instantly.
  const isClientFilter = activeFilter === "expiring_soon";
  const apiStatus = isClientFilter ? "active" : activeFilter;
  const qs = new URLSearchParams({
    page: String(page),
    pageSize: String(PAGE_SIZE),
  });
  if (apiStatus) qs.set("status", apiStatus);
  const url = `/api/licenses/list?${qs.toString()}`;

  const { data, loading: rawLoading, error: fetchError, refresh } =
    useCachedFetch<ListResponse>(url);

  const items: LicenseItem[] = (() => {
    if (!data) return [];
    if (isClientFilter)
      return data.items.filter(
        (it) => it.days_to_expiry >= 0 && it.days_to_expiry < 30,
      );
    return data.items;
  })();
  const total = isClientFilter ? items.length : data?.total ?? 0;
  const loading = rawLoading && !data;
  const error = fetchError ? "Couldn't load your licenses. Try refresh." : null;

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / PAGE_SIZE)),
    [total],
  );

  function changeFilter(filter: string) {
    setActiveFilter(filter);
    setPage(1);
    const next = new URLSearchParams(searchParams.toString());
    next.set("page", "1");
    if (filter) next.set("status", filter);
    else next.delete("status");
    router.replace(`?${next.toString()}`);
  }

  function goPage(p: number) {
    setPage(p);
    const next = new URLSearchParams(searchParams.toString());
    next.set("page", String(p));
    router.replace(`?${next.toString()}`);
  }


  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 pt-4 pb-10 lg:px-8 lg:pt-5 lg:pb-12">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
          Library
        </p>
        <h1 className="mt-2 font-display text-[32px] font-800 leading-[1.05] tracking-tight text-[var(--color-foreground)] lg:text-[44px]">
          Your licenses
        </h1>
        <p className="mt-1.5 text-[14px] text-[var(--color-muted-foreground)]">
          {loading && total === 0
            ? "Loading…"
            : total === 0
              ? "Approved generations land here as 12-month licenses you can use commercially."
              : `${total.toLocaleString("en-IN")} ${
                  total === 1 ? "license" : "licenses"
                } · 12-month terms.`}
        </p>
      </motion.header>

      {/* ── Filter strip + refresh ───────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => {
            const isActive = activeFilter === f.value;
            return (
              <button
                key={f.value || "all"}
                type="button"
                onClick={() => changeFilter(f.value)}
                className={`rounded-full px-3.5 py-1.5 text-[12px] font-700 transition-all ${
                  isActive
                    ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                    : "bg-[var(--color-secondary)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => refresh()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1.5 text-[12px] font-600 text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)] disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* ── States ───────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-[13px] font-600 text-rose-300">
          {error}
        </div>
      )}

      {loading && items.length === 0 && (
        <SkeletonList />
      )}

      {!loading && items.length === 0 && !error && (
        <EmptyState filter={activeFilter} />
      )}

      {/* ── List ─────────────────────────────────────────────────────── */}
      {items.length > 0 && (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {items.map((license, i) => (
              <LicenseCard
                key={license.id}
                license={license}
                delay={i * 0.04}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* ── Pagination ───────────────────────────────────────────────── */}
      {totalPages > 1 && items.length > 0 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => goPage(page - 1)}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-[12px] font-600 text-[var(--color-foreground)] transition-colors hover:border-[var(--color-primary)]/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Previous
          </button>
          <span className="font-mono text-[11px] text-[var(--color-muted-foreground)]">
            Page <span className="font-700 text-[var(--color-foreground)]">{page}</span> of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => goPage(page + 1)}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-[12px] font-600 text-[var(--color-foreground)] transition-colors hover:border-[var(--color-primary)]/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Empty state                                                                */
/* ────────────────────────────────────────────────────────────────────────── */

function EmptyState({ filter }: { filter: string }) {
  const filtered = filter && filter !== "";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] px-6 py-16 text-center"
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
        {filter === "revoked" ? (
          <ShieldOff className="h-6 w-6" />
        ) : filter === "expired" ? (
          <AlertTriangle className="h-6 w-6" />
        ) : filter === "active" || filter === "expiring_soon" ? (
          <CheckCircle2 className="h-6 w-6" />
        ) : (
          <FileSignature className="h-6 w-6" />
        )}
      </div>
      <p className="font-display text-[18px] font-800 text-[var(--color-foreground)]">
        {filtered ? "Nothing in this bucket" : "No licenses yet"}
      </p>
      <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-[var(--color-muted-foreground)]">
        {filtered
          ? "No licenses match the selected filter. Try another bucket or clear the filter."
          : "Every approved generation issues a 12-month license automatically. Approve a generation to see your first one here."}
      </p>
      {!filtered && (
        <Link
          href="/brand/collabs"
          className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-[13px] font-700 text-[var(--color-primary-foreground)] transition-transform hover:-translate-y-0.5"
        >
          Open collabs
        </Link>
      )}
    </motion.div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Loading skeleton                                                           */
/* ────────────────────────────────────────────────────────────────────────── */

function SkeletonList() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="flex animate-pulse gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4"
        >
          <div className="h-[120px] w-[120px] shrink-0 rounded-xl bg-[var(--color-secondary)]" />
          <div className="flex flex-1 flex-col gap-3 py-1">
            <div className="h-4 w-1/3 rounded bg-[var(--color-secondary)]" />
            <div className="h-3 w-1/4 rounded bg-[var(--color-secondary)]" />
            <div className="mt-auto flex gap-3">
              <div className="h-6 w-20 rounded-full bg-[var(--color-secondary)]" />
              <div className="h-6 w-24 rounded-full bg-[var(--color-secondary)]" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
