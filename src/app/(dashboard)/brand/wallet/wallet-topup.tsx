"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Wallet, Loader2, IndianRupee, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  if (amountRupees >= 50_000) rate = 0.20;
  else if (amountRupees >= 10_000) rate = 0.15;
  else if (amountRupees >= 5_000) rate = 0.10;
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

// ── Bonus tier label ──────────────────────────────────────────────────────────

function BonusTierBadge({ rate }: { rate: number }) {
  if (rate === 0) return null;
  return (
    <span className="inline-flex items-center rounded-full bg-[var(--color-mint)] px-2.5 py-0.5 text-xs font-600 text-green-700">
      +{(rate * 100).toFixed(0)}% bonus
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function WalletTopup({ initialBalance }: Props) {
  const [amountRupees, setAmountRupees] = useState(1000);
  const [isLoading, setIsLoading] = useState(false);
  const [balance, setBalance] = useState<WalletBalance>(initialBalance);

  const { rate, bonusRupees } = computeBonus(amountRupees);
  const totalRupees = amountRupees + bonusRupees;

  // Preload SDK on mount
  useEffect(() => {
    loadCashfreeSDK().catch(() => {
      // Non-fatal
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
      // Best-effort
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
        const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        const msg = body.error === "no_brand_profile"
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
        `Wallet top-up initiated: ${formatINR(data.amount_paise + data.bonus_paise)} total (incl. bonus). Balance will update shortly.`,
      );

      // Refresh balance after a short delay
      setTimeout(refreshBalance, 2000);
    } catch (err) {
      console.error("[wallet-topup] handleTopUp error:", err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      {/* Section header */}
      <div className="mb-8">
        <h1 className="text-2xl font-800 tracking-tight text-[var(--color-on-surface)]">
          Wallet
        </h1>
        <p className="mt-1 text-sm text-[var(--color-outline-variant)]">
          Top up your INR wallet to pay creator fees per generation.
        </p>
      </div>

      {/* Top-up card */}
      <div className="rounded-[var(--radius-card)] border border-[var(--color-outline-variant)]/20 bg-[var(--color-surface-container-lowest)] p-6 shadow-[var(--shadow-card)] mb-6">
        <p className="text-sm font-600 text-[var(--color-on-surface)] mb-5">Add to wallet</p>

        {/* Slider */}
        <div className="mb-2">
          <div className="flex items-center justify-between mb-3">
            <span className="text-3xl font-800 text-[var(--color-on-surface)]">
              {formatINR(amountRupees * 100)}
            </span>
            <BonusTierBadge rate={rate} />
          </div>

          <input
            type="range"
            min={500}
            max={500000}
            step={500}
            value={amountRupees}
            onChange={(e) => setAmountRupees(Number(e.target.value))}
            className="w-full h-2 rounded-full appearance-none cursor-pointer accent-[var(--color-accent-gold)]"
            style={{
              background: `linear-gradient(to right, var(--color-accent-gold) 0%, var(--color-accent-gold) ${((amountRupees - 500) / (500000 - 500)) * 100}%, var(--color-neutral-200) ${((amountRupees - 500) / (500000 - 500)) * 100}%, var(--color-neutral-200) 100%)`,
            }}
          />

          <div className="flex items-center justify-between mt-1.5">
            <span className="text-xs text-[var(--color-outline-variant)]">₹500</span>
            <span className="text-xs text-[var(--color-outline-variant)]">₹5,00,000</span>
          </div>
        </div>

        {/* Live bonus calculator */}
        <motion.div
          key={amountRupees}
          initial={{ opacity: 0.7 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
          className="mt-5 rounded-xl bg-[var(--color-surface-container-low)] px-4 py-3 space-y-2"
        >
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--color-outline-variant)]">You pay</span>
            <span className="font-600 text-[var(--color-on-surface)]">{formatINR(amountRupees * 100)}</span>
          </div>
          {bonusRupees > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--color-outline-variant)]">Bonus ({(rate * 100).toFixed(0)}%)</span>
              <span className="font-600 text-green-600">+{formatINR(bonusRupees * 100)}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-sm border-t border-[var(--color-outline-variant)]/15 pt-2">
            <span className="font-600 text-[var(--color-on-surface)]">Wallet total</span>
            <span className="font-700 text-[var(--color-accent-gold)] text-base">{formatINR(totalRupees * 100)}</span>
          </div>
        </motion.div>

        {/* Tier explainer */}
        <div className="mt-3 grid grid-cols-5 gap-1">
          {[
            { label: "₹500", rate: "0%" },
            { label: "₹1K", rate: "+5%" },
            { label: "₹5K", rate: "+10%" },
            { label: "₹10K", rate: "+15%" },
            { label: "₹50K", rate: "+20%" },
          ].map((t) => {
            const threshold = t.label === "₹500" ? 500
              : t.label === "₹1K" ? 1000
              : t.label === "₹5K" ? 5000
              : t.label === "₹10K" ? 10000
              : 50000;
            const active = amountRupees >= threshold;
            return (
              <div
                key={t.label}
                className={`flex flex-col items-center rounded-lg px-1 py-1.5 text-center transition-colors ${
                  active
                    ? "bg-[var(--color-mint)] text-green-700"
                    : "text-[var(--color-outline-variant)]"
                }`}
              >
                <span className="text-[9px] font-700">{t.label}</span>
                <span className="text-[10px] font-600">{t.rate}</span>
              </div>
            );
          })}
        </div>

        <Button
          onClick={handleTopUp}
          disabled={isLoading}
          className="mt-5 w-full rounded-[var(--radius-button)] bg-[var(--color-on-surface)] font-600 text-white hover:bg-[var(--color-ink)] h-11"
        >
          {isLoading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <IndianRupee className="size-4" />
              Add {formatINR(amountRupees * 100)} to wallet
            </>
          )}
        </Button>
      </div>

      {/* Current balance card */}
      <div className="rounded-[var(--radius-card)] border border-[var(--color-outline-variant)]/20 bg-[var(--color-surface-container-lowest)] p-6 shadow-[var(--shadow-card)] mb-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex size-8 items-center justify-center rounded-full bg-[var(--color-ocean)]/60">
            <Wallet className="size-4 text-[var(--color-primary)]" />
          </div>
          <p className="text-sm font-600 text-[var(--color-on-surface)]">Your wallet</p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--color-outline-variant)]">Total balance</span>
            <span className="text-lg font-700 text-[var(--color-on-surface)]">
              {formatINRDecimal(balance.wallet_balance_paise)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--color-outline-variant)]">Available</span>
            <span className="text-base font-600 text-green-600">
              {formatINRDecimal(balance.wallet_available_paise)}
            </span>
          </div>
          {balance.wallet_reserved_paise > 0 && (
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm text-[var(--color-outline-variant)]">
                <Lock className="size-3" />
                In escrow
              </span>
              <span className="text-sm font-600 text-[var(--color-on-surface)]/60">
                {formatINRDecimal(balance.wallet_reserved_paise)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-[var(--color-outline-variant)]/10 pt-3">
            <span className="text-xs text-[var(--color-outline-variant)]">Lifetime topped up</span>
            <span className="text-xs font-600 text-[var(--color-outline-variant)]">
              {formatINRDecimal(balance.lifetime_topup_paise)}
            </span>
          </div>
        </div>
      </div>

      {/* Explainer */}
      <div className="rounded-[var(--radius-card)] border border-[var(--color-outline-variant)]/15 bg-[var(--color-surface-container-low)] px-5 py-4">
        <p className="text-xs text-[var(--color-outline-variant)] leading-relaxed">
          <span className="font-600 text-[var(--color-on-surface)]">How wallet works:</span>{" "}
          Your wallet pays the creator fee per image generated. When you submit a generation, funds
          are held in escrow. On creator approval they&apos;re released to the creator; on rejection
          they&apos;re returned to you. Wallet funds are separate from credits (generation slots).
        </p>
      </div>
    </div>
  );
}
