"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wallet,
  Loader2,
  Lock,
  ShieldCheck,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCcw,
  Receipt,
  Info,
  TrendingUp,
  Zap,
  Inbox,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { invalidateCache } from "@/lib/hooks/use-cached-fetch";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface WalletBalance {
  wallet_balance_paise: number;
  wallet_reserved_paise: number;
  wallet_available_paise: number;
  lifetime_topup_paise: number;
  credits_remaining: number;
  credits_lifetime_purchased: number;
}

export interface WalletTransaction {
  id: string;
  type: string;
  amount_paise: number;
  balance_after_paise: number;
  reference_type: string | null;
  description: string | null;
  created_at: string;
}

interface Props {
  initialBalance: WalletBalance;
  initialTransactions: WalletTransaction[];
}

interface WalletTopUpResponse {
  orderId: string;
  keyId: string;
  amount_paise: number;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open(): void };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatINR(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function formatINRDecimal(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = Math.floor((now - d.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function loadRazorpaySDK(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) { resolve(); return; }
    if (document.querySelector('script[src*="checkout.razorpay.com"]')) {
      const existing = document.querySelector(
        'script[src*="checkout.razorpay.com"]',
      ) as HTMLScriptElement;
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Failed to load Razorpay SDK")),
      );
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Razorpay SDK"));
    document.head.appendChild(script);
  });
}

// Quick-pick top-up amounts (rupees)
const QUICK_AMOUNTS = [
  { label: "₹1,000", value: 1000 },
  { label: "₹5,000", value: 5000 },
  { label: "₹10,000", value: 10000 },
  { label: "₹50,000", value: 50000 },
];

// Transaction type metadata — used in ledger row + filter chips.
const TX_TYPE_META: Record<
  string,
  { label: string; tone: "credit" | "debit" | "neutral" | "warn" }
> = {
  topup:           { label: "Wallet top-up",     tone: "credit" },
  bonus:           { label: "Bonus credit",      tone: "credit" },
  refund:          { label: "Refund",            tone: "credit" },
  release_reserve: { label: "Reserve released",  tone: "credit" },
  reserve:         { label: "Held in escrow",    tone: "neutral" },
  spend:           { label: "Creator payment",   tone: "debit" },
  withdraw:        { label: "Withdrawal",        tone: "debit" },
  adjustment:      { label: "Adjustment",        tone: "warn" },
  collab_payment:  { label: "Collab payment",    tone: "debit" },
};

function txMeta(type: string) {
  return (
    TX_TYPE_META[type] ?? {
      label: type.replace(/_/g, " "),
      tone: "neutral" as const,
    }
  );
}

function isCreditTx(type: string): boolean {
  return ["topup", "bonus", "refund", "release_reserve"].includes(type);
}

// ── Main component ────────────────────────────────────────────────────────────

export function WalletTopup({ initialBalance, initialTransactions }: Props) {
  const [amountRupees, setAmountRupees] = useState(5000);
  const [customAmount, setCustomAmount] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [balance, setBalance] = useState<WalletBalance>(initialBalance);
  const [transactions, setTransactions] = useState<WalletTransaction[]>(
    initialTransactions,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | "credit" | "debit">("all");

  const effectiveAmount = useCustom
    ? Math.max(0, parseInt(customAmount || "0", 10))
    : amountRupees;

  useEffect(() => {
    loadRazorpaySDK().catch(() => {
      // pre-load is best-effort
    });
  }, []);

  const refreshBalance = useCallback(async () => {
    setRefreshing(true);
    // Drop any module-level cached entries so other dashboard pages re-fetch
    // on next visit.
    invalidateCache("/api/billing/balance");
    invalidateCache("/api/dashboard/stats");
    try {
      const [balRes, txRes] = await Promise.all([
        fetch("/api/billing/balance", { cache: "no-store" }),
        fetch("/api/credits/balance", { cache: "no-store" }),
      ]);
      if (balRes.ok) {
        const data = (await balRes.json()) as WalletBalance &
          Record<string, unknown>;
        setBalance((prev) => ({
          ...prev,
          wallet_balance_paise: data.wallet_balance_paise ?? prev.wallet_balance_paise,
          wallet_reserved_paise: data.wallet_reserved_paise ?? prev.wallet_reserved_paise,
          wallet_available_paise: data.wallet_available_paise ?? prev.wallet_available_paise,
          lifetime_topup_paise: data.lifetime_topup_paise ?? prev.lifetime_topup_paise,
        }));
      }
      if (txRes.ok) {
        const data = (await txRes.json()) as {
          credits_balance_paise?: number;
          credits_remaining?: number;
          recent_transactions?: WalletTransaction[];
        };
        if (data.recent_transactions && Array.isArray(data.recent_transactions)) {
          setTransactions(data.recent_transactions);
        }
      }
    } catch {
      // best-effort
    } finally {
      setRefreshing(false);
    }
  }, []);

  async function handleTopUp() {
    if (isLoading) return;
    if (effectiveAmount < 500) {
      toast.error("Minimum top-up is ₹500");
      return;
    }
    if (effectiveAmount > 500000) {
      toast.error("Maximum top-up is ₹5,00,000");
      return;
    }
    setIsLoading(true);

    try {
      await loadRazorpaySDK();

      const amountPaise = effectiveAmount * 100;
      const res = await fetch("/api/wallet/top-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_paise: amountPaise }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        const msg =
          body.error === "no_brand_profile"
            ? "Brand profile not found — please complete setup first"
            : body.error === "invalid_input"
            ? "Invalid amount. Minimum ₹500, maximum ₹5,00,000."
            : body.error === "db_error"
            ? "Database error. Please try again in a moment."
            : "Payment initiation failed. Please try again.";
        toast.error(msg);
        return;
      }

      const data = (await res.json()) as WalletTopUpResponse;

      if (!window.Razorpay) {
        toast.error("Payment SDK not loaded. Please refresh and try again.");
        return;
      }

      const rzp = new window.Razorpay({
        key: data.keyId,
        amount: data.amount_paise,
        currency: "INR",
        order_id: data.orderId,
        name: "Faiceoff",
        description: "Wallet top-up",
        theme: { color: "#C9A96E" },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          try {
            await fetch("/api/wallet/confirm-topup", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(response),
            });
            toast.success(
              `Wallet topped up with ${formatINR(data.amount_paise)}!`,
            );
            setTimeout(refreshBalance, 1000);
          } catch {
            toast.info("Payment received — balance will update shortly.");
            setTimeout(refreshBalance, 3000);
          }
        },
      });

      rzp.open();
    } catch (err) {
      console.error("[wallet-topup] handleTopUp error:", err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  // ── Filtered ledger ─────────────────────────────────────────────────────────
  const filteredTx = useMemo(() => {
    if (filter === "all") return transactions;
    return transactions.filter((t) => {
      const isCredit = isCreditTx(t.type);
      return filter === "credit" ? isCredit : !isCredit;
    });
  }, [transactions, filter]);

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 lg:px-8 lg:py-8">
      {/* ═══ Hero header ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
            <Wallet className="mr-1 inline h-3 w-3 text-[var(--color-primary)]" />
            Wallet · single pool of credits
          </p>
          <h1 className="mt-1 font-display text-[34px] font-800 leading-[1.05] tracking-tight text-[var(--color-foreground)] sm:text-[40px]">
            Wallet
            <span className="text-[var(--color-primary)]">.</span>
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[var(--color-muted-foreground)]">
            One INR balance funds every collab. Held in escrow when you start a
            collab — released to creators on approval, refunded on rejection.
          </p>
        </div>

        <button
          type="button"
          onClick={refreshBalance}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-[var(--radius-button)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-[12px] font-600 text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-secondary)] disabled:opacity-50"
        >
          <RefreshCcw
            className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </motion.div>

      {/* ═══ 3-stat row (matches collabs/[id] gold-standard) ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.04, ease: [0.22, 1, 0.36, 1] }}
        className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3"
      >
        <Stat
          icon={Wallet}
          label="Available"
          value={formatINR(balance.wallet_available_paise)}
          sub={
            balance.wallet_available_paise > 0
              ? "ready to spend"
              : "top up to start"
          }
          tone="primary"
        />
        <Stat
          icon={Lock}
          label="In escrow"
          value={formatINR(balance.wallet_reserved_paise)}
          sub={
            balance.wallet_reserved_paise > 0
              ? "held against active collabs"
              : "nothing reserved"
          }
          tone={balance.wallet_reserved_paise > 0 ? "warn" : "default"}
        />
        <Stat
          icon={TrendingUp}
          label="Lifetime topped up"
          value={formatINR(balance.lifetime_topup_paise)}
          sub="across all top-ups"
          tone="default"
        />
      </motion.div>

      {/* ═══ Top-up card + side panel ═══ */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
        {/* ── Top-up panel ── */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 sm:p-6 lg:col-span-2"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
                Add funds
              </p>
              <p className="mt-0.5 text-[13px] text-[var(--color-foreground)]">
                Pay via UPI, NetBanking, or card — credited instantly.
              </p>
            </div>
          </div>

          {/* Quick-pick chips */}
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {QUICK_AMOUNTS.map((q) => {
              const active = !useCustom && amountRupees === q.value;
              return (
                <button
                  key={q.value}
                  type="button"
                  onClick={() => {
                    setUseCustom(false);
                    setAmountRupees(q.value);
                  }}
                  className={`group flex flex-col items-start rounded-xl border px-3 py-2.5 text-left transition-all ${
                    active
                      ? "border-[var(--color-primary)]/50 bg-[var(--color-primary)]/10 shadow-[0_0_0_1px_rgba(201,169,110,0.18)]"
                      : "border-[var(--color-border)] bg-[var(--color-secondary)]/40 hover:border-[var(--color-primary)]/30 hover:bg-[var(--color-secondary)]/70"
                  }`}
                >
                  <span className="font-display text-[16px] font-800 tracking-tight text-[var(--color-foreground)]">
                    {q.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Custom amount toggle */}
          <button
            type="button"
            onClick={() => setUseCustom((v) => !v)}
            className={`mb-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[10px] font-700 uppercase tracking-wider transition-colors ${
              useCustom
                ? "bg-[var(--color-primary)]/12 text-[var(--color-primary)]"
                : "bg-[var(--color-secondary)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            }`}
          >
            <Plus className="h-3 w-3" />
            {useCustom ? "Custom amount" : "Enter custom amount"}
          </button>

          {useCustom && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]/40 px-3 py-2.5">
              <span className="font-display text-[18px] font-800 text-[var(--color-muted-foreground)]">
                ₹
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={500}
                max={500000}
                placeholder="Enter amount (₹500 — ₹5,00,000)"
                value={customAmount}
                onChange={(e) =>
                  setCustomAmount(e.target.value.replace(/[^0-9]/g, ""))
                }
                className="flex-1 bg-transparent font-display text-[18px] font-700 tracking-tight text-[var(--color-foreground)] placeholder:font-display placeholder:text-[12px] placeholder:font-500 placeholder:text-[var(--color-muted-foreground)] focus:outline-none"
                autoFocus
              />
            </div>
          )}

          {/* Live breakdown */}
          <motion.div
            key={`${effectiveAmount}-${useCustom}`}
            initial={{ opacity: 0.7 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]/40 p-4"
          >
            <div className="mb-2 flex items-center justify-between text-[13px]">
              <span className="text-[var(--color-muted-foreground)]">You pay</span>
              <span className="font-display font-700 text-[var(--color-foreground)]">
                {formatINR(effectiveAmount * 100)}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-2.5 text-[14px]">
              <span className="font-600 text-[var(--color-foreground)]">
                Wallet credit
              </span>
              <span className="font-display text-[18px] font-800 tracking-tight text-[var(--color-primary)]">
                {formatINR(effectiveAmount * 100)}
              </span>
            </div>
          </motion.div>

          {/* CTA */}
          <button
            type="button"
            onClick={handleTopUp}
            disabled={isLoading || effectiveAmount < 500}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-[var(--radius-button)] bg-[var(--color-primary)] px-4 py-3 font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.5)] transition-all hover:-translate-y-0.5 hover:shadow-[0_6px_18px_-4px_rgba(201,169,110,0.7)] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:translate-y-0"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing…
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" />
                Top up {formatINR(effectiveAmount * 100)}
              </>
            )}
          </button>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--color-muted-foreground)]">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" />
              Secured by Razorpay
            </span>
            <span className="text-[var(--color-border)]">·</span>
            <span>UPI · NetBanking · Cards · Wallets</span>
          </div>
        </motion.section>

        {/* ── Side panel: how it works + GST ── */}
        <motion.aside
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-4"
        >
          <div className="overflow-hidden rounded-2xl border border-[var(--color-primary)]/30 bg-gradient-to-br from-[var(--color-primary)]/15 via-[var(--color-card)] to-[var(--color-card)] p-5">
            <div className="mb-2 flex items-center gap-2">
              <Wallet className="h-4 w-4 text-[var(--color-primary)]" />
              <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-primary)]">
                Total wallet
              </p>
            </div>
            <p className="font-display text-[32px] font-800 leading-none tracking-tight text-[var(--color-foreground)]">
              {formatINRDecimal(balance.wallet_balance_paise)}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--color-primary)]/15 pt-3">
              <div>
                <p className="font-mono text-[9px] font-700 uppercase tracking-wider text-[var(--color-muted-foreground)]">
                  Available
                </p>
                <p className="mt-0.5 font-display text-[14px] font-700 text-emerald-400">
                  {formatINRDecimal(balance.wallet_available_paise)}
                </p>
              </div>
              <div>
                <p className="font-mono text-[9px] font-700 uppercase tracking-wider text-[var(--color-muted-foreground)]">
                  In escrow
                </p>
                <p className="mt-0.5 font-display text-[14px] font-700 text-[var(--color-foreground)]/70">
                  {formatINRDecimal(balance.wallet_reserved_paise)}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
            <div className="mb-3 flex items-center gap-2">
              <Info className="h-3.5 w-3.5 text-[var(--color-primary)]" />
              <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-foreground)]">
                How wallet works
              </p>
            </div>
            <ul className="space-y-2.5 text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">
              <li className="flex gap-2">
                <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/15 font-mono text-[9px] font-700 text-[var(--color-primary)]">
                  1
                </span>
                Top up your wallet — funds sit ready, no fees while idle.
              </li>
              <li className="flex gap-2">
                <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/15 font-mono text-[9px] font-700 text-[var(--color-primary)]">
                  2
                </span>
                Start a collab — package fee moves into escrow + unlocks
                generation credits (3× final images).
              </li>
              <li className="flex gap-2">
                <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/15 font-mono text-[9px] font-700 text-[var(--color-primary)]">
                  3
                </span>
                Creator approves — funds release to creator. Rejected? Funds
                return to your wallet.
              </li>
            </ul>
            <p className="mt-3 border-t border-[var(--color-border)] pt-3 font-mono text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
              <span className="font-700 text-[var(--color-foreground)]">
                1 credit = 1 generation
              </span>
              {" · "}
              <span>credits never expire</span>
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
            <div className="flex items-center gap-2">
              <Receipt className="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />
              <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
                GST invoices
              </p>
            </div>
            <p className="mt-1.5 text-[12px] text-[var(--color-muted-foreground)]">
              Tax invoices auto-generated for B2B top-ups. Find them per
              transaction in the ledger below.
            </p>
          </div>
        </motion.aside>
      </div>

      {/* ═══ Transactions ledger ═══ */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
        className="mt-6 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]"
      >
        <div className="flex flex-col gap-3 border-b border-[var(--color-border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="font-display text-[14px] font-700 text-[var(--color-foreground)]">
              Transactions
            </p>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
              Last {transactions.length} movement{transactions.length !== 1 ? "s" : ""} · top-ups, escrow, refunds
            </p>
          </div>

          {/* Filter chips */}
          <div className="flex items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-secondary)]/40 p-1">
            {(["all", "credit", "debit"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-[var(--radius-pill)] px-3 py-1 font-mono text-[10px] font-700 uppercase tracking-wider transition-all ${
                  filter === f
                    ? "bg-[var(--color-card)] text-[var(--color-foreground)] shadow-sm"
                    : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                }`}
              >
                {f === "credit" ? "In" : f === "debit" ? "Out" : "All"}
              </button>
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {filteredTx.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-3 px-6 py-14 text-center"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-secondary)]">
                <Inbox className="h-5 w-5 text-[var(--color-muted-foreground)]" />
              </div>
              <p className="font-display text-[14px] font-700 text-[var(--color-foreground)]">
                {filter === "all"
                  ? "No transactions yet"
                  : `No ${filter === "credit" ? "incoming" : "outgoing"} movements`}
              </p>
              <p className="max-w-xs text-[12px] text-[var(--color-muted-foreground)]">
                {filter === "all"
                  ? "Top up your wallet to get started — every movement shows up here."
                  : "Switch filter to see other transaction types."}
              </p>
            </motion.div>
          ) : (
            <motion.ul
              key="rows"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="divide-y divide-[var(--color-border)]"
            >
              {filteredTx.map((tx) => {
                const meta = txMeta(tx.type);
                const isCredit = isCreditTx(tx.type);
                return (
                  <li
                    key={tx.id}
                    className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[var(--color-secondary)]/40 sm:gap-4 sm:px-6"
                  >
                    {/* Icon */}
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${
                        isCredit
                          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-400"
                          : meta.tone === "warn"
                          ? "border-amber-400/30 bg-amber-400/10 text-amber-400"
                          : "border-rose-400/30 bg-rose-400/10 text-rose-400"
                      }`}
                    >
                      {isCredit ? (
                        <ArrowDownLeft className="h-4 w-4" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4" />
                      )}
                    </div>

                    {/* Type + reference */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-700 text-[var(--color-foreground)]">
                          {meta.label}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-[var(--color-muted-foreground)]">
                        {tx.description ??
                          tx.reference_type?.replace(/_/g, " ") ??
                          formatRelative(tx.created_at)}
                      </p>
                    </div>

                    {/* Amount + balance */}
                    <div className="text-right">
                      <p
                        className={`font-display text-[14px] font-800 tracking-tight tabular-nums ${
                          isCredit
                            ? "text-emerald-400"
                            : "text-[var(--color-foreground)]"
                        }`}
                      >
                        {isCredit ? "+" : "−"}
                        {formatINRDecimal(tx.amount_paise)}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                        bal {formatINR(tx.balance_after_paise)}
                      </p>
                    </div>

                    {/* Date — desktop only */}
                    <div className="hidden w-[88px] shrink-0 text-right sm:block">
                      <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                        {formatRelative(tx.created_at)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </motion.ul>
          )}
        </AnimatePresence>

        {transactions.length > 0 && (
          <div className="border-t border-[var(--color-border)] bg-[var(--color-secondary)]/30 px-5 py-3 text-center sm:px-6">
            <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
              Showing latest {filteredTx.length} of {transactions.length} ·
              <span className="ml-1 text-[var(--color-foreground)]/70">
                full ledger coming soon
              </span>
            </p>
          </div>
        )}
      </motion.section>
    </div>
  );
}

/* ───────────────────── Stat tile (matches collabs/[id]) ───────────────────── */

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
  tone?: "default" | "primary" | "warn" | "success";
}) {
  const toneStyles = {
    default: "text-[var(--color-foreground)]",
    primary: "text-[var(--color-primary)]",
    warn: "text-amber-500",
    success: "text-emerald-500",
  } as const;

  const iconBg = {
    default: "bg-[var(--color-secondary)] text-[var(--color-foreground)]",
    primary: "bg-[var(--color-primary)]/10 text-[var(--color-primary)]",
    warn: "bg-amber-500/10 text-amber-500",
    success: "bg-emerald-500/10 text-emerald-500",
  } as const;

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
      <div className="flex items-center gap-2">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-lg ${iconBg[tone]}`}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="font-mono text-[10px] font-700 uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
          {label}
        </span>
      </div>
      <p
        className={`mt-2.5 font-display text-[24px] font-800 leading-none tracking-tight ${toneStyles[tone]} sm:text-[28px]`}
      >
        {value}
      </p>
      {sub && (
        <p className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
          {sub}
        </p>
      )}
    </div>
  );
}
