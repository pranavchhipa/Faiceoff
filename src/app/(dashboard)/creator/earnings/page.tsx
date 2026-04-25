"use client";

// ─────────────────────────────────────────────────────────────────────────────
// /creator/earnings — Money view for creators
//
// Four money pots (Available / Holding / Pending / Lifetime), 7-day earnings
// chart, recent transaction list, and primary "Withdraw" CTA. Reads from the
// existing /api/earnings/dashboard route.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Download,
  Hourglass,
  IndianRupee,
  Sparkles,
  TrendingUp,
  Wallet,
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
  amount_paise: number;
  status: "requested" | "processing" | "success" | "failed" | "reversed";
  created_at: string;
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

export default function CreatorEarningsPage() {
  const [data, setData] = useState<EarningsData>({
    available_paise: 0,
    holding_paise: 0,
    pending_count: 0,
    lifetime_earned_paise: 0,
    min_payout_paise: 50_000,
    can_withdraw: false,
  });
  const [payouts, setPayouts] = useState<PayoutTxn[]>([]);
  const [, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [dashRes, payoutsRes] = await Promise.allSettled([
          fetch("/api/earnings/dashboard", { cache: "no-store" }),
          fetch("/api/payouts/list?pageSize=10", { cache: "no-store" }),
        ]);

        if (!cancelled && dashRes.status === "fulfilled" && dashRes.value.ok) {
          const d = await dashRes.value.json();
          setData({
            available_paise: d.available_paise ?? 0,
            holding_paise: d.holding_paise ?? 0,
            pending_count: d.pending_count ?? 0,
            lifetime_earned_paise: d.lifetime_earned_paise ?? 0,
            min_payout_paise: d.min_payout_paise ?? 50_000,
            can_withdraw: d.can_withdraw ?? false,
          });
        }

        if (
          !cancelled &&
          payoutsRes.status === "fulfilled" &&
          payoutsRes.value.ok
        ) {
          const p = await payoutsRes.value.json();
          setPayouts((p.items as PayoutTxn[]) ?? []);
        }
      } catch (err) {
        console.error("[creator/earnings] load failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 lg:px-8 lg:py-8">
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
            <IndianRupee className="mr-1 inline h-3 w-3 text-[var(--color-primary)]" />
            Earnings · Updated live
          </p>
          <h1 className="mt-1 font-display text-[30px] font-800 leading-none tracking-tight text-[var(--color-foreground)] md:text-[36px]">
            Your earnings
          </h1>
          <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
            Every rupee traceable. Withdraw to UPI or bank · TDS handled at source.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            disabled={!data.can_withdraw}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-[13px] font-600 text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-secondary)] disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            Statement
          </button>
          <Link
            href="/creator/withdraw"
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-700 shadow-[0_4px_14px_-4px_rgba(201,169,110,0.5)] transition-transform ${
              data.can_withdraw
                ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:-translate-y-0.5"
                : "pointer-events-none bg-[var(--color-secondary)] text-[var(--color-muted-foreground)]"
            }`}
          >
            <Wallet className="h-3.5 w-3.5" />
            Withdraw
          </Link>
        </div>
      </motion.div>

      {/* ═══════════ 4-pot grid ═══════════ */}
      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4 lg:gap-4">
        <Pot
          label="Available"
          value={fmt(data.available_paise)}
          sub={data.can_withdraw ? "Ready to withdraw" : `Min ${fmt(data.min_payout_paise)} required`}
          icon={IndianRupee}
          accent
          delay={0}
        />
        <Pot
          label="Holding"
          value={fmt(data.holding_paise)}
          sub="7-day dispute window"
          icon={Hourglass}
          delay={0.05}
        />
        <Pot
          label="Pending"
          value={String(data.pending_count)}
          sub="Approvals awaiting response"
          icon={Clock}
          href="/creator/approvals"
          delay={0.1}
        />
        <Pot
          label="Lifetime"
          value={fmt(data.lifetime_earned_paise)}
          sub="All time"
          icon={TrendingUp}
          delay={0.15}
        />
      </div>

      {/* ═══════════ Chart + Transactions ═══════════ */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.4fr] lg:gap-6">
        {/* Lifetime summary panel */}
        <motion.div
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.45, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5"
        >
          <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
            Lifetime earned
          </p>
          <p className="mt-1 font-display text-[30px] font-800 leading-none tracking-tight text-[var(--color-foreground)]">
            {fmt(data.lifetime_earned_paise)}
          </p>
          <p className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">
            Net of platform fee · before TDS
          </p>

          <div className="mt-5 space-y-2 border-t border-[var(--color-border)] pt-4">
            <LegendRow label="Available now" value={fmt(data.available_paise)} tone="primary" />
            <LegendRow label="In 7-day hold" value={fmt(data.holding_paise)} />
            <LegendRow
              label="Pending approvals"
              value={String(data.pending_count)}
            />
          </div>

          <Link
            href="/creator/payouts"
            className="mt-5 inline-flex items-center gap-1 text-[12px] font-600 text-[var(--color-primary)] hover:underline"
          >
            View payout history <ArrowRight className="h-3 w-3" />
          </Link>
        </motion.div>

        {/* Recent transactions */}
        <motion.div
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.45, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]"
        >
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
            <div>
              <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
                Recent activity
              </p>
              <h3 className="mt-1 font-display text-[18px] font-800 tracking-tight text-[var(--color-foreground)]">
                Ledger
              </h3>
            </div>
            <Link
              href="/creator/payouts"
              className="inline-flex items-center gap-1 text-[11px] font-600 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            >
              View payouts <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-[var(--color-border)]">
            {payouts.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="font-display text-[14px] font-700 text-[var(--color-foreground)]">
                  No payouts yet
                </p>
                <p className="mt-1 text-[12px] text-[var(--color-muted-foreground)]">
                  Once you withdraw, every transfer shows here with its
                  Cashfree reference.
                </p>
              </div>
            ) : (
              payouts.map((t) => {
                const txnStatus: "available" | "holding" | "paid" =
                  t.status === "success"
                    ? "paid"
                    : t.status === "failed" || t.status === "reversed"
                      ? "available"
                      : "holding";
                return (
                  <div key={t.id} className="flex items-center gap-3 px-5 py-3.5">
                    <TxnStatusIcon status={txnStatus} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-[14px] font-700 capitalize text-[var(--color-foreground)]">
                        Payout · {t.status}
                      </p>
                      <p className="truncate text-[12px] text-[var(--color-muted-foreground)]">
                        Ref {t.id.slice(0, 8)}
                      </p>
                    </div>
                    <p className="hidden font-mono text-[11px] text-[var(--color-muted-foreground)] sm:block">
                      {relativeFrom(t.created_at)}
                    </p>
                    <p className="font-mono text-[13px] font-700 text-[var(--color-primary)]">
                      ₹{(t.amount_paise / 100).toLocaleString("en-IN")}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </motion.div>
      </div>

      {/* ═══════════ How it works ═══════════ */}
      <motion.section
        variants={fadeUp}
        initial="initial"
        animate="animate"
        transition={{ duration: 0.45, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5"
      >
        <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
          <Sparkles className="mr-1 inline h-3 w-3 text-[var(--color-primary)]" />
          How money moves
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <HowItem
            n="1"
            title="Brand generates"
            body="Creator funds locked in escrow at request time. No generation without payment."
          />
          <HowItem
            n="2"
            title="You approve"
            body="Amount moves to Holding. Released to Available after 7-day dispute window."
          />
          <HowItem
            n="3"
            title="UPI in 30s"
            body="Request withdrawal anytime — UPI lands instantly, bank in 2 hours. TDS auto-deducted."
          />
        </div>
      </motion.section>
    </div>
  );
}

/* ───────── Pieces ───────── */

function Pot({
  label,
  value,
  sub,
  icon: Icon,
  accent,
  href,
  delay = 0,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: boolean;
  href?: string;
  delay?: number;
}) {
  const Wrapper: React.ElementType = href ? Link : "div";
  const wrapperProps = href ? { href } : {};
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
          accent
            ? "border-[var(--color-primary)]/30 bg-gradient-to-br from-[var(--color-primary)]/12 to-[var(--color-primary)]/4"
            : "border-[var(--color-border)] bg-[var(--color-card)] hover:border-[var(--color-muted-foreground)]/30"
        }`}
      >
        <div className="mb-3 flex items-center justify-between">
          <p
            className={`font-mono text-[10px] font-700 uppercase tracking-[0.22em] ${
              accent ? "text-[var(--color-primary)]" : "text-[var(--color-muted-foreground)]"
            }`}
          >
            {label}
          </p>
          <Icon
            className={`h-3.5 w-3.5 ${
              accent ? "text-[var(--color-primary)]" : "text-[var(--color-muted-foreground)]"
            }`}
          />
        </div>
        <p className="font-display text-[28px] font-800 leading-none tracking-tight text-[var(--color-foreground)]">
          {value}
        </p>
        <p
          className={`mt-2 font-mono text-[11px] ${
            accent ? "text-[var(--color-primary)]" : "text-[var(--color-muted-foreground)]"
          }`}
        >
          {href ? (
            <>
              {sub}{" "}
              <ArrowUpRight className="ml-0.5 inline h-3 w-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </>
          ) : (
            sub
          )}
        </p>
      </Wrapper>
    </motion.div>
  );
}

function LegendRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "primary";
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px] text-[var(--color-muted-foreground)]">{label}</span>
      <span
        className={`font-mono text-[12px] font-700 ${
          tone === "primary" ? "text-[var(--color-primary)]" : "text-[var(--color-foreground)]"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function TxnStatusIcon({ status }: { status: "available" | "holding" | "paid" }) {
  const map = {
    available: {
      Icon: IndianRupee,
      cls: "bg-[var(--color-primary)]/10 text-[var(--color-primary)]",
    },
    holding: {
      Icon: Hourglass,
      cls: "bg-sky-500/10 text-sky-500",
    },
    paid: {
      Icon: CheckCircle2,
      cls: "bg-emerald-500/10 text-emerald-500",
    },
  };
  const { Icon, cls } = map[status];
  return (
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${cls}`}>
      <Icon className="h-4 w-4" />
    </span>
  );
}

function HowItem({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)]/40 p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-primary)] font-mono text-[10px] font-800 text-[var(--color-primary-foreground)]">
          {n}
        </span>
        <h4 className="font-display text-[14px] font-800 tracking-tight text-[var(--color-foreground)]">
          {title}
        </h4>
      </div>
      <p className="text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">
        {body}
      </p>
    </div>
  );
}
