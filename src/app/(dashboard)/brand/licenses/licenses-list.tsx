"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  FileText,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/* ── Types ── */

export interface LicenseItem {
  id: string;
  generation_id: string;
  brand_name: string | null;
  creator_name: string | null;
  scope: string | string[] | null;
  exclusive: boolean;
  issued_at: string;
  expires_at: string;
  status: "active" | "expired" | "revoked";
  auto_renew: boolean;
  cert_url: string | null;
}

interface LicensesListProps {
  initialItems: LicenseItem[];
  initialTotal: number;
  initialPage: number;
  pageSize: number;
}

/* ── Helpers ── */

const STATUS_FILTERS = [
  { label: "All", value: "" },
  { label: "Active", value: "active" },
  { label: "Expiring soon", value: "expiring_soon" },
  { label: "Expired", value: "expired" },
  { label: "Revoked", value: "revoked" },
] as const;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function daysUntilExpiry(expiresAt: string): number {
  const now = new Date().getTime();
  const exp = new Date(expiresAt).getTime();
  return Math.floor((exp - now) / (1000 * 60 * 60 * 24));
}

function expiryChipColor(days: number): string {
  if (days < 0) return "bg-[var(--color-blush)] text-red-700";
  if (days < 30) return "bg-[var(--color-blush)] text-red-700";
  if (days < 90) return "bg-yellow-100 text-yellow-700";
  return "bg-[var(--color-mint)] text-green-700";
}

function expiryLabel(days: number, expiresAt: string): string {
  if (days < 0) return "Expired";
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  if (days < 30) return `${days}d left`;
  return formatDate(expiresAt);
}

const statusPillColors: Record<string, string> = {
  active: "bg-[var(--color-mint)] text-green-700",
  expired: "bg-[var(--color-blush)] text-red-700",
  revoked: "bg-[var(--color-neutral-100)] text-[var(--color-neutral-600)]",
};

function getScopeArray(scope: string | string[] | null): string[] {
  if (!scope) return [];
  if (Array.isArray(scope)) return scope;
  try {
    const parsed = JSON.parse(scope);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // not JSON
  }
  return [scope];
}

/* ── Auto-renew toggle ── */

function AutoRenewToggle({
  licenseId,
  initialValue,
}: {
  licenseId: string;
  initialValue: boolean;
}) {
  const [enabled, setEnabled] = useState(initialValue);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    try {
      const res = await fetch(`/api/licenses/${licenseId}/auto-renew`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });
      if (res.ok) {
        const data = await res.json();
        setEnabled(data.auto_renew ?? !enabled);
      }
    } catch (err) {
      console.error("Auto-renew toggle failed:", err);
    }
    setLoading(false);
  }

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        toggle();
      }}
      disabled={loading}
      title={enabled ? "Auto-renew enabled" : "Auto-renew disabled"}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus-visible:outline focus-visible:ring-2 focus-visible:ring-[var(--color-accent-gold)] disabled:opacity-50 ${
        enabled ? "bg-[var(--color-accent-gold)]" : "bg-[var(--color-neutral-300)]"
      }`}
    >
      <span
        className={`inline-block size-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          enabled ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

/* ── Main Component ── */

export default function LicensesList({
  initialItems,
  initialTotal,
  initialPage,
  pageSize,
}: LicensesListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [items, setItems] = useState<LicenseItem[]>(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [loading, setLoading] = useState(false);

  const activeStatus = searchParams.get("status") ?? "";
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  /* ── Fetch ── */
  const fetchLicenses = useCallback(
    async (p: number, status: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(p), pageSize: String(pageSize) });
        if (status) params.set("status", status);
        const res = await fetch(`/api/licenses/list?${params}`);
        if (res.ok) {
          const data = await res.json();
          setItems(data.items ?? []);
          setTotal(data.total ?? 0);
          setPage(data.page ?? 1);
        }
      } catch (err) {
        console.error("Licenses fetch error:", err);
      }
      setLoading(false);
    },
    [pageSize]
  );

  /* ── Filter ── */
  function handleFilterChange(status: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", "1");
    if (status) params.set("status", status);
    else params.delete("status");
    router.push(`?${params.toString()}`);
    fetchLicenses(1, status);
  }

  /* ── Pagination ── */
  function handlePage(newPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(newPage));
    router.push(`?${params.toString()}`);
    fetchLicenses(newPage, activeStatus);
  }

  return (
    <div>
      {/* Filter pills row */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
        <div className="flex items-center gap-1.5 flex-wrap">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => handleFilterChange(f.value)}
              className={`rounded-[var(--radius-pill)] px-3.5 py-1.5 text-xs font-600 transition-all ${
                activeStatus === f.value
                  ? "bg-[var(--color-ink)] text-white shadow-sm"
                  : "bg-[var(--color-neutral-100)] text-[var(--color-neutral-600)] hover:bg-[var(--color-neutral-200)]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => fetchLicenses(page, activeStatus)}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-600 text-[var(--color-neutral-500)] hover:text-[var(--color-ink)] transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="size-6 animate-spin rounded-full border-2 border-[var(--color-neutral-200)] border-t-[var(--color-accent-gold)]" />
        </div>
      )}

      {/* Empty state */}
      {!loading && items.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-24 text-center"
        >
          <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-[var(--color-ocean)]">
            <FileText className="size-7 text-[var(--color-ink)]" />
          </div>
          <h3 className="text-lg font-700 text-[var(--color-ink)] mb-2">No licenses found</h3>
          <p className="text-sm text-[var(--color-neutral-500)] max-w-sm">
            {activeStatus
              ? "No licenses match the selected filter."
              : "Licenses appear here once a generation is approved."}
          </p>
        </motion.div>
      )}

      {/* List */}
      {!loading && items.length > 0 && (
        <div className="flex flex-col gap-3">
          <AnimatePresence mode="popLayout">
            {items.map((license, i) => {
              const days = daysUntilExpiry(license.expires_at);
              const scopeArr = getScopeArray(license.scope);

              return (
                <motion.div
                  key={license.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.2, delay: i * 0.04 }}
                >
                  <Link
                    href={`/brand/licenses/${license.id}`}
                    className="group flex flex-col gap-3 sm:flex-row sm:items-center rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-white p-4 sm:p-5 shadow-[var(--shadow-soft)] hover:shadow-[var(--shadow-card)] transition-shadow no-underline"
                  >
                    {/* Creator avatar + name */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-ocean)]">
                        <User className="size-4 text-[var(--color-ink)]" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-700 text-[var(--color-ink)] truncate">
                          {license.creator_name ?? "Unknown Creator"}
                        </p>
                        <p className="text-xs text-[var(--color-neutral-500)] font-mono">
                          {license.id.slice(0, 8)}…
                        </p>
                      </div>
                    </div>

                    {/* Scope chips */}
                    {scopeArr.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {scopeArr.map((s) => (
                          <span
                            key={s}
                            className="rounded-[var(--radius-pill)] bg-[var(--color-lilac)] px-2.5 py-0.5 text-[10px] font-600 text-[var(--color-ink)] capitalize"
                          >
                            {s}
                          </span>
                        ))}
                        {license.exclusive && (
                          <span className="rounded-[var(--radius-pill)] bg-[var(--color-accent-gold)] px-2.5 py-0.5 text-[10px] font-700 text-white">
                            Exclusive
                          </span>
                        )}
                      </div>
                    )}

                    {/* Dates */}
                    <div className="flex items-center gap-3 text-xs text-[var(--color-neutral-500)] shrink-0">
                      <div>
                        <p className="font-600 text-[var(--color-neutral-400)]">Issued</p>
                        <p>{formatDate(license.issued_at)}</p>
                      </div>
                      <div>
                        <p className="font-600 text-[var(--color-neutral-400)]">Expires</p>
                        <span className={`inline-flex rounded-[var(--radius-pill)] px-2 py-0.5 text-[10px] font-700 ${expiryChipColor(days)}`}>
                          {expiryLabel(days, license.expires_at)}
                        </span>
                      </div>
                    </div>

                    {/* Status + Auto-renew */}
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`rounded-[var(--radius-pill)] px-2.5 py-0.5 text-xs font-600 capitalize ${statusPillColors[license.status] ?? "bg-[var(--color-neutral-100)] text-[var(--color-ink)]"}`}>
                        {license.status}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-600 text-[var(--color-neutral-400)]">Auto-renew</span>
                        <AutoRenewToggle licenseId={license.id} initialValue={license.auto_renew} />
                      </div>
                      <ExternalLink className="size-3.5 text-[var(--color-neutral-300)] group-hover:text-[var(--color-accent-gold)] transition-colors" />
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => handlePage(page - 1)}
            className="rounded-[var(--radius-button)] border-[var(--color-neutral-200)] font-600 text-[var(--color-ink)] disabled:opacity-40"
          >
            <ChevronLeft className="size-4" />
            Previous
          </Button>
          <span className="text-sm font-600 text-[var(--color-neutral-500)]">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => handlePage(page + 1)}
            className="rounded-[var(--radius-button)] border-[var(--color-neutral-200)] font-600 text-[var(--color-ink)] disabled:opacity-40"
          >
            Next
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
