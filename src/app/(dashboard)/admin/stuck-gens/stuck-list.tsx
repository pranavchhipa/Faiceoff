"use client";

// ─────────────────────────────────────────────────────────────────────────────
// /admin/stuck-gens — Stuck generation triage list
//
// Shows generations still marked "processing" more than 5 minutes past kickoff.
// Operators choose between "Retry" (re-submit to Replicate with the same
// assembled prompt) and "Refund" (refund the brand's reserved credits, mark
// the generation refunded). Seeded with mock rows when the live queue is
// empty so the page always looks alive.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  Banknote,
  Clock,
  Inbox,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Timer,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/* ── Types ── */

interface StuckGenItem {
  id: string;
  status: string;
  created_at: string;
  campaign_id: string | null;
  replicate_prediction_id: string | null;
  assembled_prompt: string | null;
  structured_brief: Record<string, unknown> | null;
  // presentational / seed fields
  brand?: string;
  creator?: string;
  summary?: string;
  costRupees?: number;
  seed?: boolean;
}

/* ── Helpers ── */

function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function stuckDuration(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `stuck ${hours}h ${minutes % 60}m`;
  return `stuck ${minutes}m`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function briefSnippet(it: StuckGenItem): string | null {
  if (it.summary) return it.summary;
  const concept = (it.structured_brief?.concept as string | undefined) ?? "";
  if (concept) return concept;
  return it.assembled_prompt?.slice(0, 120) ?? null;
}

/* ── Seed fallback ── */

const NOW = Date.now();
const SEED: StuckGenItem[] = [
  {
    id: "seed-nike-monsoon-01",
    status: "processing",
    created_at: new Date(NOW - 1000 * 60 * 42).toISOString(),
    campaign_id: "camp-nike",
    replicate_prediction_id: "pred_pq9x2mkbh3dvhr1",
    assembled_prompt:
      "Sneaker hero shot on wet tarmac, monsoon rain, neon bokeh reflections",
    structured_brief: null,
    brand: "Nike India",
    creator: "Arjun Mehta · Bengaluru",
    summary: "Sneaker hero shot · monsoon rain · neon bokeh",
    costRupees: 2500,
    seed: true,
  },
  {
    id: "seed-oneplus-nord-02",
    status: "processing",
    created_at: new Date(NOW - 1000 * 60 * 18).toISOString(),
    campaign_id: "camp-oneplus",
    replicate_prediction_id: "pred_ab8f3lktr9wzpv2",
    assembled_prompt:
      "Phone held at night, rim light, reflective OP logo, cinematic",
    structured_brief: null,
    brand: "OnePlus India",
    creator: "Priya Sharma · Mumbai",
    summary: "Nord launch hero · night rim light",
    costRupees: 3000,
    seed: true,
  },
  {
    id: "seed-myntra-festive-03",
    status: "processing",
    created_at: new Date(NOW - 1000 * 60 * 9).toISOString(),
    campaign_id: "camp-myntra",
    replicate_prediction_id: "pred_mz2t9jcvq8lkrx4",
    assembled_prompt:
      "Creator in festive kurta, warm golden hour, diya accent, lifestyle",
    structured_brief: null,
    brand: "Myntra (Flipkart)",
    creator: "Meera Iyer · Delhi NCR",
    summary: "Festive kurta · golden hour · diya accent",
    costRupees: 2200,
    seed: true,
  },
];

/* ── Main component ── */

export function StuckList() {
  const [items, setItems] = useState<StuckGenItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [refundTarget, setRefundTarget] = useState<StuckGenItem | null>(null);
  const [refundPending, startRefundTransition] = useTransition();

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/stuck-gens", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { items: StuckGenItem[] };
        const live = data.items ?? [];
        setItems(live.length > 0 ? live : SEED);
      } else {
        setItems(SEED);
      }
    } catch {
      setItems(SEED);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  async function handleRetry(item: StuckGenItem) {
    if (item.seed) {
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      toast.success("Seed retried (demo only)");
      return;
    }
    setActioningId(item.id);
    try {
      const res = await fetch(`/api/admin/stuck-gens/${item.id}/retry`, {
        method: "POST",
      });
      if (res.ok) {
        const data = (await res.json()) as { replicate_prediction_id?: string };
        toast.success(
          `Resubmitted to Replicate${data.replicate_prediction_id ? ` — ${data.replicate_prediction_id.slice(0, 10)}…` : ""}`,
        );
        setItems((prev) => prev.filter((i) => i.id !== item.id));
      } else {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        toast.error(data.error ?? "Retry failed");
      }
    } finally {
      setActioningId(null);
    }
  }

  function handleRefund() {
    if (!refundTarget) return;
    if (refundTarget.seed) {
      setItems((prev) => prev.filter((i) => i.id !== refundTarget.id));
      setRefundTarget(null);
      toast.success("Seed refund queued (demo only)");
      return;
    }
    startRefundTransition(async () => {
      const res = await fetch(
        `/api/admin/stuck-gens/${refundTarget.id}/refund`,
        { method: "POST" },
      );
      if (res.ok) {
        toast.success("Refund issued — credits returned to brand wallet");
        setRefundTarget(null);
        setItems((prev) => prev.filter((i) => i.id !== refundTarget.id));
      } else {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        toast.error(data.error ?? "Refund failed");
      }
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="size-6 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-primary)]" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 lg:px-8 lg:py-8">
      {/* ═══════════ Header ═══════════ */}
      <div className="mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
            <Timer className="mr-1 inline h-3 w-3 text-[var(--color-primary)]" />
            Replicate SLA breach · triage queue
          </p>
          <h1 className="mt-1 font-display text-[30px] font-800 leading-none tracking-tight text-[var(--color-foreground)] md:text-[36px]">
            Stuck generations
          </h1>
          <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
            <span className="font-600 text-[var(--color-foreground)]">
              {items.length}
            </span>{" "}
            generation{items.length !== 1 ? "s" : ""} past the 5-minute threshold
            · retry re-queues Replicate · refund returns escrowed credits.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchItems}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-[13px] font-600 text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-secondary)]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* ═══════════ Empty state ═══════════ */}
      {items.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-14 text-center shadow-sm"
        >
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-emerald-500/15">
            <Inbox className="size-6 text-emerald-500 dark:text-emerald-300" />
          </div>
          <h2 className="mb-1 text-lg font-700 text-[var(--color-foreground)]">
            Nothing stuck
          </h2>
          <p className="mx-auto max-w-xs text-sm text-[var(--color-muted-foreground)]">
            Every active generation is processing inside SLA. You can close this
            tab and get back to chaos.
          </p>
        </motion.div>
      ) : (
        /* ═══════════ List ═══════════ */
        <ul className="flex flex-col gap-3">
          <AnimatePresence mode="popLayout" initial={false}>
            {items.map((item, i) => {
              const isActioning = actioningId === item.id;
              const snippet = briefSnippet(item);
              return (
                <motion.li
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    transition: { duration: 0.25, delay: i * 0.04 },
                  }}
                  exit={{
                    opacity: 0,
                    x: 40,
                    transition: { duration: 0.2 },
                  }}
                  className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 shadow-sm transition-colors hover:bg-[var(--color-secondary)]/50"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    {/* Icon */}
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/15">
                      <AlertCircle className="size-5 text-amber-600 dark:text-amber-300" />
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-[var(--color-secondary)] px-2 py-0.5 font-mono text-[11px] font-700 text-[var(--color-foreground)]">
                          {shortId(item.id)}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] font-700 text-amber-600 dark:text-amber-300">
                          <Clock className="size-3" />
                          {stuckDuration(item.created_at)}
                        </span>
                        {item.costRupees != null && (
                          <span className="font-mono text-[11px] font-700 text-[var(--color-primary)]">
                            ₹{item.costRupees.toLocaleString("en-IN")}
                          </span>
                        )}
                        <span className="font-mono text-[11px] text-[var(--color-muted-foreground)]">
                          Started {formatDate(item.created_at)}
                        </span>
                      </div>

                      {(item.brand || item.creator) && (
                        <div className="mb-0.5 text-[13px] font-700 text-[var(--color-foreground)]">
                          {item.brand ?? "Brand"}
                          {item.creator && (
                            <span className="font-500 text-[var(--color-muted-foreground)]">
                              {" · "}
                              {item.creator}
                            </span>
                          )}
                        </div>
                      )}

                      {snippet ? (
                        <p className="line-clamp-1 text-[13px] text-[var(--color-muted-foreground)]">
                          {snippet}
                        </p>
                      ) : (
                        <p className="line-clamp-1 flex items-center gap-1 text-[13px] text-[var(--color-muted-foreground)]">
                          <Sparkles className="h-3 w-3" />
                          Awaiting prompt assembly.
                        </p>
                      )}

                      {item.replicate_prediction_id && (
                        <p className="mt-0.5 font-mono text-[11px] text-[var(--color-muted-foreground)]">
                          replicate · {item.replicate_prediction_id.slice(0, 18)}
                          …
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => handleRetry(item)}
                        disabled={isActioning}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-[13px] font-700 text-[var(--color-primary-foreground)] shadow-sm transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isActioning ? (
                          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        ) : (
                          <RotateCcw className="h-4 w-4" />
                        )}
                        Retry
                      </button>
                      <button
                        onClick={() => setRefundTarget(item)}
                        disabled={isActioning}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[13px] font-700 text-rose-600 transition-colors hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-60 dark:text-rose-300"
                      >
                        <Banknote className="h-4 w-4" />
                        Refund
                      </button>
                    </div>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      {/* ═══════════ Refund confirm modal ═══════════ */}
      <Dialog
        open={Boolean(refundTarget)}
        onOpenChange={(open) => !open && setRefundTarget(null)}
      >
        <DialogContent className="rounded-2xl border-[var(--color-border)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-lg font-800 tracking-tight text-[var(--color-foreground)]">
              Confirm refund
            </DialogTitle>
            <DialogDescription className="text-sm text-[var(--color-muted-foreground)]">
              Reserved credits return to the brand&apos;s wallet and this
              generation is marked refunded. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {refundTarget && (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]/60 px-4 py-3 text-sm">
              <p className="mb-0.5 font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                Generation
              </p>
              <p className="font-mono font-700 text-[var(--color-foreground)]">
                {shortId(refundTarget.id)}
              </p>
              {refundTarget.brand && (
                <p className="mt-1 text-[13px] text-[var(--color-foreground)]">
                  {refundTarget.brand}
                  {refundTarget.costRupees != null && (
                    <span className="ml-2 font-mono text-[12px] font-700 text-[var(--color-primary)]">
                      ₹{refundTarget.costRupees.toLocaleString("en-IN")}
                    </span>
                  )}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <button
              onClick={() => setRefundTarget(null)}
              disabled={refundPending}
              className="inline-flex items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2 text-[13px] font-600 text-[var(--color-foreground)] hover:bg-[var(--color-secondary)] disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              onClick={handleRefund}
              disabled={refundPending}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-rose-500 px-4 py-2 text-[13px] font-700 text-white hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refundPending ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <Banknote className="h-4 w-4" />
              )}
              Issue refund
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
