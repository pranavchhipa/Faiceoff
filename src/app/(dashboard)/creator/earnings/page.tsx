"use client";

// ─────────────────────────────────────────────────────────────────────────────
// /creator/earnings — Money view for creators
//
// Hero header + 4-pot stat row + lifetime panel + recent payouts ledger +
// "How money moves" 3-step explainer + bank account card. Reads from the
// existing /api/earnings/dashboard, /api/payouts/list, /api/creator/bank-account
// routes — contracts unchanged.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { useCachedFetch } from "@/lib/hooks/use-cached-fetch";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Hourglass,
  IndianRupee,
  Sparkles,
  TrendingUp,
  Wallet,
  Landmark,
  Pencil,
  Loader2,
  ShieldCheck,
  Receipt,
  Lock,
  Send,
  AlertCircle,
} from "lucide-react";

interface EarningsData {
  available_paise: number;
  holding_paise: number;
  pending_count: number;
  lifetime_earned_paise: number;
  min_payout_paise: number;
  can_withdraw: boolean;
}

interface PayoutTxn {
  id: string;
  amount_paise?: number;
  gross_amount_paise?: number;
  net_amount_paise?: number;
  status: "requested" | "processing" | "success" | "failed" | "reversed";
  requested_at?: string;
  completed_at?: string | null;
  bank_account_last4?: string | null;
  cf_transfer_id?: string | null;
  created_at?: string;
}

function relativeFrom(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
};

function fmt(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

const PAYOUT_STATUS: Record<
  PayoutTxn["status"],
  { label: string; tone: "primary" | "success" | "warn" | "danger" | "muted"; pillBg: string; pillText: string; ring: string }
> = {
  requested:  { label: "Requested",  tone: "warn",    pillBg: "bg-amber-500/10",    pillText: "text-amber-600",    ring: "ring-amber-500/20" },
  processing: { label: "Processing", tone: "warn",    pillBg: "bg-sky-500/10",      pillText: "text-sky-600",      ring: "ring-sky-500/20" },
  success:    { label: "Paid",       tone: "success", pillBg: "bg-emerald-500/10",  pillText: "text-emerald-600",  ring: "ring-emerald-500/20" },
  failed:     { label: "Failed",     tone: "danger",  pillBg: "bg-red-500/10",      pillText: "text-red-600",      ring: "ring-red-500/20" },
  reversed:   { label: "Reversed",   tone: "muted",   pillBg: "bg-[var(--color-secondary)]", pillText: "text-[var(--color-muted-foreground)]", ring: "ring-[var(--color-border)]" },
};

export default function CreatorEarningsPage() {
  // Module-scoped cache — tab-back paints instantly from previously fetched
  // data; fresh data lands in the background.
  const { data: earningsData, loading: earningsLoading } = useCachedFetch<{
    available_paise?: number;
    holding_paise?: number;
    pending_count?: number;
    lifetime_earned_paise?: number;
    min_payout_paise?: number;
    can_withdraw?: boolean;
  }>("/api/earnings/dashboard");

  const { data: payoutsData, loading: payoutsLoading } = useCachedFetch<{
    items?: PayoutTxn[];
  }>("/api/payouts/list?pageSize=10");

  const data: EarningsData = {
    available_paise: earningsData?.available_paise ?? 0,
    holding_paise: earningsData?.holding_paise ?? 0,
    pending_count: earningsData?.pending_count ?? 0,
    lifetime_earned_paise: earningsData?.lifetime_earned_paise ?? 0,
    min_payout_paise: earningsData?.min_payout_paise ?? 50_000,
    can_withdraw: earningsData?.can_withdraw ?? false,
  };
  const payouts: PayoutTxn[] = payoutsData?.items ?? [];
  const loading = earningsLoading && payoutsLoading && !earningsData && !payoutsData;

  const minRequired = data.min_payout_paise;
  const remainingToMin = Math.max(0, minRequired - data.available_paise);
  const progressToMin = Math.min(100, Math.round((data.available_paise / Math.max(1, minRequired)) * 100));

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 lg:px-8 lg:py-8">
      {/* ═══════════ Hero ═══════════ */}
      <motion.div
        variants={fadeUp}
        initial="initial"
        animate="animate"
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between"
      >
        <div>
          <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
            <IndianRupee className="mr-1 inline h-3 w-3 text-[var(--color-primary)]" />
            Earnings — escrow-backed
          </p>
          <h1 className="mt-2 font-display text-[34px] font-800 leading-[1.05] tracking-tight text-[var(--color-foreground)] md:text-[40px]">
            Your money,
            <br className="hidden md:block" />
            <span className="text-[var(--color-primary)]"> traced end-to-end.</span>
          </h1>
          <p className="mt-3 max-w-[520px] text-[14px] leading-relaxed text-[var(--color-muted-foreground)]">
            Every approval moves cash through escrow into a 7-day hold, then to your
            available pot. Withdraw to your bank — TDS and fees deducted at source.
          </p>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          <Link
            href="/creator/payouts"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-3.5 py-2.5 text-[12px] font-700 text-[var(--color-foreground)] transition-all hover:border-[var(--color-muted-foreground)]/40 hover:bg-[var(--color-secondary)]"
          >
            <Receipt className="h-3.5 w-3.5" />
            Payout history
          </Link>
          <Link
            href={data.can_withdraw ? "/creator/withdraw" : "#"}
            aria-disabled={!data.can_withdraw}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-700 shadow-[0_4px_14px_-4px_rgba(201,169,110,0.5)] transition-all ${
              data.can_withdraw
                ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:-translate-y-0.5"
                : "pointer-events-none cursor-not-allowed bg-[var(--color-secondary)] text-[var(--color-muted-foreground)]"
            }`}
          >
            <Wallet className="h-3.5 w-3.5" />
            {data.can_withdraw ? "Withdraw" : "Below minimum"}
            {data.can_withdraw && <ArrowRight className="h-3.5 w-3.5" />}
          </Link>
        </div>
      </motion.div>

      {/* ═══════════ Stat row (4 pots) ═══════════ */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          icon={IndianRupee}
          label="Available"
          value={loading ? "—" : fmt(data.available_paise)}
          sub={data.can_withdraw ? "Ready to withdraw" : `Min ${fmt(data.min_payout_paise)}`}
          tone={data.can_withdraw ? "primary" : "default"}
        />
        <Stat
          icon={Hourglass}
          label="Holding"
          value={loading ? "—" : fmt(data.holding_paise)}
          sub="7-day dispute window"
          tone="default"
        />
        <Stat
          icon={Clock}
          label="Pending"
          value={loading ? "—" : String(data.pending_count)}
          sub="awaiting your approval"
          tone={data.pending_count > 0 ? "warn" : "default"}
          href={data.pending_count > 0 ? "/creator/approvals" : undefined}
        />
        <Stat
          icon={TrendingUp}
          label="Lifetime"
          value={loading ? "—" : fmt(data.lifetime_earned_paise)}
          sub="all time, net of fee"
          tone="success"
        />
      </div>

      {/* ═══════════ Lifetime panel + Recent activity ═══════════ */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.45fr] lg:gap-5">
        {/* Lifetime + flow summary */}
        <motion.div
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.45, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]"
        >
          {/* Top accent bar */}
          <div className="h-[3px] w-full bg-[var(--color-primary)]" />

          <div className="p-5">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                <TrendingUp className="h-3.5 w-3.5" />
              </span>
              <p className="font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                Lifetime earned
              </p>
            </div>

            <p className="mt-3 font-display text-[34px] font-800 leading-none tracking-tight text-[var(--color-foreground)]">
              {fmt(data.lifetime_earned_paise)}
            </p>
            <p className="mt-1.5 text-[11px] text-[var(--color-muted-foreground)]">
              Net of platform fee — TDS deducted at withdrawal
            </p>

            {/* Progress to min payout (only if not yet eligible) */}
            {!data.can_withdraw && data.available_paise < data.min_payout_paise && (
              <div className="mt-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]/50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-[10px] font-700 uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
                    Progress to first payout
                  </span>
                  <span className="font-mono text-[10px] font-700 text-[var(--color-foreground)]">
                    {progressToMin}%
                  </span>
                </div>
                <div className="relative h-2 overflow-hidden rounded-full bg-[var(--color-card)]">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progressToMin}%` }}
                    transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-primary)]"
                  />
                </div>
                <p className="mt-2 text-[11px] text-[var(--color-muted-foreground)]">
                  <span className="font-700 text-[var(--color-foreground)]">{fmt(remainingToMin)}</span>{" "}
                  more to unlock — keep approving briefs.
                </p>
              </div>
            )}

            <div className="mt-5 space-y-2.5 border-t border-[var(--color-border)] pt-4">
              <LegendRow label="Available now" value={fmt(data.available_paise)} tone="primary" />
              <LegendRow label="In 7-day hold" value={fmt(data.holding_paise)} />
              <LegendRow
                label="Pending approvals"
                value={String(data.pending_count)}
                tone={data.pending_count > 0 ? "warn" : "default"}
              />
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-[var(--color-border)] pt-4">
              <Link
                href="/creator/payouts"
                className="inline-flex items-center gap-1 text-[12px] font-700 text-[var(--color-primary)] hover:underline"
              >
                View payout history <ArrowRight className="h-3 w-3" />
              </Link>
              <span className="inline-flex items-center gap-1 font-mono text-[10px] font-600 text-[var(--color-muted-foreground)]">
                <ShieldCheck className="h-3 w-3" />
                escrow-secured
              </span>
            </div>
          </div>
        </motion.div>

        {/* Recent activity */}
        <motion.div
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.45, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]"
        >
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
            <div>
              <p className="font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                Recent activity
              </p>
              <h3 className="mt-0.5 font-display text-[18px] font-800 tracking-tight text-[var(--color-foreground)]">
                Payout ledger
              </h3>
            </div>
            <Link
              href="/creator/payouts"
              className="inline-flex items-center gap-1 text-[11px] font-700 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            >
              All payouts <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="divide-y divide-[var(--color-border)]">
            {loading ? (
              <div className="flex items-center justify-center py-14">
                <Loader2 className="h-4 w-4 animate-spin text-[var(--color-muted-foreground)]" />
              </div>
            ) : payouts.length === 0 ? (
              <div className="px-5 py-14 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-secondary)] text-[var(--color-muted-foreground)]">
                  <Send className="h-5 w-5" />
                </div>
                <p className="font-display text-[15px] font-800 tracking-tight text-[var(--color-foreground)]">
                  No payouts yet
                </p>
                <p className="mx-auto mt-1.5 max-w-[280px] text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">
                  Once you withdraw, every transfer shows here with its payment
                  reference and bank info.
                </p>
                {data.can_withdraw ? (
                  <Link
                    href="/creator/withdraw"
                    className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3.5 py-2 text-[12px] font-700 text-[var(--color-primary-foreground)] transition hover:opacity-90"
                  >
                    <Wallet className="h-3.5 w-3.5" />
                    Make your first withdrawal
                  </Link>
                ) : (
                  <p className="mt-3 font-mono text-[10px] font-600 text-[var(--color-muted-foreground)]">
                    {fmt(remainingToMin)} more to unlock
                  </p>
                )}
              </div>
            ) : (
              payouts.map((t) => <PayoutRow key={t.id} txn={t} />)
            )}
          </div>
        </motion.div>
      </div>

      {/* ═══════════ How money moves ═══════════ */}
      <motion.section
        variants={fadeUp}
        initial="initial"
        animate="animate"
        transition={{ duration: 0.45, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="mt-6 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <div>
              <p className="font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                How money moves
              </p>
              <h3 className="mt-0.5 font-display text-[15px] font-800 tracking-tight text-[var(--color-foreground)]">
                From brand brief to your bank
              </h3>
            </div>
          </div>
          <span className="hidden font-mono text-[10px] font-600 text-[var(--color-muted-foreground)] sm:inline">
            3 steps · escrow-backed
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-3">
          <HowItem
            n="1"
            icon={Lock}
            title="Brand pays into escrow"
            body="Funds locked at request time. No generation runs without payment — your work is always covered."
          />
          <HowItem
            n="2"
            icon={CheckCircle2}
            title="You approve the image"
            body="Amount moves to Holding. Released to Available after a 7-day dispute window passes."
          />
          <HowItem
            n="3"
            icon={Wallet}
            title="Withdraw to bank"
            body="Request a payout — TDS auto-deducted at source. Funds arrive in 1-2 business days."
          />
        </div>
      </motion.section>

      {/* ═══════════ Bank Account ═══════════ */}
      <motion.section
        variants={fadeUp}
        initial="initial"
        animate="animate"
        transition={{ duration: 0.45, delay: 0.36, ease: [0.22, 1, 0.36, 1] }}
        className="mt-4"
      >
        <BankAccountSection />
      </motion.section>
    </div>
  );
}

/* ───────────────────── Stat tile (matches brand/collabs/[id]) ───────────────────── */
function Stat({
  icon: Icon,
  label,
  value,
  sub,
  tone = "default",
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "primary" | "warn" | "success";
  href?: string;
}) {
  const toneText = {
    default: "text-[var(--color-foreground)]",
    primary: "text-[var(--color-primary)]",
    warn:    "text-amber-500",
    success: "text-emerald-500",
  } as const;

  const iconBg = {
    default: "bg-[var(--color-secondary)] text-[var(--color-foreground)]",
    primary: "bg-[var(--color-primary)]/10 text-[var(--color-primary)]",
    warn:    "bg-amber-500/10 text-amber-500",
    success: "bg-emerald-500/10 text-emerald-500",
  } as const;

  const Wrapper: React.ElementType = href ? Link : "div";
  const wrapperProps = href ? { href } : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={`group block rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3.5 transition-all ${
        href ? "cursor-pointer hover:-translate-y-0.5 hover:border-[var(--color-muted-foreground)]/40" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${iconBg[tone]}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="font-mono text-[10px] font-700 uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
          {label}
        </span>
        {href && (
          <ArrowUpRight className="ml-auto h-3 w-3 text-[var(--color-muted-foreground)] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        )}
      </div>
      <p className={`mt-2 font-display text-[26px] font-800 leading-none ${toneText[tone]}`}>
        {value}
      </p>
      {sub && (
        <p className="mt-2 font-mono text-[10px] text-[var(--color-muted-foreground)]">
          {sub}
        </p>
      )}
    </Wrapper>
  );
}

/* ───────── Legend row (lifetime panel) ───────── */
function LegendRow({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "primary" | "warn";
}) {
  const valueClass = {
    default: "text-[var(--color-foreground)]",
    primary: "text-[var(--color-primary)]",
    warn:    "text-amber-500",
  } as const;
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px] text-[var(--color-muted-foreground)]">{label}</span>
      <span className={`font-mono text-[12px] font-700 ${valueClass[tone]}`}>
        {value}
      </span>
    </div>
  );
}

/* ───────── Single payout row (recent activity) ───────── */
function PayoutRow({ txn }: { txn: PayoutTxn }) {
  const meta = PAYOUT_STATUS[txn.status] ?? PAYOUT_STATUS.requested;
  const amount = txn.gross_amount_paise ?? txn.amount_paise ?? 0;
  const net = txn.net_amount_paise;
  const when = txn.completed_at ?? txn.requested_at ?? txn.created_at ?? new Date().toISOString();
  const ref =
    txn.cf_transfer_id ??
    txn.id.slice(0, 8).toUpperCase();

  return (
    <div className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[var(--color-secondary)]/40">
      {/* Status icon */}
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ${meta.pillBg} ${meta.pillText} ${meta.ring}`}>
        {txn.status === "success" ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : txn.status === "failed" || txn.status === "reversed" ? (
          <AlertCircle className="h-4 w-4" />
        ) : (
          <Hourglass className="h-4 w-4" />
        )}
      </span>

      {/* Body */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-display text-[13px] font-700 text-[var(--color-foreground)]">
            Payout
            {txn.bank_account_last4 && (
              <span className="ml-1.5 font-mono text-[11px] font-600 text-[var(--color-muted-foreground)]">
                ····{txn.bank_account_last4}
              </span>
            )}
          </p>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9px] font-700 uppercase tracking-[0.12em] ${meta.pillBg} ${meta.pillText}`}>
            {meta.label}
          </span>
        </div>
        <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--color-muted-foreground)]">
          Ref {ref} · {relativeFrom(when)}
        </p>
      </div>

      {/* Amount */}
      <div className="text-right">
        <p className="font-mono text-[13px] font-700 text-[var(--color-foreground)]">
          {fmt(amount)}
        </p>
        {net != null && net !== amount && (
          <p className="mt-0.5 font-mono text-[10px] text-[var(--color-muted-foreground)]">
            net {fmt(net)}
          </p>
        )}
      </div>
    </div>
  );
}

/* ───────── How-it-works step card ───────── */
function HowItem({
  n,
  icon: Icon,
  title,
  body,
}: {
  n: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="group relative rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]/40 p-4 transition-all hover:border-[var(--color-primary)]/30 hover:bg-[var(--color-secondary)]/70">
      <div className="mb-3 flex items-center justify-between">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-primary)] font-mono text-[11px] font-800 text-[var(--color-primary-foreground)] shadow-[0_2px_8px_-2px_rgba(201,169,110,0.5)]">
          {n}
        </span>
        <Icon className="h-4 w-4 text-[var(--color-muted-foreground)] transition-colors group-hover:text-[var(--color-primary)]" />
      </div>
      <h4 className="font-display text-[14px] font-800 leading-tight tracking-tight text-[var(--color-foreground)]">
        {title}
      </h4>
      <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">
        {body}
      </p>
    </div>
  );
}

/* ───────── Bank Account Section ───────── */

interface BankAccount {
  holder_name: string;
  account_number_masked: string;
  ifsc: string;
  added_at: string | null;
}

function BankAccountSection() {
  const [account, setAccount] = useState<BankAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ holder_name: "", account_number: "", ifsc: "" });

  useEffect(() => {
    fetch("/api/creator/bank-account", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : { bank_account: null })
      .then((d) => setAccount(d.bank_account))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/creator/bank-account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Save failed");
      setAccount(d.bank_account);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
            <Landmark className="h-4 w-4" />
          </span>
          <div>
            <p className="font-display text-[14px] font-800 tracking-tight text-[var(--color-foreground)]">
              Bank account for withdrawals
            </p>
            <p className="text-[11px] text-[var(--color-muted-foreground)]">
              {account ? "Used for all payouts — encrypted at rest" : "Add bank details to enable withdrawals"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {account && !editing && (
            <span className="hidden items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 font-mono text-[10px] font-700 uppercase tracking-[0.14em] text-emerald-600 sm:inline-flex">
              <CheckCircle2 className="h-3 w-3" />
              Verified
            </span>
          )}
          {account && !editing && (
            <button
              onClick={() => {
                setForm({ holder_name: account.holder_name, account_number: "", ifsc: account.ifsc });
                setEditing(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-secondary)] px-3 py-1.5 font-mono text-[10px] font-700 uppercase tracking-[0.14em] text-[var(--color-foreground)] transition hover:border-[var(--color-primary)]/40 hover:text-[var(--color-primary)]"
            >
              <Pencil className="h-3 w-3" /> Edit
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-5">
        {loading ? (
          <div className="flex h-12 items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--color-muted-foreground)]" />
          </div>
        ) : !editing && account ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Account holder" value={account.holder_name} />
            <Field label="Account number" value={account.account_number_masked} mono />
            <Field label="IFSC" value={account.ifsc} mono />
          </div>
        ) : !editing && !account ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-secondary)]/40 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
                <AlertCircle className="h-4 w-4" />
              </span>
              <div>
                <p className="font-display text-[14px] font-800 tracking-tight text-[var(--color-foreground)]">
                  No bank account on file
                </p>
                <p className="mt-0.5 text-[12px] text-[var(--color-muted-foreground)]">
                  Add your details to receive payouts. Account number is encrypted (AES-256).
                </p>
              </div>
            </div>
            <button
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3.5 py-2 text-[12px] font-700 text-[var(--color-primary-foreground)] transition hover:-translate-y-0.5"
            >
              <Landmark className="h-3.5 w-3.5" />
              Add bank account
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">
              Account number is encrypted before storage and never re-displayed in
              full — only the last four digits are shown after save.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FormInput
                label="Account holder name"
                placeholder="As per bank records"
                value={form.holder_name}
                onChange={(v) => setForm((f) => ({ ...f, holder_name: v }))}
              />
              <FormInput
                label="Account number"
                placeholder="Digits only"
                value={form.account_number}
                onChange={(v) => setForm((f) => ({ ...f, account_number: v.replace(/\D/g, "") }))}
                maxLength={20}
                mono
              />
              <FormInput
                label="IFSC code"
                placeholder="e.g. SBIN0001234"
                value={form.ifsc}
                onChange={(v) => setForm((f) => ({ ...f, ifsc: v.toUpperCase() }))}
                maxLength={11}
                mono
              />
            </div>
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-500">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-[12px] font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.5)] transition active:scale-[0.98] disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Save bank account
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setError(null);
                }}
                className="inline-flex items-center gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2.5 text-[12px] font-600 text-[var(--color-muted-foreground)] transition hover:text-[var(--color-foreground)]"
              >
                Cancel
              </button>
              <span className="ml-auto inline-flex items-center gap-1 font-mono text-[10px] font-600 text-[var(--color-muted-foreground)]">
                <Lock className="h-3 w-3" />
                AES-256 encrypted
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]/40 p-3.5">
      <p className="font-mono text-[9px] font-700 uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
        {label}
      </p>
      <p className={`mt-1.5 break-all text-[13px] font-700 text-[var(--color-foreground)] ${mono ? "font-mono" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function FormInput({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  mono = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  mono?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block font-mono text-[9px] font-700 uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className={`w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)] px-3 py-2.5 text-[13px] text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)]/50 focus:bg-[var(--color-card)] focus:ring-2 focus:ring-[var(--color-primary)]/20 ${mono ? "font-mono uppercase" : ""}`}
      />
    </div>
  );
}
