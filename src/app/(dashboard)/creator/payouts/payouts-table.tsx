"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Receipt,
} from "lucide-react";

type PayoutStatus = "requested" | "processing" | "success" | "failed" | "reversed";

interface PayoutItem {
  id: string;
  amount_paise?: number;
  gross_amount_paise?: number;
  tds_paise?: number;
  tds_amount_paise?: number;
  fee_paise?: number;
  processing_fee_paise?: number;
  net_paise?: number;
  net_amount_paise?: number;
  status: string;
  requested_at: string;
  completed_at: string | null;
  utr?: string | null;
  cf_transfer_id?: string | null;
  failure_reason: string | null;
}

interface ListResponse {
  items: PayoutItem[];
  total: number;
  page: number;
  pageSize: number;
}

function fmt(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(
    new Date(iso),
  );
}

function gross(p: PayoutItem): number {
  return p.gross_amount_paise ?? p.amount_paise ?? 0;
}
function tds(p: PayoutItem): number {
  return p.tds_amount_paise ?? p.tds_paise ?? 0;
}
function fee(p: PayoutItem): number {
  return p.processing_fee_paise ?? p.fee_paise ?? 2500;
}
function net(p: PayoutItem): number {
  return p.net_amount_paise ?? p.net_paise ?? gross(p) - tds(p) - fee(p);
}

const STATUS_CONFIG: Record<
  PayoutStatus,
  { label: string; bg: string; text: string; icon: React.ReactNode }
> = {
  requested: {
    label: "Requested",
    bg: "var(--color-neutral-100)",
    text: "var(--color-neutral-600)",
    icon: <Clock className="size-3.5" />,
  },
  processing: {
    label: "Processing",
    bg: "var(--color-lilac)",
    text: "var(--color-neutral-700)",
    icon: <Loader2 className="size-3.5 animate-spin" />,
  },
  success: {
    label: "Success",
    bg: "var(--color-mint)",
    text: "var(--color-neutral-700)",
    icon: <CheckCircle2 className="size-3.5 text-green-600" />,
  },
  failed: {
    label: "Failed",
    bg: "var(--color-blush)",
    text: "var(--color-neutral-700)",
    icon: <XCircle className="size-3.5 text-red-500" />,
  },
  reversed: {
    label: "Reversed",
    bg: "var(--color-blush)",
    text: "var(--color-neutral-700)",
    icon: <XCircle className="size-3.5 text-red-500" />,
  },
};

type FilterStatus = "all" | PayoutStatus;
const FILTERS: { value: FilterStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "processing", label: "Processing" },
  { value: "success", label: "Success" },
  { value: "failed", label: "Failed" },
];

export default function PayoutsTable({ initial }: { initial: ListResponse }) {
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse>(initial);
  const [isPending, startTransition] = useTransition();

  function fetchPage(nextPage: number, status: FilterStatus) {
    startTransition(async () => {
      const qs = new URLSearchParams({ page: String(nextPage) });
      if (status !== "all") qs.set("status", status);
      try {
        const res = await fetch(`/api/payouts/list?${qs.toString()}`);
        if (!res.ok) return;
        const json = (await res.json()) as ListResponse;
        setData(json);
        setPage(nextPage);
      } catch {
        // silent
      }
    });
  }

  function handleFilter(val: FilterStatus) {
    setFilter(val);
    fetchPage(1, val);
  }

  const totalPages = Math.ceil(data.total / data.pageSize) || 1;
  const items = data.items;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="max-w-4xl"
    >
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-on-surface)]">
          Payout history
        </h1>
        <p className="mt-1 text-sm text-[var(--color-outline)]">
          All your withdrawal requests and their current status.
        </p>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => handleFilter(f.value)}
            className={`px-3 py-1.5 rounded-[var(--radius-pill)] text-xs font-semibold transition-colors ${
              filter === f.value
                ? "bg-[var(--color-ink)] text-white"
                : "bg-[var(--color-neutral-100)] text-[var(--color-neutral-600)] hover:bg-[var(--color-neutral-200)]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Loading overlay */}
      {isPending && (
        <div className="flex justify-center py-8">
          <Loader2 className="size-6 animate-spin text-[var(--color-neutral-400)]" />
        </div>
      )}

      {/* Empty state */}
      {!isPending && items.length === 0 && (
        <div className="rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)] p-12 text-center">
          <Receipt className="size-10 mx-auto mb-3 text-[var(--color-neutral-300)]" />
          <p className="font-semibold text-[var(--color-ink)]">No payouts yet</p>
          <p className="text-sm text-[var(--color-neutral-500)] mt-1">
            Your withdrawal history will appear here.
          </p>
        </div>
      )}

      {/* Cards */}
      {!isPending && items.length > 0 && (
        <div className="space-y-3">
          {items.map((p, i) => {
            const statusKey = (p.status as PayoutStatus) in STATUS_CONFIG
              ? (p.status as PayoutStatus)
              : "requested";
            const cfg = STATUS_CONFIG[statusKey];
            const grossAmt = gross(p);
            const tdsAmt = tds(p);
            const feeAmt = fee(p);
            const netAmt = net(p);
            const utr = p.utr ?? p.cf_transfer_id;

            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.3 }}
                className="rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-white p-4 sm:p-5 shadow-[var(--shadow-soft)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  {/* Left: date + status */}
                  <div className="space-y-1.5">
                    <p className="text-xs text-[var(--color-neutral-500)]">
                      {fmtDate(p.requested_at)}
                    </p>
                    <span
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-pill)] text-xs font-semibold"
                      style={{ background: cfg.bg, color: cfg.text }}
                    >
                      {cfg.icon}
                      {cfg.label}
                    </span>
                  </div>

                  {/* Right: amounts */}
                  <div className="text-right space-y-0.5">
                    <p className="text-base font-bold text-[var(--color-ink)]">
                      {fmt(netAmt)}
                    </p>
                    <p className="text-xs text-[var(--color-neutral-500)]">
                      Gross {fmt(grossAmt)} · TDS -{fmt(tdsAmt)} · Fee -{fmt(feeAmt)}
                    </p>
                  </div>
                </div>

                {/* UTR */}
                {statusKey === "success" && utr && (
                  <div className="mt-3 pt-3 border-t border-[var(--color-neutral-100)]">
                    <p className="text-xs text-[var(--color-neutral-500)]">
                      UTR:{" "}
                      <span className="font-mono text-[var(--color-neutral-700)]">
                        {utr}
                      </span>
                    </p>
                    {p.completed_at && (
                      <p className="text-xs text-[var(--color-neutral-400)] mt-0.5">
                        Completed {fmtDate(p.completed_at)}
                      </p>
                    )}
                  </div>
                )}

                {/* Failure reason */}
                {(statusKey === "failed" || statusKey === "reversed") &&
                  p.failure_reason && (
                    <div className="mt-3 pt-3 border-t border-[var(--color-neutral-100)]">
                      <p className="text-xs text-red-500">{p.failure_reason}</p>
                    </div>
                  )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!isPending && totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 text-sm">
          <button
            onClick={() => fetchPage(page - 1, filter)}
            disabled={page <= 1}
            className="px-3 py-1.5 rounded-[var(--radius-button)] border border-[var(--color-neutral-200)] text-[var(--color-neutral-600)] hover:bg-[var(--color-neutral-100)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-[var(--color-neutral-500)]">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => fetchPage(page + 1, filter)}
            disabled={page >= totalPages}
            className="px-3 py-1.5 rounded-[var(--radius-button)] border border-[var(--color-neutral-200)] text-[var(--color-neutral-600)] hover:bg-[var(--color-neutral-100)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </motion.div>
  );
}
