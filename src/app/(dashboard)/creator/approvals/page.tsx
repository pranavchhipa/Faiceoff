"use client";

// ─────────────────────────────────────────────────────────────────────────────
// /creator/approvals — Editorial approval queue (LIVE)
//
// Wires to /api/creator/approvals (read), /api/approvals/[id]/approve and
// /api/approvals/[id]/reject (mutations). No mock data.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ChevronRight,
  Clock,
  FileText,
  IndianRupee,
  Inbox,
  Loader2,
  MessageCircle,
  Shield,
  Sparkles,
  X,
} from "lucide-react";

/* ───────── Types ───────── */

interface RawApproval {
  id: string;
  status: string;
  feedback: string | null;
  expires_at: string | null;
  created_at: string;
  generation: {
    id: string;
    image_url: string | null;
    assembled_prompt: string | null;
    structured_brief:
      | { title?: string; category?: string; niche?: string; scope?: string }
      | null;
    cost_paise?: number | null;
  } | null;
  campaign: { id: string; name: string | null } | null;
}

interface Approval {
  id: string;
  brand: string;
  title: string;
  prompt: string;
  thumb: string | null;
  payoutPaise: number;
  expiresIn: string;
  urgent: boolean;
  niche: string;
  createdAt: string;
}

function formatExpiresIn(iso: string | null): { label: string; urgent: boolean; expired: boolean } {
  if (!iso) return { label: "—", urgent: false, expired: false };
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return { label: "expired", urgent: true, expired: true };
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const label = h >= 1 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
  return { label, urgent: h < 12, expired: false };
}

function relativeFrom(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function mapApproval(r: RawApproval): Approval {
  const exp = formatExpiresIn(r.expires_at);
  const brief = r.generation?.structured_brief ?? {};
  return {
    id: r.id,
    brand: r.campaign?.name ?? "Unnamed brief",
    title: brief.title ?? brief.category ?? "Generation",
    prompt: r.generation?.assembled_prompt ?? "",
    thumb: r.generation?.image_url ?? null,
    payoutPaise:
      // Creator earns 75% (platform takes 25%)
      Math.round((r.generation?.cost_paise ?? 0) * 0.75),
    expiresIn: exp.label,
    urgent: exp.urgent,
    niche: brief.niche ?? brief.category ?? "Generation",
    createdAt: relativeFrom(r.created_at),
  };
}

/* ───────── Page ───────── */

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
};

export default function CreatorApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);
  const [feedback, setFeedback] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [weekApproved, setWeekApproved] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/creator/approvals", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load approvals");
        if (cancelled) return;
        const list = (data.approvals as RawApproval[]) ?? [];
        const pending = list.filter((a) => a.status === "pending").map(mapApproval);
        setApprovals(pending);
        setSelectedId(pending[0]?.id ?? null);

        // Approved-this-week count from the same payload
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const wk = list.filter(
          (a) =>
            a.status === "approved" &&
            new Date(a.created_at).getTime() >= weekAgo,
        ).length;
        setWeekApproved(wk);
      } catch (err) {
        console.error("[creator/approvals] load failed", err);
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(
    () => approvals.find((a) => a.id === selectedId) ?? null,
    [approvals, selectedId],
  );

  const totalPayoutPaise = approvals.reduce((s, a) => s + a.payoutPaise, 0);
  const urgent = approvals.filter((a) => a.urgent).length;

  async function handleDecision(id: string, kind: "approve" | "reject") {
    setPendingId(id);
    try {
      const res = await fetch(`/api/approvals/${id}/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body:
          kind === "reject"
            ? JSON.stringify({ feedback: feedback || null })
            : "{}",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Failed to ${kind}`);
      }
      setApprovals((prev) => {
        const remaining = prev.filter((a) => a.id !== id);
        setSelectedId(remaining[0]?.id ?? null);
        return remaining;
      });
      setDecision(null);
      setFeedback("");
    } catch (err) {
      console.error(`[creator/approvals] ${kind} failed`, err);
      alert(err instanceof Error ? err.message : `Failed to ${kind}`);
    } finally {
      setPendingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--color-muted-foreground)]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <p className="font-display text-lg font-700 text-[var(--color-foreground)]">
          Couldn&apos;t load approvals
        </p>
        <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">{error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 py-6 lg:px-8 lg:py-8">
      {/* ═══════════ Header ═══════════ */}
      <motion.div
        variants={fadeUp}
        initial="initial"
        animate="animate"
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mb-6 flex flex-col gap-3 md:mb-8 md:flex-row md:items-end md:justify-between"
      >
        <div>
          <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
            <Shield className="mr-1 inline h-3 w-3 text-[var(--color-primary)]" />
            48h window · Your consent is final
          </p>
          <h1 className="mt-1 font-display text-[30px] font-800 leading-none tracking-tight text-[var(--color-foreground)] md:text-[36px]">
            Approval queue
          </h1>
          <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
            <span className="font-600 text-[var(--color-foreground)]">
              {approvals.length}
            </span>{" "}
            pending ·{" "}
            <span className="font-600 text-[var(--color-primary)]">
              {urgent}
            </span>{" "}
            urgent · total payout{" "}
            <span className="font-600 text-[var(--color-primary)]">
              ₹{(totalPayoutPaise / 100).toLocaleString("en-IN")}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-right">
            <p className="font-mono text-[9px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
              This week
            </p>
            <p className="font-display text-[18px] font-800 text-[var(--color-foreground)]">
              {weekApproved} approved
            </p>
          </div>
        </div>
      </motion.div>

      {/* ═══════════ Empty state ═══════════ */}
      {approvals.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-6">
          {/* ═════════ Left — queue list ═════════ */}
          <motion.div
            variants={fadeUp}
            initial="initial"
            animate="animate"
            transition={{ duration: 0.45, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col gap-2"
          >
            <AnimatePresence mode="popLayout">
              {approvals.map((a, i) => (
                <motion.button
                  key={a.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -40, transition: { duration: 0.25 } }}
                  transition={{ delay: i * 0.04, duration: 0.35 }}
                  onClick={() => setSelectedId(a.id)}
                  className={`group flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                    a.id === selectedId
                      ? "border-[var(--color-primary)]/50 bg-[var(--color-primary)]/5 shadow-[0_8px_28px_-18px_rgba(201,169,110,0.5)]"
                      : "border-[var(--color-border)] bg-[var(--color-card)] hover:border-[var(--color-muted-foreground)]/30"
                  }`}
                >
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-secondary)]">
                    {a.thumb ? (
                      <Image src={a.thumb} alt="" fill sizes="56px" className="object-cover" unoptimized />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[var(--color-muted-foreground)]">
                        <Sparkles className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-display text-[14px] font-700 text-[var(--color-foreground)]">
                        {a.brand}
                      </p>
                      {a.urgent && (
                        <span className="rounded-full bg-rose-500/15 px-1.5 py-px font-mono text-[9px] font-800 uppercase tracking-wider text-rose-500">
                          Urgent
                        </span>
                      )}
                    </div>
                    <p className="truncate text-[12px] text-[var(--color-muted-foreground)]">
                      {a.title}
                    </p>
                    <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-[var(--color-muted-foreground)]">
                      <Clock className="h-2.5 w-2.5" />
                      {a.expiresIn}
                      <span className="ml-auto font-700 text-[var(--color-primary)]">
                        +₹{(a.payoutPaise / 100).toLocaleString("en-IN")}
                      </span>
                    </div>
                  </div>
                  <ChevronRight
                    className={`h-4 w-4 shrink-0 transition-transform ${
                      a.id === selectedId
                        ? "translate-x-0.5 text-[var(--color-primary)]"
                        : "text-[var(--color-muted-foreground)]"
                    }`}
                  />
                </motion.button>
              ))}
            </AnimatePresence>
          </motion.div>

          {/* ═════════ Right — detail ═════════ */}
          <AnimatePresence mode="wait">
            {selected && (
              <motion.div
                key={selected.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
                className="sticky top-4 h-fit rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]"
              >
                {/* Hero image */}
                <div className="relative aspect-[4/3] overflow-hidden rounded-t-2xl bg-[var(--color-secondary)]">
                  {selected.thumb ? (
                    <Image
                      src={selected.thumb}
                      alt=""
                      fill
                      sizes="(max-width: 1024px) 100vw, 50vw"
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[var(--color-muted-foreground)]">
                      <Sparkles className="h-10 w-10" />
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-5">
                    <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-white/70">
                      {selected.niche} · Generation
                    </p>
                    <h2 className="mt-1 font-display text-[22px] font-800 tracking-tight text-white">
                      {selected.brand}
                    </h2>
                    <p className="text-[13px] text-white/80">
                      {selected.title}
                    </p>
                  </div>
                  <div className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 font-mono text-[10px] font-700 uppercase tracking-wider text-white backdrop-blur-md">
                    <Clock className="h-3 w-3" />
                    {selected.expiresIn}
                  </div>
                </div>

                {/* Brief */}
                <div className="p-5">
                  <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
                    Brief
                  </p>
                  <p className="mt-2 text-[14px] leading-relaxed text-[var(--color-foreground)]">
                    {selected.prompt || (
                      <span className="text-[var(--color-muted-foreground)]">
                        No prompt stored for this generation.
                      </span>
                    )}
                  </p>

                  {/* Meta */}
                  <div className="mt-5 grid grid-cols-3 gap-3">
                    <MetaBlock
                      label="Payout"
                      value={`₹${(selected.payoutPaise / 100).toLocaleString("en-IN")}`}
                      accent
                    />
                    <MetaBlock label="Niche" value={selected.niche} />
                    <MetaBlock label="Submitted" value={selected.createdAt} />
                  </div>

                  {/* Decision row */}
                  <div className="mt-6 flex flex-col gap-2">
                    {decision === "reject" ? (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]/50 p-3"
                      >
                        <p className="mb-1.5 font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
                          <MessageCircle className="mr-1 inline h-3 w-3" />
                          Feedback for brand (optional)
                        </p>
                        <textarea
                          value={feedback}
                          onChange={(e) => setFeedback(e.target.value)}
                          rows={2}
                          placeholder="e.g. brand logo too prominent, pose doesn't match my style…"
                          className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-[13px] text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] focus:border-[var(--color-primary)]/40 focus:outline-none"
                        />
                        <div className="mt-2 flex gap-2">
                          <button
                            disabled={pendingId === selected.id}
                            onClick={() => setDecision(null)}
                            className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-[12px] font-600 text-[var(--color-foreground)] disabled:opacity-50"
                          >
                            Cancel
                          </button>
                          <button
                            disabled={pendingId === selected.id}
                            onClick={() => handleDecision(selected.id, "reject")}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-rose-500 px-3 py-2 text-[12px] font-700 text-white disabled:opacity-50"
                          >
                            {pendingId === selected.id && <Loader2 className="h-3 w-3 animate-spin" />}
                            Confirm reject
                          </button>
                        </div>
                      </motion.div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          disabled={pendingId === selected.id}
                          onClick={() => setDecision("reject")}
                          className="flex items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3 text-[14px] font-700 text-[var(--color-foreground)] transition-colors hover:border-rose-500/40 hover:bg-rose-500/5 hover:text-rose-500 disabled:opacity-50"
                        >
                          <X className="h-4 w-4" />
                          Reject
                        </button>
                        <button
                          disabled={pendingId === selected.id}
                          onClick={() => handleDecision(selected.id, "approve")}
                          className="flex items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-3 text-[14px] font-700 text-[var(--color-primary-foreground)] shadow-[0_6px_16px_-6px_rgba(201,169,110,0.6)] transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                        >
                          {pendingId === selected.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                          Approve · ₹{(selected.payoutPaise / 100).toLocaleString("en-IN")}
                        </button>
                      </div>
                    )}

                    <p className="mt-1 flex items-center gap-1 font-mono text-[10px] text-[var(--color-muted-foreground)]">
                      <Sparkles className="h-3 w-3 text-[var(--color-primary)]" />
                      Approving auto-credits{" "}
                      <span className="text-[var(--color-foreground)] font-600">
                        ₹{(selected.payoutPaise / 100).toLocaleString("en-IN")}
                      </span>{" "}
                      to holding · released in 7 days.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Footer legal */}
      <p className="mt-8 text-center font-mono text-[10px] text-[var(--color-muted-foreground)]">
        <FileText className="mr-1 inline h-3 w-3" />
        Every approval logs under DPDP Act · audit-tracked · creator-final.
      </p>
    </div>
  );
}

/* ───────── Pieces ───────── */

function MetaBlock({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)]/40 p-3">
      <p className="font-mono text-[9px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
        {label}
      </p>
      <p
        className={`mt-1 font-display text-[16px] font-800 tracking-tight ${
          accent ? "text-[var(--color-primary)]" : "text-[var(--color-foreground)]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] p-12 text-center"
    >
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-primary)]/10">
        <Inbox className="h-6 w-6 text-[var(--color-primary)]" />
      </div>
      <h3 className="font-display text-[22px] font-800 tracking-tight text-[var(--color-foreground)]">
        Inbox zero.
      </h3>
      <p className="mx-auto mt-2 max-w-md text-[13px] text-[var(--color-muted-foreground)]">
        No pending approvals right now. Brands are queuing up — we&apos;ll
        notify you the moment the next one lands.
      </p>
      <Link
        href="/creator/earnings"
        className="mt-5 inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2 text-[13px] font-600 text-[var(--color-foreground)] hover:bg-[var(--color-secondary)]"
      >
        <IndianRupee className="h-3.5 w-3.5" />
        View earnings
      </Link>
    </motion.div>
  );
}
