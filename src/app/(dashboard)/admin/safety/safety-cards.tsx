"use client";

// ─────────────────────────────────────────────────────────────────────────────
// /admin/safety — Hive review queue (Split Stage)
//
// Two-pane workspace: safety list on the left, inspector on the right.
// Pick any flagged generation from the queue, inspect the image, brief,
// Hive scores, and brand/creator metadata, then approve or reject with
// refund. Auto-refreshes every 30s. Seeded with realistic mock rows when
// the live queue is empty so the screen never looks dead.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Inbox,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

/* ───────── Types ───────── */

type Severity = "warn" | "error" | "ok";

interface SafetyItem {
  id: string;
  status: string;
  image_url: string | null;
  assembled_prompt: string | null;
  structured_brief: Record<string, unknown> | null;
  hive_result: Record<string, unknown> | null;
  created_at: string;
  campaign_id: string | null;
  // presentational / seed fields
  brand?: string;
  creator?: string;
  creatorLocation?: string;
  title?: string;
  summary?: string;
  severity?: Severity;
  severityLabel?: string;
  cost?: string;
  hiveScore?: string;
  seed?: boolean;
}

/* ───────── Helpers ───────── */

function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function relative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.max(1, Math.round(ms / 60_000));
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function briefSummary(it: SafetyItem): string {
  if (it.summary) return it.summary;
  const concept = (it.structured_brief?.concept as string | undefined) ?? "";
  if (concept) return concept;
  return it.assembled_prompt?.slice(0, 140) ?? "No brief attached.";
}

function severityClasses(s: Severity): string {
  if (s === "error")
    return "border-rose-500/40 bg-rose-500/15 text-rose-600 dark:text-rose-300";
  if (s === "warn")
    return "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-300";
  return "border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300";
}

/* ───────── Seed fallback ─────────

   When the live queue is empty (fresh install, staging env, or all clear),
   show realistic seeds so the split-stage layout reads like a finished
   product. Seeds never fire approve/reject network calls. */

const NOW = Date.now();
const SEED: SafetyItem[] = [
  {
    id: "seed-oneplus-nord",
    status: "needs_admin_review",
    image_url: "/landing/product-phone.jpg",
    assembled_prompt: null,
    structured_brief: null,
    hive_result: { nsfw: 0.04, violence: 0.02, brandSafety: 0.74 },
    created_at: new Date(NOW - 1000 * 60 * 120).toISOString(),
    campaign_id: "camp-oneplus",
    brand: "OnePlus India Pvt Ltd",
    creator: "Priya Sharma",
    creatorLocation: "Mumbai",
    title: "OnePlus · Nord launch",
    summary: "Phone held at neon rim light, night street backdrop, brand logo rim",
    severity: "warn",
    severityLabel: "REVIEW",
    cost: "₹3,000",
    hiveScore: "0.74 · flagged",
    seed: true,
  },
  {
    id: "seed-ordinary-priya",
    status: "needs_admin_review",
    image_url: "/landing/product-skincare.jpg",
    assembled_prompt: null,
    structured_brief: null,
    hive_result: { nsfw: 0.02, cosmetics_claim: 0.31 },
    created_at: new Date(NOW - 1000 * 60 * 90).toISOString(),
    campaign_id: "camp-ordinary",
    brand: "The Ordinary (DECIEM)",
    creator: "Priya Sharma",
    creatorLocation: "Mumbai",
    title: "The Ordinary · Niacinamide serum",
    summary: "Serum dropper framed against matte beige tile, soft morning light",
    severity: "ok",
    severityLabel: "PASS",
    cost: "₹2,200",
    hiveScore: "0.31 · clean",
    seed: true,
  },
  {
    id: "seed-nike-monsoon",
    status: "needs_admin_review",
    image_url: "/landing/product-sneaker.jpg",
    assembled_prompt: null,
    structured_brief: null,
    hive_result: { nsfw: 0.01, brandSafety: 0.12 },
    created_at: new Date(NOW - 1000 * 60 * 55).toISOString(),
    campaign_id: "camp-nike",
    brand: "Nike India",
    creator: "Arjun Mehta",
    creatorLocation: "Bengaluru",
    title: "Nike · Monsoon drop",
    summary: "Sneaker on wet tarmac, reflections of traffic light bokeh",
    severity: "ok",
    severityLabel: "PASS",
    cost: "₹2,500",
    hiveScore: "0.12 · clean",
    seed: true,
  },
  {
    id: "seed-starbucks-cafe",
    status: "needs_admin_review",
    image_url: "/landing/product-food.jpg",
    assembled_prompt: null,
    structured_brief: null,
    hive_result: { nsfw: 0.04, policy_violation: 0.88 },
    created_at: new Date(NOW - 1000 * 60 * 40).toISOString(),
    campaign_id: "camp-sbux",
    brand: "Starbucks India (Tata)",
    creator: "Meera Iyer",
    creatorLocation: "Delhi NCR",
    title: "Starbucks · Café evening",
    summary: "Flagged: competitor logo visible in café window reflection",
    severity: "error",
    severityLabel: "BLOCK",
    cost: "₹2,000",
    hiveScore: "0.88 · block",
    seed: true,
  },
  {
    id: "seed-priya-retrain",
    status: "needs_admin_review",
    image_url: "/landing/creator-face.jpg",
    assembled_prompt: null,
    structured_brief: null,
    hive_result: { likeness_drift: 0.61 },
    created_at: new Date(NOW - 1000 * 60 * 25).toISOString(),
    campaign_id: null,
    brand: "Internal · LoRA ops",
    creator: "Priya Sharma",
    creatorLocation: "Mumbai",
    title: "Priya · reference re-train",
    summary: "Creator requested LoRA retrain — new reference set pending review",
    severity: "warn",
    severityLabel: "REVIEW",
    cost: "—",
    hiveScore: "0.61 · drift",
    seed: true,
  },
  {
    id: "seed-arjun-kyc",
    status: "needs_admin_review",
    image_url: "/landing/creator-2.jpg",
    assembled_prompt: null,
    structured_brief: null,
    hive_result: { kyc_mismatch: 0.48 },
    created_at: new Date(NOW - 1000 * 60 * 15).toISOString(),
    campaign_id: null,
    brand: "Internal · KYC ops",
    creator: "Arjun Mehta",
    creatorLocation: "Bengaluru",
    title: "Arjun · KYC update",
    summary: "PAN change submitted. Verify new document matches payout account name.",
    severity: "warn",
    severityLabel: "REVIEW",
    cost: "—",
    hiveScore: "0.48 · flagged",
    seed: true,
  },
];

/* ───────── Presentation pieces ───────── */

function SeverityPill({ s, label }: { s: Severity; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-700 tracking-[0.18em] ${severityClasses(s)}`}
    >
      {label}
    </span>
  );
}

function HiveRow({ k, v }: { k: string; v: number }) {
  const high = v > 0.7;
  const medium = v > 0.4;
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2">
      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
        {k}
      </span>
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--color-secondary)]">
          <div
            className={`h-full rounded-full ${
              high ? "bg-rose-500" : medium ? "bg-amber-500" : "bg-emerald-500"
            }`}
            style={{ width: `${Math.min(100, Math.round(v * 100))}%` }}
          />
        </div>
        <span
          className={`w-10 text-right font-mono text-[11px] font-700 ${
            high
              ? "text-rose-500 dark:text-rose-300"
              : medium
                ? "text-amber-600 dark:text-amber-300"
                : "text-emerald-600 dark:text-emerald-300"
          }`}
        >
          {v.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

/* ───────── Main component ───────── */

export function SafetyCards() {
  const [items, setItems] = useState<SafetyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/safety/queue", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { items: SafetyItem[] };
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
    void fetchQueue();
  }, [fetchQueue]);

  useEffect(() => {
    const interval = setInterval(() => {
      void fetchQueue();
    }, 30_000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  // Keep selection sane as items mutate
  useEffect(() => {
    if (!selectedId && items.length > 0) setSelectedId(items[0].id);
    if (selectedId && !items.find((i) => i.id === selectedId)) {
      setSelectedId(items[0]?.id ?? null);
    }
  }, [items, selectedId]);

  const selected = useMemo(
    () => items.find((i) => i.id === selectedId) ?? items[0] ?? null,
    [items, selectedId],
  );

  const liveCount = items.filter((i) => !i.seed).length;
  const totalCount = items.length;

  function handleAction(id: string, action: "approve" | "reject") {
    const item = items.find((i) => i.id === id);
    if (!item) return;

    // Seed rows don't hit the network
    if (item.seed) {
      setItems((prev) => prev.filter((i) => i.id !== id));
      toast.success(
        action === "approve"
          ? "Seed cleared (demo only)"
          : "Seed rejected (demo only)",
      );
      return;
    }

    setActioningId(id);
    startTransition(async () => {
      try {
        const endpoint =
          action === "approve"
            ? `/api/admin/safety/${id}/approve`
            : `/api/admin/safety/${id}/reject`;
        const res = await fetch(endpoint, { method: "POST" });
        if (res.ok) {
          setItems((prev) => prev.filter((i) => i.id !== id));
          toast.success(
            action === "approve"
              ? "Generation approved (Hive overridden)"
              : "Generation rejected & refunded",
          );
        } else {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
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
        <div className="size-6 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-primary)]" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-6 lg:px-8 lg:py-8">
      {/* ═══════════ Header ═══════════ */}
      <div className="mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
            <ShieldAlert className="mr-1 inline h-3 w-3 text-[var(--color-primary)]" />
            Hive queue · admin override · audited
          </p>
          <h1 className="mt-1 font-display text-[30px] font-800 leading-none tracking-tight text-[var(--color-foreground)] md:text-[36px]">
            Safety review
          </h1>
          <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
            <span className="font-600 text-[var(--color-foreground)]">
              {totalCount}
            </span>{" "}
            in queue · {liveCount} live · auto-refresh every 30s
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchQueue}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-[13px] font-600 text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-secondary)]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* ═══════════ Empty state ═══════════ */}
      {totalCount === 0 ? (
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
            Queue clear
          </h2>
          <p className="mx-auto max-w-xs text-sm text-[var(--color-muted-foreground)]">
            Every generation has cleared Hive. Enjoy the calm — the next flag is
            only a moment away.
          </p>
        </motion.div>
      ) : (
        /* ═══════════ Split Stage ═══════════ */
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
          {/* ─── LIST ─── */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-sm">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
              <h4 className="font-display text-[13px] font-700 tracking-tight text-[var(--color-foreground)]">
                Queue
              </h4>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-muted-foreground)]">
                sort · newest
              </span>
            </div>

            <ul className="flex flex-col divide-y divide-[var(--color-border)]">
              <AnimatePresence mode="popLayout" initial={false}>
                {items.map((it) => {
                  const isActive = selected?.id === it.id;
                  const sev: Severity = it.severity ?? "warn";
                  const label = it.severityLabel ?? "REVIEW";
                  return (
                    <motion.li
                      key={it.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -24 }}
                      transition={{ duration: 0.22 }}
                    >
                      <button
                        onClick={() => setSelectedId(it.id)}
                        className={`group flex w-full items-center gap-3 px-3 py-3 text-left transition-colors ${
                          isActive
                            ? "bg-[var(--color-secondary)]"
                            : "hover:bg-[var(--color-secondary)]/60"
                        }`}
                      >
                        {/* Thumb */}
                        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-secondary)]">
                          {it.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={it.image_url}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <Sparkles className="h-4 w-4 text-[var(--color-muted-foreground)]" />
                            </div>
                          )}
                          {isActive && (
                            <span className="pointer-events-none absolute inset-0 ring-2 ring-[var(--color-primary)]/70" />
                          )}
                        </div>

                        {/* Info */}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-700 text-[var(--color-foreground)]">
                            {it.title ?? it.brand ?? shortId(it.id)}
                          </div>
                          <div className="truncate text-[11px] text-[var(--color-muted-foreground)]">
                            {it.summary ??
                              briefSummary(it) ??
                              `${shortId(it.id)} · ${relative(it.created_at)}`}
                          </div>
                        </div>

                        <SeverityPill s={sev} label={label} />
                      </button>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          </div>

          {/* ─── DETAIL ─── */}
          <aside className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 shadow-sm lg:sticky lg:top-6 lg:self-start">
            {!selected ? (
              <div className="flex h-72 items-center justify-center text-sm text-[var(--color-muted-foreground)]">
                Select an item to inspect.
              </div>
            ) : (
              <div>
                {/* Meta top */}
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-[10px] font-700 uppercase tracking-[0.2em] text-[var(--color-muted-foreground)]">
                    Generation #{shortId(selected.id)}
                  </p>
                  <SeverityPill
                    s={selected.severity ?? "warn"}
                    label={selected.severityLabel ?? "REVIEW"}
                  />
                </div>

                {/* Image */}
                <div className="relative mt-4 aspect-[16/10] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]">
                  {selected.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selected.image_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Sparkles className="h-8 w-8 text-[var(--color-muted-foreground)]" />
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/40 to-transparent" />
                </div>

                {/* Title + caption */}
                <h5 className="mt-4 font-display text-[20px] font-800 leading-tight tracking-tight text-[var(--color-foreground)]">
                  {selected.title ?? selected.brand ?? "Flagged generation"}
                </h5>
                <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                  {briefSummary(selected)}
                </p>

                {/* KV grid */}
                <div className="mt-5 grid grid-cols-[110px_1fr] gap-x-4 gap-y-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-4">
                  <KV k="Brand" v={selected.brand ?? "—"} />
                  <KV
                    k="Creator"
                    v={
                      selected.creator
                        ? `${selected.creator}${selected.creatorLocation ? ` (${selected.creatorLocation})` : ""}`
                        : "—"
                    }
                  />
                  <KV
                    k="Cost"
                    v={selected.cost ?? "—"}
                    accent
                  />
                  <KV
                    k="Hive score"
                    v={selected.hiveScore ?? "pending"}
                    accent={
                      !!selected.hiveScore &&
                      selected.hiveScore.toLowerCase().includes("flag")
                    }
                  />
                  <KV k="Queued" v={relative(selected.created_at)} />
                  <KV k="Status" v={selected.status.replace(/_/g, " ")} />
                </div>

                {/* Hive scores breakdown */}
                {selected.hive_result &&
                  Object.keys(selected.hive_result).length > 0 && (
                    <div className="mt-5">
                      <p className="mb-2 font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                        Hive breakdown
                      </p>
                      <div className="flex flex-col gap-1.5">
                        {Object.entries(selected.hive_result).map(([k, v]) =>
                          typeof v === "number" ? (
                            <HiveRow key={k} k={k} v={v} />
                          ) : null,
                        )}
                      </div>
                    </div>
                  )}

                {/* Actions */}
                <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                  <button
                    onClick={() => handleAction(selected.id, "approve")}
                    disabled={actioningId === selected.id}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-3 text-[14px] font-700 text-[var(--color-primary-foreground)] shadow-sm transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {actioningId === selected.id ? (
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    ) : (
                      <ShieldCheck className="h-4 w-4" />
                    )}
                    Approve
                  </button>
                  <button
                    onClick={() => handleAction(selected.id, "reject")}
                    disabled={actioningId === selected.id}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-[14px] font-700 text-rose-600 transition-colors hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-60 dark:text-rose-300"
                  >
                    {actioningId === selected.id ? (
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-rose-300 border-t-rose-500" />
                    ) : (
                      <ShieldX className="h-4 w-4" />
                    )}
                    Reject · refund
                  </button>
                </div>

                {/* Secondary notes */}
                <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                  <AlertTriangle className="mr-1 inline h-3 w-3 text-[var(--color-primary)]" />
                  Every decision is audit-logged against your admin ID.
                </p>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

/* ───────── Small components ───────── */

function KV({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <>
      <div className="font-mono text-[10px] font-700 uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
        {k}
      </div>
      <div
        className={`text-[13px] font-600 ${
          accent
            ? "text-[var(--color-primary)]"
            : "text-[var(--color-foreground)]"
        }`}
      >
        {v}
      </div>
    </>
  );
}

