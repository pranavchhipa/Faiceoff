"use client";

// ─────────────────────────────────────────────────────────────────────────────
// /creator/earnings — Single merged money section for creators
//
// Earnings + Withdraw are now ONE page. Creators can NO LONGER withdraw
// themselves — they add a bank account, then "Request payout" and an operator
// pays them manually within 1-2 business days.
//
// Sections:
//   1. Earnings overview  — Available / Clearing / Lifetime earned
//   2. Bank account card  — GET/PUT /api/creator/bank-account
//   3. Payout card        — GET/POST /api/creator/payout-request (manual model)
//   4. Payout history     — GET /api/payouts/list
//
// Dark-only: canonical CSS-var tokens only, no hardcoded light colors.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { useCachedFetch } from "@/lib/hooks/use-cached-fetch";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  Hourglass,
  IndianRupee,
  TrendingUp,
  Wallet,
  Landmark,
  Pencil,
  Loader2,
  Send,
  AlertCircle,
  Lock,
  Banknote,
} from "lucide-react";

// ───────────────────────── helpers ─────────────────────────

function fmt(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
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

// ───────────────────────── types ─────────────────────────

interface EarningsData {
  available_paise: number;
  holding_paise: number;
  pending_count: number;
  lifetime_earned_paise: number;
  min_payout_paise: number;
}

interface PayoutState {
  available_paise: number;
  min_payout_paise: number;
  has_bank: boolean;
  open_request: { id: string; amount_paise: number; status: string; requested_at: string } | null;
  can_request: boolean;
}

interface PayoutTxn {
  id: string;
  gross_amount_paise?: number;
  net_amount_paise?: number;
  status: "requested" | "processing" | "success" | "failed" | "reversed";
  requested_at?: string;
  completed_at?: string | null;
  bank_account_last4?: string | null;
}

interface BankAccount {
  holder_name: string;
  account_number_masked: string;
  ifsc: string;
  added_at: string | null;
}

const PAYOUT_STATUS: Record<
  PayoutTxn["status"],
  { label: string; pillBg: string; pillText: string; ring: string }
> = {
  requested:  { label: "Requested",  pillBg: "bg-amber-500/10",   pillText: "text-amber-500",   ring: "ring-amber-500/20" },
  processing: { label: "Processing", pillBg: "bg-sky-500/10",     pillText: "text-sky-500",     ring: "ring-sky-500/20" },
  success:    { label: "Paid",       pillBg: "bg-emerald-500/10", pillText: "text-emerald-500", ring: "ring-emerald-500/20" },
  failed:     { label: "Failed",     pillBg: "bg-red-500/10",     pillText: "text-red-500",     ring: "ring-red-500/20" },
  reversed:   { label: "Reversed",   pillBg: "bg-[var(--color-secondary)]", pillText: "text-[var(--color-muted-foreground)]", ring: "ring-[var(--color-border)]" },
};

// ───────────────────────── page ─────────────────────────

export default function CreatorEarningsPage() {
  const { data: earningsData, loading: earningsLoading } = useCachedFetch<Partial<EarningsData>>(
    "/api/earnings/dashboard",
  );
  const { data: payoutsData, loading: payoutsLoading } = useCachedFetch<{ items?: PayoutTxn[] }>(
    "/api/payouts/list?pageSize=10",
  );

  const data: EarningsData = {
    available_paise: earningsData?.available_paise ?? 0,
    holding_paise: earningsData?.holding_paise ?? 0,
    pending_count: earningsData?.pending_count ?? 0,
    lifetime_earned_paise: earningsData?.lifetime_earned_paise ?? 0,
    min_payout_paise: earningsData?.min_payout_paise ?? 50_000,
  };

  const payouts: PayoutTxn[] = payoutsData?.items ?? [];
  const overviewLoading = earningsLoading && !earningsData;
  const historyLoading = payoutsLoading && !payoutsData;

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 lg:px-8 lg:py-8">
      {/* ═══════════ Hero ═══════════ */}
      <motion.div
        variants={fadeUp}
        initial="initial"
        animate="animate"
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mb-8"
      >
        <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
          <IndianRupee className="mr-1 inline h-3 w-3 text-[var(--color-primary)]" />
          Earnings
        </p>
        <h1 className="mt-2 font-display text-[34px] font-800 leading-[1.05] tracking-tight text-[var(--color-foreground)] md:text-[40px]">
          Your money,
          <span className="text-[var(--color-primary)]"> in one place.</span>
        </h1>
        <p className="mt-3 max-w-[560px] text-[14px] leading-relaxed text-[var(--color-muted-foreground)]">
          Approved work clears to your available balance after a 7-day hold. Add your bank
          once, then request a payout — we transfer it to you manually.
        </p>
      </motion.div>

      {/* ═══════════ Earnings overview — 3 stat cards ═══════════ */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          icon={IndianRupee}
          label="Available"
          value={overviewLoading ? "—" : fmt(data.available_paise)}
          sub="Ready to request"
          tone="primary"
        />
        <Stat
          icon={Hourglass}
          label="Clearing"
          value={overviewLoading ? "—" : fmt(data.holding_paise)}
          sub="7-day hold after approval"
          tone="default"
        />
        <Stat
          icon={TrendingUp}
          label="Lifetime earned"
          value={overviewLoading ? "—" : fmt(data.lifetime_earned_paise)}
          sub="all time"
          tone="success"
        />
      </div>

      {/* ═══════════ Bank + Payout (two-up on desktop) ═══════════ */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        <motion.section
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.45, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
        >
          <BankAccountCard />
        </motion.section>

        <motion.section
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.45, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          <PayoutCard />
        </motion.section>
      </div>

      {/* ═══════════ Payout history ═══════════ */}
      <motion.section
        variants={fadeUp}
        initial="initial"
        animate="animate"
        transition={{ duration: 0.45, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
        className="mt-5 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <div>
            <p className="font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
              History
            </p>
            <h3 className="mt-0.5 font-display text-[18px] font-800 tracking-tight text-[var(--color-foreground)]">
              Past payouts
            </h3>
          </div>
        </div>

        <div className="divide-y divide-[var(--color-border)]">
          {historyLoading ? (
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
              <p className="mx-auto mt-1.5 max-w-[300px] text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">
                Once you request a payout and we transfer it, every payment shows here with its
                status and bank info.
              </p>
            </div>
          ) : (
            payouts.map((t) => <PayoutRow key={t.id} txn={t} />)
          )}
        </div>
      </motion.section>
    </div>
  );
}

/* ───────────────────── Stat tile ───────────────────── */
function Stat({
  icon: Icon,
  label,
  value,
  sub,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "primary" | "success";
}) {
  const toneText = {
    default: "text-[var(--color-foreground)]",
    primary: "text-[var(--color-primary)]",
    success: "text-emerald-500",
  } as const;

  const iconBg = {
    default: "bg-[var(--color-secondary)] text-[var(--color-foreground)]",
    primary: "bg-[var(--color-primary)]/10 text-[var(--color-primary)]",
    success: "bg-emerald-500/10 text-emerald-500",
  } as const;

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${iconBg[tone]}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="font-mono text-[10px] font-700 uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
          {label}
        </span>
      </div>
      <p className={`mt-2.5 font-display text-[26px] font-800 leading-none ${toneText[tone]}`}>
        {value}
      </p>
      {sub && (
        <p className="mt-2 font-mono text-[10px] text-[var(--color-muted-foreground)]">{sub}</p>
      )}
    </div>
  );
}

/* ───────────────────── Single payout row ───────────────────── */
function PayoutRow({ txn }: { txn: PayoutTxn }) {
  const meta = PAYOUT_STATUS[txn.status] ?? PAYOUT_STATUS.requested;
  const amount = txn.net_amount_paise ?? txn.gross_amount_paise ?? 0;
  const when = txn.completed_at ?? txn.requested_at ?? new Date().toISOString();

  return (
    <div className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[var(--color-secondary)]/40">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ${meta.pillBg} ${meta.pillText} ${meta.ring}`}
      >
        {txn.status === "success" ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : txn.status === "failed" || txn.status === "reversed" ? (
          <AlertCircle className="h-4 w-4" />
        ) : (
          <Hourglass className="h-4 w-4" />
        )}
      </span>

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
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9px] font-700 uppercase tracking-[0.12em] ${meta.pillBg} ${meta.pillText}`}
          >
            {meta.label}
          </span>
        </div>
        <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--color-muted-foreground)]">
          {relativeFrom(when)}
        </p>
      </div>

      <p className="font-mono text-[13px] font-700 text-[var(--color-foreground)]">{fmt(amount)}</p>
    </div>
  );
}

/* ═══════════════════════ Bank Account card ═══════════════════════ */

function BankAccountCard() {
  const [account, setAccount] = useState<BankAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState({ holder_name: "", account_number: "", ifsc: "" });

  useEffect(() => {
    fetch("/api/creator/bank-account", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { bank_account: null }))
      .then((d) => setAccount(d.bank_account))
      .finally(() => setLoading(false));
  }, []);

  // Client-side validation mirroring the server contract.
  const accountValid = /^\d{9,20}$/.test(form.account_number);
  const ifscValid = /^[A-Z]{4}0[A-Z0-9]{6}$/.test(form.ifsc);
  const holderValid = form.holder_name.trim().length >= 2;
  const formValid = accountValid && ifscValid && holderValid;

  async function handleSave() {
    setError(null);
    if (!formValid) {
      setError(
        !holderValid
          ? "Enter the account holder name."
          : !accountValid
            ? "Account number must be 9–20 digits."
            : "IFSC looks invalid — format like SBIN0001234.",
      );
      return;
    }
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
      setSuccess(true);
      // Bank now exists — let the payout card re-check eligibility.
      window.dispatchEvent(new Event("faiceoff:bank-updated"));
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
            <Landmark className="h-4 w-4" />
          </span>
          <div>
            <p className="font-display text-[14px] font-800 tracking-tight text-[var(--color-foreground)]">
              Bank account
            </p>
            <p className="text-[11px] text-[var(--color-muted-foreground)]">
              {account ? "Where payouts land — encrypted at rest" : "Add to enable payouts"}
            </p>
          </div>
        </div>

        {account && !editing && (
          <button
            onClick={() => {
              setForm({ holder_name: account.holder_name, account_number: "", ifsc: account.ifsc });
              setError(null);
              setEditing(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-secondary)] px-3 py-1.5 font-mono text-[10px] font-700 uppercase tracking-[0.14em] text-[var(--color-foreground)] transition hover:border-[var(--color-primary)]/40 hover:text-[var(--color-primary)]"
          >
            <Pencil className="h-3 w-3" /> Update bank
          </button>
        )}
      </div>

      {/* Body */}
      <div className="p-5">
        {loading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--color-muted-foreground)]" />
          </div>
        ) : !editing && account ? (
          <div className="space-y-3">
            {success && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-500">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                Bank account saved.
              </div>
            )}
            <Field label="Account holder" value={account.holder_name} />
            <Field label="Account number" value={account.account_number_masked} mono />
            <Field label="IFSC" value={account.ifsc} mono />
          </div>
        ) : !editing && !account ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-secondary)]/40 p-5">
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
              onClick={() => {
                setError(null);
                setEditing(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3.5 py-2 text-[12px] font-700 text-[var(--color-primary-foreground)] transition hover:-translate-y-0.5"
            >
              <Landmark className="h-3.5 w-3.5" />
              Add bank account
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-3">
              <FormInput
                label="Account holder name"
                placeholder="As per bank records"
                value={form.holder_name}
                onChange={(v) => setForm((f) => ({ ...f, holder_name: v }))}
              />
              <FormInput
                label="Account number"
                placeholder="9–20 digits"
                value={form.account_number}
                onChange={(v) => setForm((f) => ({ ...f, account_number: v.replace(/\D/g, "") }))}
                maxLength={20}
                mono
              />
              <FormInput
                label="IFSC code"
                placeholder="e.g. SBIN0001234"
                value={form.ifsc}
                onChange={(v) => setForm((f) => ({ ...f, ifsc: v.toUpperCase().replace(/[^A-Z0-9]/g, "") }))}
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
              {account && (
                <button
                  onClick={() => {
                    setEditing(false);
                    setError(null);
                  }}
                  className="inline-flex items-center gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2.5 text-[12px] font-600 text-[var(--color-muted-foreground)] transition hover:text-[var(--color-foreground)]"
                >
                  Cancel
                </button>
              )}
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

/* ═══════════════════════ Payout card ═══════════════════════ */

function PayoutCard() {
  const [state, setState] = useState<PayoutState | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/creator/payout-request", { cache: "no-store" });
      if (res.ok) setState(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Re-check eligibility right after a bank account is saved.
    const onBank = () => load();
    window.addEventListener("faiceoff:bank-updated", onBank);
    return () => window.removeEventListener("faiceoff:bank-updated", onBank);
  }, [load]);

  async function handleRequest() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/creator/payout-request", { method: "POST" });
      const d = await res.json();
      if (!res.ok) {
        setError(
          d.message ??
            (d.error === "add_bank_first"
              ? "Add your bank account first."
              : d.error === "below_minimum"
                ? "You're below the minimum payout."
                : d.error === "request_pending"
                  ? "You already have a payout being processed."
                  : "Couldn't request a payout. Try again."),
        );
        // Refresh state — e.g. a pending request created elsewhere.
        await load();
        return;
      }
      await load();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const min = state?.min_payout_paise ?? 50_000;
  const available = state?.available_paise ?? 0;
  const remainingToMin = Math.max(0, min - available);
  const open = state?.open_request ?? null;

  return (
    <div className="h-full overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]">
      <div className="h-[3px] w-full bg-[var(--color-primary)]" />
      <div className="flex items-center gap-2.5 border-b border-[var(--color-border)] px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
          <Wallet className="h-4 w-4" />
        </span>
        <div>
          <p className="font-display text-[14px] font-800 tracking-tight text-[var(--color-foreground)]">
            Request a payout
          </p>
          <p className="text-[11px] text-[var(--color-muted-foreground)]">
            We transfer payouts to your bank manually within 1–2 business days — you don&rsquo;t
            withdraw yourself.
          </p>
        </div>
      </div>

      <div className="p-5">
        {loading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--color-muted-foreground)]" />
          </div>
        ) : (
          <>
            {/* Available amount */}
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]/50 p-4">
              <p className="font-mono text-[10px] font-700 uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
                Available to request
              </p>
              <p className="mt-1.5 font-display text-[32px] font-800 leading-none tracking-tight text-[var(--color-primary)]">
                {fmt(available)}
              </p>
            </div>

            {error && (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-500">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </div>
            )}

            {/* State machine: pending → no-bank → below-min → ready */}
            {open ? (
              <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                <div className="flex items-center gap-2">
                  <Hourglass className="h-4 w-4 text-amber-500" />
                  <p className="font-display text-[14px] font-800 tracking-tight text-[var(--color-foreground)]">
                    Payout requested — we&rsquo;re processing it
                  </p>
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">
                  <span className="font-700 text-[var(--color-foreground)]">
                    {fmt(open.amount_paise)}
                  </span>{" "}
                  requested {relativeFrom(open.requested_at)}. We&rsquo;ll transfer it to your bank
                  within 1–2 business days.
                </p>
              </div>
            ) : !state?.has_bank ? (
              <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]/40 p-4">
                <div className="flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-[var(--color-muted-foreground)]" />
                  <p className="font-display text-[13px] font-700 text-[var(--color-foreground)]">
                    Add a bank account first
                  </p>
                </div>
                <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">
                  Use the bank card to add your account, then request a payout here.
                </p>
              </div>
            ) : available < min ? (
              <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]/40 p-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-[var(--color-muted-foreground)]" />
                  <p className="font-display text-[13px] font-700 text-[var(--color-foreground)]">
                    {fmt(remainingToMin)} more to reach the {fmt(min)} minimum
                  </p>
                </div>
                <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">
                  Keep approving briefs — each clears to available after the 7-day hold.
                </p>
              </div>
            ) : (
              <>
                <button
                  onClick={handleRequest}
                  disabled={submitting || !state?.can_request}
                  className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-4 py-3 text-[13px] font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.5)] transition-all hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Requesting…
                    </>
                  ) : (
                    <>
                      <Banknote className="h-3.5 w-3.5" />
                      Request payout of {fmt(available)}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
                <p className="mt-3 text-[11px] leading-relaxed text-[var(--color-muted-foreground)]">
                  Requesting locks your available balance to this payout. An operator transfers it
                  to your bank manually.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ───────────────────── shared form bits ───────────────────── */

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
