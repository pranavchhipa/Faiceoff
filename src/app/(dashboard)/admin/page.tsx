"use client";

// ─────────────────────────────────────────────────────────────────────────────
// /admin — Operations triage overview (Split Stage chrome)
//
// The admin left sidebar (AdminSectionSidebar) owns navigation. This page
// is the triage hub — a dense status dashboard that surfaces every queue
// that needs attention. Click any row or tile to jump into the dedicated
// tool page (safety, stuck-gens, packs).
//
// Live tiles today: safety review, stuck generations, credit packs. Other
// tiles are stubs marked "Soon" so the admin knows what's coming.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  FileText,
  Flag,
  IdCard,
  IndianRupee,
  Package,
  Radio,
  ScrollText,
  Shield,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";

/* ───────── Types ───────── */

type Severity = "warn" | "error" | "ok" | "info";

interface QueueTile {
  href: string;
  title: string;
  count: number | null;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  status: "live" | "soon";
  severity: Severity;
}

interface TriageRow {
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  severity: Severity;
  href: string;
}

/* ───────── Live tiles ───────── */

function buildQueues(safetyCount: number, stuckCount: number): QueueTile[] {
  return [
    {
      href: "/admin/safety",
      title: "Safety review",
      count: safetyCount,
      sub: "Hive flags + policy edges",
      icon: Shield,
      status: "live",
      severity: safetyCount > 0 ? "warn" : "ok",
    },
    {
      href: "/admin/stuck-gens",
      title: "Stuck generations",
      count: stuckCount,
      sub: "Pipeline retry tooling",
      icon: AlertTriangle,
      status: "live",
      severity: stuckCount > 0 ? "error" : "ok",
    },
    {
      href: "/admin/disputes",
      title: "Disputes",
      count: null,
      sub: "Brand ↔ creator resolution",
      icon: Flag,
      status: "soon",
      severity: "warn",
    },
    {
      href: "/admin/kyc-queue",
      title: "KYC queue",
      count: null,
      sub: "PAN + bank verification",
      icon: IdCard,
      status: "soon",
      severity: "info",
    },
  ];
}

const MANAGE: QueueTile[] = [
  {
    href: "/admin/packs",
    title: "Credit packs",
    count: null,
    sub: "Catalog · pricing · GST",
    icon: Package,
    status: "live",
    severity: "ok",
  },
  {
    href: "/admin/creators",
    title: "Creators",
    count: null,
    sub: "Browse + moderate",
    icon: Users,
    status: "soon",
    severity: "ok",
  },
  {
    href: "/admin/revenue",
    title: "Revenue",
    count: null,
    sub: "GMV + commission",
    icon: IndianRupee,
    status: "soon",
    severity: "ok",
  },
  {
    href: "/admin/audit",
    title: "Audit log",
    count: null,
    sub: "Every sensitive action",
    icon: ScrollText,
    status: "soon",
    severity: "ok",
  },
];

// Triage rows / KPIs / health — live data is wired below from the
// /api/admin/* endpoints. No fixtures.

/* ───────── Page ───────── */

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
};

interface SafetyItem {
  id: string;
  brand?: string | null;
  creator?: string | null;
  reason?: string | null;
  created_at?: string;
}

interface StuckItem {
  id: string;
  brand?: string | null;
  creator?: string | null;
  status?: string | null;
  created_at?: string;
}

function relativeFrom(iso?: string): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function AdminHomePage() {
  const [safetyItems, setSafetyItems] = useState<SafetyItem[]>([]);
  const [stuckItems, setStuckItems] = useState<StuckItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [safetyRes, stuckRes] = await Promise.allSettled([
        fetch("/api/admin/safety/queue", { cache: "no-store" }),
        fetch("/api/admin/stuck-gens", { cache: "no-store" }),
      ]);
      if (!cancelled && safetyRes.status === "fulfilled" && safetyRes.value.ok) {
        const j = await safetyRes.value.json();
        setSafetyItems((j.items as SafetyItem[]) ?? []);
      }
      if (!cancelled && stuckRes.status === "fulfilled" && stuckRes.value.ok) {
        const j = await stuckRes.value.json();
        setStuckItems((j.items as StuckItem[]) ?? []);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const QUEUES = buildQueues(safetyItems.length, stuckItems.length);
  const totalPending = QUEUES.reduce((s, q) => s + (q.count ?? 0), 0);

  const triageRows: TriageRow[] = [
    ...safetyItems.slice(0, 3).map((s) => ({
      id: `safety-${s.id}`,
      title:
        [s.brand, s.creator].filter(Boolean).join(" · ") ||
        `Safety review #${s.id.slice(0, 6)}`,
      subtitle: s.reason ?? "Hive flag awaiting review",
      meta: relativeFrom(s.created_at),
      severity: "warn" as Severity,
      href: "/admin/safety",
    })),
    ...stuckItems.slice(0, 3).map((s) => ({
      id: `stuck-${s.id}`,
      title: `Generation ${s.id.slice(0, 8)} stuck`,
      subtitle: s.status ?? "Pipeline error · retry available",
      meta: relativeFrom(s.created_at),
      severity: "error" as Severity,
      href: "/admin/stuck-gens",
    })),
  ];

  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 py-6 lg:px-8 lg:py-8">
      {/* ═══════════ Header ═══════════ */}
      <motion.div
        variants={fadeUp}
        initial="initial"
        animate="animate"
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between"
      >
        <div>
          <p className="flex items-center gap-2 font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
            <Radio className="h-3 w-3 text-emerald-500" />
            Operations · {new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
          </p>
          <h1 className="mt-1 font-display text-[30px] font-800 leading-none tracking-tight text-[var(--color-foreground)] md:text-[34px]">
            Triage overview
          </h1>
          <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
            <span className="font-600 text-[var(--color-foreground)]">{totalPending}</span> items need your attention across{" "}
            <span className="font-600 text-[var(--color-foreground)]">4</span> queues.
            Platform running green.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/safety"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3.5 py-2 text-[13px] font-600 text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-secondary)]"
          >
            <Shield className="h-3.5 w-3.5" /> Safety queue
          </Link>
          <Link
            href="/admin/stuck-gens"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3.5 py-2 text-[13px] font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.5)] transition-transform hover:-translate-y-0.5"
          >
            <Zap className="h-3.5 w-3.5" /> Unstick
          </Link>
        </div>
      </motion.div>

      {/* ═══════════ Queue tiles ═══════════ */}
      <section className="mb-6">
        <p className="mb-3 font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
          Triage queues
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
          {QUEUES.map((q, i) => (
            <QueueCard key={q.href} tile={q} delay={i * 0.04} />
          ))}
        </div>
      </section>

      {/* ═══════════ Split view — Triage list + Health panel ═══════════ */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        {/* Triage list */}
        <motion.div
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.45, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]"
        >
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
            <div>
              <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
                Needs attention
              </p>
              <h3 className="mt-1 font-display text-[18px] font-800 tracking-tight">
                Latest flags + stuck items
              </h3>
            </div>
            <span className="font-mono text-[11px] text-[var(--color-muted-foreground)]">
              sorted · newest
            </span>
          </div>
          <div className="divide-y divide-[var(--color-border)]">
            {triageRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-5 py-12 text-center">
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                <p className="font-display text-[14px] font-700 text-[var(--color-foreground)]">
                  Inbox zero
                </p>
                <p className="text-[12px] text-[var(--color-muted-foreground)]">
                  No safety flags or stuck generations right now.
                </p>
              </div>
            ) : (
              triageRows.map((row) => (
                <Link
                  key={row.id}
                  href={row.href}
                  className="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-[var(--color-secondary)]/60"
                >
                  <SeverityDot severity={row.severity} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-[14px] font-700 text-[var(--color-foreground)]">
                      {row.title}
                    </p>
                    <p className="truncate text-[12px] text-[var(--color-muted-foreground)]">
                      {row.subtitle}
                    </p>
                  </div>
                  <span className="hidden font-mono text-[11px] text-[var(--color-muted-foreground)] sm:inline">
                    {row.meta}
                  </span>
                  <SeverityPill severity={row.severity} />
                  <ArrowRight className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--color-foreground)]" />
                </Link>
              ))
            )}
          </div>
          <div className="flex items-center justify-between border-t border-[var(--color-border)] px-5 py-3">
            <p className="font-mono text-[10px] text-[var(--color-muted-foreground)]">
              {triageRows.length} of {totalPending} showing
            </p>
            <Link
              href="/admin/safety"
              className="inline-flex items-center gap-1 text-[11px] font-600 text-[var(--color-foreground)] hover:text-[var(--color-primary)]"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </motion.div>

        {/* Right column: Health placeholder */}
        <motion.div
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.45, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)]/60 p-5"
        >
          <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
            System health
          </p>
          <h3 className="mt-1 font-display text-[16px] font-800 tracking-tight">
            <Activity className="mr-1 inline h-3.5 w-3.5 text-emerald-500" />
            Live metrics coming soon
          </h3>
          <p className="mt-2 text-[12px] text-[var(--color-muted-foreground)]">
            Pipeline latency, webhook health, and KPI quartet wire up once the
            observability endpoints land. No fixtures shown.
          </p>
        </motion.div>
      </div>

      {/* ═══════════ Manage tiles ═══════════ */}
      <section className="mt-8">
        <p className="mb-3 font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
          Manage
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
          {MANAGE.map((q, i) => (
            <QueueCard key={q.href} tile={q} delay={i * 0.04} />
          ))}
        </div>
      </section>

      {/* Footer note */}
      <p className="mt-10 text-center font-mono text-[10px] text-[var(--color-muted-foreground)]">
        <Sparkles className="mr-1 inline h-3 w-3 text-[var(--color-primary)]" />
        Every action on this page writes to the audit log. Stay sharp.
      </p>
    </div>
  );
}

/* ───────── Pieces ───────── */

function QueueCard({ tile, delay = 0 }: { tile: QueueTile; delay?: number }) {
  const Icon = tile.icon;
  const isLive = tile.status === "live";
  const Wrapper: React.ElementType = isLive ? Link : "div";
  const wrapperProps = isLive ? { href: tile.href } : {};

  return (
    <motion.div
      variants={fadeUp}
      initial="initial"
      animate="animate"
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      <Wrapper
        {...wrapperProps}
        className={`group block rounded-2xl border p-5 transition-all ${
          isLive
            ? "border-[var(--color-border)] bg-[var(--color-card)] hover:-translate-y-0.5 hover:border-[var(--color-primary)]/40"
            : "border-[var(--color-border)] bg-[var(--color-card)]/60 opacity-70"
        }`}
      >
        <div className="mb-3 flex items-center justify-between">
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-lg ${severityBg(
              tile.severity,
            )}`}
          >
            <Icon className={`h-4 w-4 ${severityFg(tile.severity)}`} />
          </span>
          {!isLive && (
            <span className="rounded-full bg-[var(--color-secondary)] px-2 py-0.5 font-mono text-[9px] font-700 uppercase tracking-wider text-[var(--color-muted-foreground)]">
              Soon
            </span>
          )}
          {isLive && tile.count !== null && (
            <span
              className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-700 ${severityChip(
                tile.severity,
              )}`}
            >
              {tile.count}
            </span>
          )}
        </div>
        <p className="font-display text-[15px] font-800 tracking-tight text-[var(--color-foreground)]">
          {tile.title}
        </p>
        <p className="mt-1 text-[12px] text-[var(--color-muted-foreground)]">
          {tile.sub}
        </p>
        {isLive && (
          <p className="mt-3 inline-flex items-center gap-1 font-mono text-[10px] font-700 uppercase tracking-wider text-[var(--color-primary)] opacity-0 transition-opacity group-hover:opacity-100">
            Open <ArrowUpRight className="h-3 w-3" />
          </p>
        )}
      </Wrapper>
    </motion.div>
  );
}

function SeverityDot({ severity }: { severity: Severity }) {
  const classes: Record<Severity, string> = {
    warn: "bg-amber-400/80 ring-amber-400/30",
    error: "bg-rose-500 ring-rose-500/30",
    ok: "bg-emerald-500 ring-emerald-500/30",
    info: "bg-sky-400 ring-sky-400/30",
  };
  return (
    <span className={`h-2 w-2 shrink-0 rounded-full ring-4 ${classes[severity]}`} />
  );
}

function SeverityPill({ severity }: { severity: Severity }) {
  const map: Record<Severity, { label: string; icon: React.ComponentType<{ className?: string }>; cls: string }> = {
    warn: {
      label: "REVIEW",
      icon: Clock,
      cls: "border-amber-400/40 bg-amber-400/10 text-amber-600 dark:text-amber-300",
    },
    error: {
      label: "BLOCK",
      icon: AlertTriangle,
      cls: "border-rose-500/40 bg-rose-500/10 text-rose-500 dark:text-rose-300",
    },
    ok: {
      label: "PASS",
      icon: CheckCircle2,
      cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
    },
    info: {
      label: "INFO",
      icon: FileText,
      cls: "border-sky-400/40 bg-sky-400/10 text-sky-600 dark:text-sky-300",
    },
  };
  const { label, icon: Icon, cls } = map[severity];
  return (
    <span
      className={`hidden items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9px] font-800 uppercase tracking-wider md:inline-flex ${cls}`}
    >
      <Icon className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

/* ───────── Severity color helpers ───────── */

function severityBg(s: Severity): string {
  switch (s) {
    case "warn":
      return "bg-amber-400/10";
    case "error":
      return "bg-rose-500/10";
    case "info":
      return "bg-sky-400/10";
    default:
      return "bg-[var(--color-primary)]/10";
  }
}

function severityFg(s: Severity): string {
  switch (s) {
    case "warn":
      return "text-amber-500 dark:text-amber-300";
    case "error":
      return "text-rose-500 dark:text-rose-300";
    case "info":
      return "text-sky-500 dark:text-sky-300";
    default:
      return "text-[var(--color-primary)]";
  }
}

function severityChip(s: Severity): string {
  switch (s) {
    case "warn":
      return "bg-amber-400/15 text-amber-600 dark:text-amber-300";
    case "error":
      return "bg-rose-500/15 text-rose-500 dark:text-rose-300";
    case "info":
      return "bg-sky-400/15 text-sky-600 dark:text-sky-300";
    default:
      return "bg-[var(--color-primary)]/15 text-[var(--color-primary)]";
  }
}
