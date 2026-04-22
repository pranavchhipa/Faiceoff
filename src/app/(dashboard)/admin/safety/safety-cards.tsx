"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck,
  ShieldX,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  Inbox,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/* ── Types ── */

interface SafetyItem {
  id: string;
  status: string;
  image_url: string | null;
  assembled_prompt: string | null;
  structured_brief: Record<string, unknown> | null;
  hive_result: Record<string, unknown> | null;
  created_at: string;
  campaign_id: string | null;
}

/* ── Helpers ── */

function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function HiveScoreBadge({
  label,
  score,
}: {
  label: string;
  score: number;
}) {
  const high = score > 0.7;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-700 ${
        high
          ? "bg-red-100 text-red-600"
          : "bg-[var(--color-surface-container-low)] text-[var(--color-outline-variant)]"
      }`}
    >
      {high && <AlertTriangle className="size-2.5" />}
      {label}: {score.toFixed(2)}
    </span>
  );
}

/* ── Main component ── */

export function SafetyCards() {
  const [items, setItems] = useState<SafetyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/safety/queue", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { items: SafetyItem[] };
        setItems(data.items ?? []);
      } else {
        toast.error("Failed to load safety queue");
      }
    } catch {
      toast.error("Network error loading queue");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    void fetchQueue();
  }, [fetchQueue]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      void fetchQueue();
    }, 30_000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  function handleAction(id: string, action: "approve" | "reject") {
    setActioningId(id);
    startTransition(async () => {
      try {
        const endpoint =
          action === "approve"
            ? `/api/admin/safety/${id}/approve`
            : `/api/admin/safety/${id}/reject`;

        const res = await fetch(endpoint, { method: "POST" });
        if (res.ok) {
          setItems((prev) => prev.filter((item) => item.id !== id));
          toast.success(
            action === "approve"
              ? "Generation approved (Hive overridden)"
              : "Generation rejected"
          );
        } else {
          const data = await res.json().catch(() => ({})) as { error?: string };
          toast.error(data.error ?? `Failed to ${action}`);
        }
      } finally {
        setActioningId(null);
      }
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="size-6 animate-spin rounded-full border-2 border-[var(--color-outline-variant)]/30 border-t-[var(--color-primary)]" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-800 tracking-tight text-[var(--color-on-surface)]">
            Safety review queue
            {items.length > 0 && (
              <span className="ml-2 inline-flex items-center justify-center size-6 rounded-full bg-red-100 text-red-600 text-xs font-700">
                {items.length}
              </span>
            )}
          </h1>
          <p className="mt-0.5 text-sm text-[var(--color-outline-variant)]">
            Hive-flagged generations awaiting admin override. Auto-refreshes every 30s.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={fetchQueue}
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
            No safety reviews pending
          </h2>
          <p className="text-sm text-[var(--color-outline-variant)] max-w-xs mx-auto">
            All generations have cleared Hive content moderation or have been reviewed.
          </p>
        </motion.div>
      )}

      {/* Card grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AnimatePresence mode="popLayout">
          {items.map((item, i) => {
            const isActioning = actioningId === item.id;
            const hive = item.hive_result as Record<string, number> | null;
            const briefSummary =
              (item.structured_brief?.concept as string) ??
              item.assembled_prompt?.slice(0, 100) ??
              null;

            return (
              <motion.div
                key={item.id}
                custom={i}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.3, delay: i * 0.05 } }}
                exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                layout
                className="rounded-2xl border border-[var(--color-outline-variant)]/15 bg-[var(--color-surface-container-lowest)] overflow-hidden shadow-sm"
              >
                {/* Image */}
                <div className="relative aspect-video bg-[var(--color-surface-container-low)] flex items-center justify-center">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt="Generation preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Sparkles className="size-8 text-[var(--color-outline-variant)]" />
                  )}
                  {/* Status badge */}
                  <div className="absolute top-2.5 right-2.5">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-500/90 text-white text-[10px] font-700 backdrop-blur-sm">
                      <AlertTriangle className="size-3" />
                      Needs review
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="p-4">
                  {/* ID + date */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="font-mono text-xs font-700 text-[var(--color-on-surface)] bg-[var(--color-surface-container-low)] px-2 py-0.5 rounded-md">
                      {shortId(item.id)}
                    </span>
                    <span className="text-xs text-[var(--color-outline-variant)]">
                      {formatDate(item.created_at)}
                    </span>
                  </div>

                  {/* Brief summary */}
                  {briefSummary && (
                    <p className="text-sm text-[var(--color-on-surface-variant)] line-clamp-2 mb-3 leading-relaxed">
                      {briefSummary}
                    </p>
                  )}

                  {/* Hive scores */}
                  {hive && Object.keys(hive).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {Object.entries(hive).map(([key, val]) =>
                        typeof val === "number" ? (
                          <HiveScoreBadge key={key} label={key} score={val} />
                        ) : null
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      onClick={() => handleAction(item.id, "approve")}
                      disabled={isActioning}
                      className="flex-1 rounded-xl bg-green-500 text-white hover:bg-green-600 font-600"
                    >
                      {isActioning ? (
                        <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white inline-block" />
                      ) : (
                        <ShieldCheck className="size-4" />
                      )}
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAction(item.id, "reject")}
                      disabled={isActioning}
                      className="flex-1 rounded-xl border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300 font-600"
                    >
                      {isActioning ? (
                        <span className="size-4 animate-spin rounded-full border-2 border-red-200 border-t-red-500 inline-block" />
                      ) : (
                        <ShieldX className="size-4" />
                      )}
                      Reject
                    </Button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
