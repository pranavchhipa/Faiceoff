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

interface HealthItem {
  label: string;
  value: string;
  status: "green" | "yellow" | "red";
}

/* ───────── Mock content ───────── */

const QUEUES: QueueTile[] = [
  {
    href: "/admin/safety",
    title: "Safety review",
    count: 7,
    sub: "Hive flags + policy edges",
    icon: Shield,
    status: "live",
    severity: "warn",
  },
  {
    href: "/admin/stuck-gens",
    title: "Stuck generations",
    count: 3,
    sub: "Pipeline retry tooling",
    icon: AlertTriangle,
    status: "live",
    severity: "error",
  },
  {
    href: "/admin/disputes",
    title: "Disputes",
    count: 1,
    sub: "Brand ↔ creator resolution",
    icon: Flag,
    status: "soon",
    severity: "warn",
  },
  {
    href: "/admin/kyc-queue",
    title: "KYC queue",
    count: 4,
    sub: "PAN + bank verification",
    icon: IdCard,
    status: "soon",
    severity: "info",
  },
];

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

const TRIAGE_ROWS: TriageRow[] = [
  {
    id: "t1",
    title: "OnePlus · Nord launch",
    subtitle: "Hive flag · brand logo over-saturation",
    meta: "2h ago · Priya",
    severity: "warn",
    href: "/admin/safety",
  },
  {
    id: "t2",
    title: "Starbucks India · Café",
    subtitle: "Compliance check failed · blocked concept",
    meta: "3h ago · Meera",
    severity: "error",
    href: "/admin/safety",
  },
  {
    id: "t3",
    title: "Gen #g_4188 stuck",
    subtitle: "Replicate timeout · retry available",
    meta: "1h ago · LoRA v3",
    severity: "error",
    href: "/admin/stuck-gens",
  },
  {
    id: "t4",
    title: "Priya · reference re-train",
    subtitle: "LoRA retrain requested · 28 new photos",
    meta: "4h ago",
    severity: "warn",
    href: "/admin/safety",
  },
  {
    id: "t5",
    title: "Arjun · KYC update",
    subtitle: "PAN change submitted · needs approval",
    meta: "5h ago",
    severity: "info",
    href: "/admin/safety",
  },
];

const HEALTH: HealthItem[] = [
  { label: "Inngest queue", value: "All green · 0 backlog", status: "green" },
  { label: "Replicate API", value: "94ms avg · healthy", status: "green" },
  { label: "Cashfree webhook", value: "200/200 last hr", status: "green" },
  { label: "Hive moderation", value: "7 flags pending", status: "yellow" },
];

const KPIS = [
  { label: "Active creators", value: "142", delta: "+6 this week", tone: "up" as const },
  { label: "Brands", value: "38", delta: "+2 this week", tone: "up" as const },
  { label: "Generations / 24h", value: "94", delta: "98% pass rate", tone: "neutral" as const },
  { label: "GMV · month", value: "₹4.2L", delta: "+12% MoM", tone: "up" as const },
];

/* ───────── Page ───────── */

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
};

export default function AdminHomePage() {
  const totalPending = QUEUES.reduce((s, q) => s + (q.count ?? 0), 0);

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
            {TRIAGE_ROWS.map((row) => (
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
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-[var(--color-border)] px-5 py-3">
            <p className="font-mono text-[10px] text-[var(--color-muted-foreground)]">
              {TRIAGE_ROWS.length} of {totalPending} showing
            </p>
            <Link
              href="/admin/safety"
              className="inline-flex items-center gap-1 text-[11px] font-600 text-[var(--color-foreground)] hover:text-[var(--color-primary)]"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </motion.div>

        {/* Right column: Health + KPIs */}
        <div className="flex flex-col gap-4">
          {/* Health panel */}
          <motion.div
            variants={fadeUp}
            initial="initial"
            animate="animate"
            transition={{ duration: 0.45, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5"
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
                  System health
                </p>
                <h3 className="mt-1 font-display text-[16px] font-800 tracking-tight">
                  <Activity className="mr-1 inline h-3.5 w-3.5 text-emerald-500" />
                  All systems nominal
                </h3>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {HEALTH.map((h) => (
                <div
                  key={h.label}
                  className="flex items-center justify-between rounded-lg border border-[var(--color-border)]/60 bg-[var(--color-background)]/40 px-3 py-2"
                >
                  <span className="flex items-center gap-2 text-[12px] font-600 text-[var(--color-foreground)]">
                    <StatusDot status={h.status} />
                    {h.label}
                  </span>
                  <span className="font-mono text-[11px] text-[var(--color-muted-foreground)]">
                    {h.value}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* KPI quartet */}
          <motion.div
            variants={fadeUp}
            initial="initial"
            animate="animate"
            transition={{ duration: 0.45, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="grid grid-cols-2 gap-3"
          >
            {KPIS.map((k) => (
              <div
                key={k.label}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4"
              >
                <p className="font-mono text-[9px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
                  {k.label}
                </p>
                <p className="mt-1.5 font-display text-[22px] font-800 leading-none tracking-tight text-[var(--color-foreground)]">
                  {k.value}
                </p>
                <p
                  className={`mt-1 font-mono text-[10px] ${
                    k.tone === "up"
                      ? "text-emerald-500"
                      : "text-[var(--color-muted-foreground)]"
                  }`}
                >
                  {k.delta}
                </p>
              </div>
            ))}
          </motion.div>
        </div>
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

function StatusDot({ status }: { status: "green" | "yellow" | "red" }) {
  const cls =
    status === "green"
      ? "bg-emerald-500"
      : status === "yellow"
      ? "bg-amber-400"
      : "bg-rose-500";
  return (
    <span className={`h-1.5 w-1.5 rounded-full ${cls} shadow-[0_0_0_3px_rgba(16,185,129,0.1)]`} />
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
