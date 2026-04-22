"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  RefreshCw,
  RotateCcw,
  Banknote,
  Clock,
  AlertCircle,
  Inbox,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
        setItems(data.items ?? []);
      } else {
        toast.error("Failed to load stuck generations");
      }
    } catch {
      toast.error("Network error loading stuck generations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  async function handleRetry(item: StuckGenItem) {
    setActioningId(item.id);
    try {
      const res = await fetch(`/api/admin/stuck-gens/${item.id}/retry`, {
        method: "POST",
      });
      if (res.ok) {
        const data = (await res.json()) as { replicate_prediction_id?: string };
        toast.success(
          `Resubmitted to Replicate${data.replicate_prediction_id ? ` — ${data.replicate_prediction_id.slice(0, 10)}…` : ""}`
        );
        setItems((prev) => prev.filter((i) => i.id !== item.id));
      } else {
        const data = await res.json().catch(() => ({})) as { error?: string };
        toast.error(data.error ?? "Retry failed");
      }
    } finally {
      setActioningId(null);
    }
  }

  function handleRefund() {
    if (!refundTarget) return;
    startRefundTransition(async () => {
      const res = await fetch(`/api/admin/stuck-gens/${refundTarget.id}/refund`, {
        method: "POST",
      });
      if (res.ok) {
        toast.success("Refund issued — credits returned to brand wallet");
        setRefundTarget(null);
        setItems((prev) => prev.filter((i) => i.id !== refundTarget.id));
      } else {
        const data = await res.json().catch(() => ({})) as { error?: string };
        toast.error(data.error ?? "Refund failed");
      }
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="size-6 animate-spin rounded-full border-2 border-[var(--color-outline-variant)]/30 border-t-[var(--color-accent-gold)]" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-800 tracking-tight text-[var(--color-on-surface)]">
            Stuck generations
            {items.length > 0 && (
              <span className="ml-2 inline-flex items-center justify-center size-6 rounded-full bg-[var(--color-accent-gold)]/15 text-[var(--color-accent-gold)] text-xs font-700">
                {items.length}
              </span>
            )}
          </h1>
          <p className="mt-0.5 text-sm text-[var(--color-outline-variant)]">
            Generations stuck in processing for more than 5 minutes. Retry or refund.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={fetchItems}
          className="rounded-xl text-[var(--color-outline-variant)] hover:text-[var(--color-on-surface)]"
        >
          <RefreshCw className="size-4" />
        </Button>
      </div>

      {/* Empty state */}
      {items.length === 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as const }}
          className="rounded-2xl border border-[var(--color-outline-variant)]/15 bg-[var(--color-surface-container-lowest)] p-14 text-center shadow-sm"
        >
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-[var(--color-mint)]/30">
            <Inbox className="size-6 text-[var(--color-outline)]" />
          </div>
          <h2 className="text-lg font-700 text-[var(--color-on-surface)] mb-1">
            No stuck generations
          </h2>
          <p className="text-sm text-[var(--color-outline-variant)] max-w-xs mx-auto">
            All active generations are processing within expected time.
          </p>
        </motion.div>
      )}

      {/* List */}
      <div className="flex flex-col gap-3">
        <AnimatePresence mode="popLayout">
          {items.map((item, i) => {
            const isActioning = actioningId === item.id;
            const briefSnippet =
              (item.structured_brief?.concept as string) ??
              item.assembled_prompt?.slice(0, 120) ??
              null;

            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.25, delay: i * 0.04 } }}
                exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
                layout
                className="rounded-2xl border border-[var(--color-outline-variant)]/15 bg-[var(--color-surface-container-lowest)] p-4 shadow-sm"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  {/* Icon */}
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-gold)]/10">
                    <AlertCircle className="size-5 text-[var(--color-accent-gold)]" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-xs font-700 text-[var(--color-on-surface)] bg-[var(--color-surface-container-low)] px-2 py-0.5 rounded-md">
                        {shortId(item.id)}
                      </span>
                      <span className="flex items-center gap-1 text-xs font-700 text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                        <Clock className="size-3" />
                        {stuckDuration(item.created_at)}
                      </span>
                      <span className="text-xs text-[var(--color-outline-variant)]">
                        Started {formatDate(item.created_at)}
                      </span>
                    </div>

                    {briefSnippet && (
                      <p className="text-sm text-[var(--color-on-surface-variant)] line-clamp-1 mt-0.5">
                        {briefSnippet}
                      </p>
                    )}

                    {item.replicate_prediction_id && (
                      <p className="text-xs text-[var(--color-outline-variant)] mt-0.5 font-mono">
                        Replicate: {item.replicate_prediction_id.slice(0, 16)}…
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      onClick={() => handleRetry(item)}
                      disabled={isActioning}
                      className="rounded-xl bg-[var(--color-accent-gold)] text-white hover:opacity-90 font-600"
                    >
                      {isActioning ? (
                        <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white inline-block" />
                      ) : (
                        <RotateCcw className="size-4" />
                      )}
                      Retry
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setRefundTarget(item)}
                      disabled={isActioning}
                      className="rounded-xl border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300 font-600"
                    >
                      <Banknote className="size-4" />
                      Refund
                    </Button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Refund confirm modal */}
      <Dialog
        open={Boolean(refundTarget)}
        onOpenChange={(open) => !open && setRefundTarget(null)}
      >
        <DialogContent className="sm:max-w-sm rounded-2xl border-[var(--color-outline-variant)]/15">
          <DialogHeader>
            <DialogTitle className="text-lg font-700 text-[var(--color-on-surface)]">
              Confirm refund
            </DialogTitle>
            <DialogDescription className="text-sm text-[var(--color-outline-variant)]">
              Credits will be returned to the brand&apos;s wallet and this generation will be
              marked as refunded. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {refundTarget && (
            <div className="rounded-xl bg-[var(--color-surface-container-low)] px-4 py-3 text-sm">
              <p className="text-[10px] font-700 uppercase tracking-widest text-[var(--color-outline-variant)] mb-0.5">
                Generation
              </p>
              <p className="font-mono font-700 text-[var(--color-on-surface)]">
                {shortId(refundTarget.id)}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setRefundTarget(null)}
              disabled={refundPending}
              className="rounded-xl text-[var(--color-outline-variant)]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRefund}
              disabled={refundPending}
              className="rounded-xl bg-red-500 text-white hover:bg-red-600 font-600"
            >
              {refundPending ? (
                <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white inline-block" />
              ) : (
                <Banknote className="size-4" />
              )}
              Issue refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
