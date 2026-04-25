"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Wallet, Loader2, IndianRupee, Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────────────

interface WalletBalance {
  wallet_balance_paise: number;
  wallet_reserved_paise: number;
  wallet_available_paise: number;
  lifetime_topup_paise: number;
}

interface Props {
  initialBalance: WalletBalance;
}

interface WalletTopUpResponse {
  orderId: string;
  paymentSessionId: string;
  amount_paise: number;
  bonus_paise: number;
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

/**
 * Bonus tiers (matching the server-side logic):
 *   ₹500-999: 0%  |  ₹1000-4999: 5%  |  ₹5000-9999: 10%
 *   ₹10000-49999: 15%  |  ₹50000+: 20%
 */
function computeBonus(amountRupees: number): { rate: number; bonusRupees: number } {
  let rate: number;
  if (amountRupees >= 50_000) rate = 0.2;
  else if (amountRupees >= 10_000) rate = 0.15;
  else if (amountRupees >= 5_000) rate = 0.1;
  else if (amountRupees >= 1_000) rate = 0.05;
  else rate = 0;
  return { rate, bonusRupees: Math.floor(amountRupees * rate) };
}

function loadCashfreeSDK(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector('script[src*="cashfree.js"]')) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Cashfree SDK"));
    document.head.appendChild(script);
  });
}

const TIERS = [
  { label: "₹500", rate: 0, threshold: 500 },
  { label: "₹1K", rate: 5, threshold: 1000 },
  { label: "₹5K", rate: 10, threshold: 5000 },
  { label: "₹10K", rate: 15, threshold: 10000 },
  { label: "₹50K", rate: 20, threshold: 50000 },
];

// ── Main component ────────────────────────────────────────────────────────────

export function WalletTopup({ initialBalance }: Props) {
  const [amountRupees, setAmountRupees] = useState(1000);
  const [isLoading, setIsLoading] = useState(false);
  const [balance, setBalance] = useState<WalletBalance>(initialBalance);

  const { rate, bonusRupees } = computeBonus(amountRupees);
  const totalRupees = amountRupees + bonusRupees;
  const sliderPct = ((amountRupees - 500) / (500_000 - 500)) * 100;

  useEffect(() => {
    loadCashfreeSDK().catch(() => {
      // pre-load is best-effort
    });
  }, []);

  const refreshBalance = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/balance", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as WalletBalance & Record<string, unknown>;
        setBalance({
          wallet_balance_paise: data.wallet_balance_paise,
          wallet_reserved_paise: data.wallet_reserved_paise,
          wallet_available_paise: data.wallet_available_paise,
          lifetime_topup_paise: data.lifetime_topup_paise,
        });
      }
    } catch {
      // best-effort
    }
  }, []);

  async function handleTopUp() {
    if (isLoading) return;
    setIsLoading(true);

    try {
      await loadCashfreeSDK();

      const amountPaise = amountRupees * 100;
      const res = await fetch("/api/wallet/top-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_paise: amountPaise }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        const msg =
          body.error === "no_brand_profile"
            ? "Brand profile not found — please complete setup first"
            : body.error === "invalid_input"
            ? "Invalid amount. Minimum ₹500, maximum ₹5,00,000."
            : body.error === "cashfree_unavailable"
            ? "Payment gateway not configured. Please contact support."
            : body.error === "db_error"
            ? "Database error. Please try again in a moment."
            : "Payment initiation failed. Please try again.";
        toast.error(msg);
        return;
      }

      const data = (await res.json()) as WalletTopUpResponse;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cf = (window as any).Cashfree?.({
        mode: process.env.NEXT_PUBLIC_CASHFREE_MODE ?? "sandbox",
      });
      if (!cf) {
        toast.error("Payment SDK not loaded. Please refresh and try again.");
        return;
      }

      await cf.checkout({
        paymentSessionId: data.paymentSessionId,
        redirectTarget: "_modal",
      });

      toast.success(
        `Wallet top-up initiated: ${formatINR(
          data.amount_paise + data.bonus_paise,
        )} total (incl. bonus). Balance will update shortly.`,
      );

      setTimeout(refreshBalance, 2000);
    } catch (err) {
      console.error("[wallet-topup] handleTopUp error:", err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="w-full max-w-[1100px]">
      {/* ═══ Header ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mb-8"
      >
        <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
          Wallet
        </p>
        <h1 className="mt-1 font-display text-[32px] font-800 leading-none tracking-tight text-[var(--color-foreground)] md:text-[40px]">
          Add funds
          <span className="text-[var(--color-primary)]">.</span>
        </h1>
        <p className="mt-2 max-w-xl text-sm text-[var(--color-muted-foreground)]">
          Wallet pays the creator fee per generation. Funds held in escrow,
          released on creator approval. Top up bigger to earn up to 20% bonus.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
        {/* ═══ Top-up panel (left, span 2) ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 lg:col-span-2"
        >
          <div className="mb-5 flex items-center justify-between gap-3">
            <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
              Amount to add
            </p>
            {rate > 0 && (
              <span className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-0.5 text-[10px] font-700 uppercase tracking-wider text-emerald-300">
                +{(rate * 100).toFixed(0)}% bonus tier
              </span>
            )}
          </div>

          {/* Big amount display */}
          <div className="mb-5 flex items-baseline gap-2">
            <span className="font-display text-[48px] font-800 leading-none tracking-tight text-[var(--color-foreground)] md:text-[56px]">
              {formatINR(amountRupees * 100)}
            </span>
          </div>

          {/* Slider */}
          <input
            type="range"
            min={500}
            max={500000}
            step={500}
            value={amountRupees}
            onChange={(e) => setAmountRupees(Number(e.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full"
            style={{
              background: `linear-gradient(to right, var(--color-primary) 0%, var(--color-primary) ${sliderPct}%, var(--color-secondary) ${sliderPct}%, var(--color-secondary) 100%)`,
            }}
          />

          {/* Tier strip */}
          <div className="mt-4 grid grid-cols-5 gap-1.5">
            {TIERS.map((t) => {
              const active = amountRupees >= t.threshold;
              return (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => setAmountRupees(t.threshold)}
                  className={`flex flex-col items-center rounded-lg border px-1 py-2 text-center transition-all ${
                    active
                      ? "border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10"
                      : "border-[var(--color-border)] bg-[var(--color-secondary)]/40 hover:border-[var(--color-primary)]/20"
                  }`}
                >
                  <span
                    className={`font-display text-[12px] font-700 ${
                      active
                        ? "text-[var(--color-foreground)]"
                        : "text-[var(--color-muted-foreground)]"
                    }`}
                  >
                    {t.label}
                  </span>
                  <span
                    className={`font-mono text-[10px] ${
                      active
                        ? "text-[var(--color-primary)]"
                        : "text-[var(--color-muted-foreground)]"
                    }`}
                  >
                    +{t.rate}%
                  </span>
                </button>
              );
            })}
          </div>

          {/* Live breakdown */}
          <motion.div
            key={amountRupees}
            initial={{ opacity: 0.7 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
            className="mt-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]/40 p-4"
          >
            <div className="mb-2 flex items-center justify-between text-[13px]">
              <span className="text-[var(--color-muted-foreground)]">You pay</span>
              <span className="font-600 text-[var(--color-foreground)]">
                {formatINR(amountRupees * 100)}
              </span>
            </div>
            {bonusRupees > 0 && (
              <div className="mb-2 flex items-center justify-between text-[13px]">
                <span className="text-[var(--color-muted-foreground)]">
                  Bonus ({(rate * 100).toFixed(0)}%)
                </span>
                <span className="font-600 text-emerald-400">
                  +{formatINR(bonusRupees * 100)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-2.5 text-[14px]">
              <span className="font-600 text-[var(--color-foreground)]">
                Wallet credit
              </span>
              <span className="font-display text-base font-800 tracking-tight text-[var(--color-primary)]">
                {formatINR(totalRupees * 100)}
              </span>
            </div>
          </motion.div>

          {/* CTA */}
          <button
            type="button"
            onClick={handleTopUp}
            disabled={isLoading}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-[var(--radius-button)] bg-[var(--color-primary)] px-4 py-3 font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.5)] transition-all hover:-translate-y-0.5 hover:shadow-[0_6px_18px_-4px_rgba(201,169,110,0.7)] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:translate-y-0"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing…
              </>
            ) : (
              <>
                <IndianRupee className="h-4 w-4" />
                Add {formatINR(amountRupees * 100)} to wallet
              </>
            )}
          </button>

          <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-[var(--color-muted-foreground)]">
            <ShieldCheck className="h-3 w-3" />
            Secured by Cashfree · UPI · NetBanking · Cards
          </p>
        </motion.div>

        {/* ═══ Balance card (right) ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-4"
        >
          <div className="rounded-2xl border border-[var(--color-primary)]/30 bg-gradient-to-br from-[var(--color-primary)]/12 via-[var(--color-card)] to-[var(--color-card)] p-6">
            <div className="mb-3 flex items-center gap-2">
              <Wallet className="h-4 w-4 text-[var(--color-primary)]" />
              <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-primary)]">
                Wallet balance
              </p>
            </div>
            <p className="font-display text-[36px] font-800 leading-none tracking-tight text-[var(--color-foreground)]">
              {formatINRDecimal(balance.wallet_balance_paise)}
            </p>
            <p className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
              Total
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-[var(--color-muted-foreground)]">
                  Available
                </span>
                <span className="font-display text-[16px] font-700 text-emerald-400">
                  {formatINRDecimal(balance.wallet_available_paise)}
                </span>
              </div>
              {balance.wallet_reserved_paise > 0 && (
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-[13px] text-[var(--color-muted-foreground)]">
                    <Lock className="h-3 w-3" />
                    In escrow
                  </span>
                  <span className="font-display text-[14px] font-600 text-[var(--color-foreground)]/70">
                    {formatINRDecimal(balance.wallet_reserved_paise)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-3">
                <span className="text-[11px] text-[var(--color-muted-foreground)]">
                  Lifetime topped up
                </span>
                <span className="font-mono text-[11px] font-600 text-[var(--color-muted-foreground)]">
                  {formatINRDecimal(balance.lifetime_topup_paise)}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
            <p className="text-[11px] leading-relaxed text-[var(--color-muted-foreground)]">
              <span className="font-600 text-[var(--color-foreground)]">
                How wallet works:
              </span>{" "}
              Wallet pays the creator fee per generation. Funds held in escrow on
              submit; released to creator on approval, refunded on rejection.
              Separate from credits (generation slots).
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
