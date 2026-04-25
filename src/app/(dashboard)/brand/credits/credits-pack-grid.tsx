"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Zap, Sparkles, AlertCircle, Loader2, Check, Wallet } from "lucide-react";
import { toast } from "sonner";
import type { CreditPack } from "@/lib/billing";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Props {
  packs: CreditPack[];
  creditsRemaining: number;
}

interface TopUpResponse {
  orderId: string;
  paymentSessionId: string;
  amount_paise: number;
  credits: number;
  bonus_credits: number;
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

function perCreditCost(pack: CreditPack): number {
  const totalCredits = pack.credits + pack.bonus_credits;
  if (totalCredits === 0) return 0;
  return pack.price_paise / totalCredits;
}

function discountVsBase(pack: CreditPack, basePerCreditPaise: number): number {
  const per = perCreditCost(pack);
  if (basePerCreditPaise === 0 || per === 0) return 0;
  return Math.round((1 - per / basePerCreditPaise) * 100);
}

// ── Cashfree SDK loader ────────────────────────────────────────────────────────

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

// ── Pack card ─────────────────────────────────────────────────────────────────

function PackCard({
  pack,
  basePerCreditPaise,
  isLoading,
  isAnyLoading,
  onChoose,
  index,
}: {
  pack: CreditPack;
  basePerCreditPaise: number;
  isLoading: boolean;
  isAnyLoading: boolean;
  onChoose: (pack: CreditPack) => void;
  index: number;
}) {
  const totalCredits = pack.credits + pack.bonus_credits;
  const isPro = pack.code === "pro";
  const discount = discountVsBase(pack, basePerCreditPaise);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className={`group relative flex flex-col overflow-hidden rounded-2xl border p-6 transition-all duration-300 ${
        isPro
          ? "border-[var(--color-primary)]/40 bg-gradient-to-br from-[var(--color-primary)]/12 via-[var(--color-card)] to-[var(--color-card)] shadow-[0_8px_28px_-12px_rgba(201,169,110,0.5)] lg:scale-[1.04]"
          : "border-[var(--color-border)] bg-[var(--color-card)] hover:-translate-y-0.5 hover:border-[var(--color-primary)]/30 hover:shadow-[0_8px_28px_-16px_rgba(0,0,0,0.4)]"
      }`}
    >
      {/* Most Popular ribbon */}
      {isPro && (
        <div className="absolute -right-12 top-5 rotate-45 bg-[var(--color-primary)] px-12 py-1 text-[9px] font-800 uppercase tracking-[0.18em] text-[var(--color-primary-foreground)]">
          Most Popular
        </div>
      )}

      {/* Header */}
      <div className="mb-5">
        <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
          {pack.display_name}
        </p>
        {pack.marketing_tagline && (
          <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-muted-foreground)]">
            {pack.marketing_tagline}
          </p>
        )}
      </div>

      {/* Big credits number */}
      <div className="mb-2 flex items-baseline gap-1.5">
        <span className="font-display text-[44px] font-800 leading-none tracking-tight text-[var(--color-foreground)]">
          {totalCredits.toLocaleString("en-IN")}
        </span>
        <span className="text-sm font-600 text-[var(--color-muted-foreground)]">
          credits
        </span>
      </div>

      {/* Bonus chip + discount chip */}
      <div className="mb-6 flex flex-wrap gap-1.5">
        {pack.bonus_credits > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-700 uppercase tracking-wider text-emerald-300">
            <Check className="h-2.5 w-2.5" />
            +{pack.bonus_credits} bonus
          </span>
        )}
        {discount > 0 && (
          <span className="inline-flex items-center rounded-full border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 px-2 py-0.5 text-[10px] font-700 uppercase tracking-wider text-[var(--color-primary)]">
            Save {discount}%
          </span>
        )}
      </div>

      {/* Price block */}
      <div className="mt-auto border-t border-[var(--color-border)] pt-5">
        <div className="mb-4 flex items-baseline justify-between gap-2">
          <p className="font-display text-[26px] font-800 leading-none tracking-tight text-[var(--color-foreground)]">
            {formatINR(pack.price_paise)}
          </p>
          <p className="font-mono text-[11px] text-[var(--color-muted-foreground)]">
            {formatINR(perCreditCost(pack))}/credit
          </p>
        </div>

        <button
          type="button"
          onClick={() => onChoose(pack)}
          disabled={isAnyLoading}
          className={`flex w-full items-center justify-center gap-2 rounded-[var(--radius-button)] px-4 py-2.5 text-[13px] font-700 transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
            isPro
              ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.5)] hover:-translate-y-0.5 hover:shadow-[0_6px_18px_-4px_rgba(201,169,110,0.7)]"
              : "border border-[var(--color-border)] bg-[var(--color-secondary)] text-[var(--color-foreground)] hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-primary)]/8"
          }`}
        >
          {isLoading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Processing…
            </>
          ) : (
            <>
              <Zap className="h-3.5 w-3.5" />
              Choose {pack.display_name}
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────

export function CreditsPackGrid({ packs, creditsRemaining }: Props) {
  const [loadingPack, setLoadingPack] = useState<string | null>(null);
  const [sdkReady, setSdkReady] = useState(false);

  useEffect(() => {
    loadCashfreeSDK()
      .then(() => setSdkReady(true))
      .catch(() => {
        console.warn("Cashfree SDK pre-load failed; will retry on click");
      });
  }, []);

  async function handleChoose(pack: CreditPack) {
    if (loadingPack) return;
    setLoadingPack(pack.code);

    try {
      if (!sdkReady) {
        await loadCashfreeSDK();
        setSdkReady(true);
      }

      const res = await fetch("/api/credits/top-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack: pack.code }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        const msg =
          body.error === "pack_inactive"
            ? "This pack is currently unavailable"
            : body.error === "no_brand_profile"
            ? "Brand profile not found — please complete setup"
            : body.error === "cashfree_unavailable"
            ? "Payment gateway not configured. Please contact support."
            : body.error === "db_error"
            ? "Database error. Please try again in a moment."
            : "Failed to initiate payment. Please try again.";
        toast.error(msg);
        return;
      }

      const data = (await res.json()) as TopUpResponse;

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
        `Payment initiated for ${data.credits + data.bonus_credits} credits. Balance will update shortly.`,
      );
    } catch (err) {
      console.error("[credits-pack-grid] handleChoose error:", err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoadingPack(null);
    }
  }

  // Filter free_signup + sort smallest → largest by credits.
  const displayPacks = packs
    .filter((p) => p.code !== "free_signup")
    .sort((a, b) => a.credits + a.bonus_credits - (b.credits + b.bonus_credits));

  // Use the smallest pack's per-credit price as the "base" reference for
  // displaying savings on bigger packs.
  const basePerCreditPaise =
    displayPacks.length > 0 ? perCreditCost(displayPacks[0]) : 0;

  return (
    <div className="space-y-8">
      {/* ═══ Hero header ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"
      >
        <div>
          <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
            Buy credits
          </p>
          <h1 className="mt-1 font-display text-[32px] font-800 leading-none tracking-tight text-[var(--color-foreground)] md:text-[40px]">
            Top up your wallet
            <span className="text-[var(--color-primary)]">.</span>
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[var(--color-muted-foreground)]">
            Each credit unlocks 1 AI generation slot. Credits never expire — buy in bulk to
            save up to 50%.
          </p>
        </div>

        {/* Balance pill */}
        <div className="inline-flex shrink-0 items-center gap-2.5 self-start rounded-full border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 px-4 py-2 md:self-end">
          <Zap className="h-4 w-4 text-[var(--color-primary)]" />
          <span className="font-mono text-[11px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
            Balance
          </span>
          <span className="font-display text-base font-800 tracking-tight text-[var(--color-foreground)]">
            {creditsRemaining.toLocaleString("en-IN")}
          </span>
        </div>
      </motion.div>

      {/* ═══ Empty state ═══ */}
      {displayPacks.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-secondary)]">
            <AlertCircle className="h-5 w-5 text-[var(--color-muted-foreground)]" />
          </div>
          <p className="text-sm font-600 text-[var(--color-foreground)]">
            No credit packs available
          </p>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Please check back soon or contact support.
          </p>
        </div>
      )}

      {/* ═══ Pack grid ═══ */}
      {displayPacks.length > 0 && (
        <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 lg:gap-5">
          {displayPacks.map((pack, i) => (
            <PackCard
              key={pack.code}
              pack={pack}
              basePerCreditPaise={basePerCreditPaise}
              isLoading={loadingPack === pack.code}
              isAnyLoading={loadingPack !== null}
              onChoose={handleChoose}
              index={i}
            />
          ))}
        </div>
      )}

      {/* ═══ How it works strip ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="grid grid-cols-1 gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 md:grid-cols-3 md:gap-5"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)]/12 text-[var(--color-primary)]">
            <Zap className="h-4 w-4" />
          </span>
          <div>
            <p className="font-display text-[13px] font-700 text-[var(--color-foreground)]">
              1 credit = 1 generation
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--color-muted-foreground)]">
              Deducted on submit, regardless of approval outcome.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)]/12 text-[var(--color-primary)]">
            <Wallet className="h-4 w-4" />
          </span>
          <div>
            <p className="font-display text-[13px] font-700 text-[var(--color-foreground)]">
              Wallet covers creator fee
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--color-muted-foreground)]">
              Held in escrow per generation, released on creator approval.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)]/12 text-[var(--color-primary)]">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <p className="font-display text-[13px] font-700 text-[var(--color-foreground)]">
              Credits never expire
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--color-muted-foreground)]">
              Buy in bulk now, generate at your own pace.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
