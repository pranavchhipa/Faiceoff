"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Zap, CheckCircle2, Sparkles, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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

function perCreditCost(pack: CreditPack): string {
  const totalCredits = pack.credits + pack.bonus_credits;
  if (totalCredits === 0) return "—";
  const perCredit = pack.price_paise / totalCredits;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(perCredit / 100);
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
  isLoading,
  onChoose,
}: {
  pack: CreditPack;
  isLoading: boolean;
  onChoose: (pack: CreditPack) => void;
}) {
  const totalCredits = pack.credits + pack.bonus_credits;
  const isPro = pack.code === "pro";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className={`relative flex flex-col rounded-[var(--radius-card)] border bg-[var(--color-surface-container-lowest)] p-6 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-elevated)] ${
        isPro
          ? "border-[var(--color-accent-gold)] ring-1 ring-[var(--color-accent-gold)]/30 scale-105 z-10"
          : "border-[var(--color-outline-variant)]/20"
      }`}
    >
      {/* Popular badge */}
      {isPro && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-accent-gold)] px-3 py-1 text-[10px] font-700 uppercase tracking-widest text-white shadow-sm">
            <Sparkles className="size-3" />
            Most Popular
          </span>
        </div>
      )}

      {/* Header */}
      <div className="mb-4">
        <p className="text-[10px] font-700 uppercase tracking-widest text-[var(--color-outline-variant)] mb-1">
          {pack.display_name}
        </p>
        {pack.marketing_tagline && (
          <p className="text-xs text-[var(--color-outline-variant)] leading-relaxed">
            {pack.marketing_tagline}
          </p>
        )}
      </div>

      {/* Credits count */}
      <div className="mb-2">
        <span className="text-4xl font-800 text-[var(--color-on-surface)]">
          {totalCredits.toLocaleString("en-IN")}
        </span>
        <span className="ml-1.5 text-sm font-600 text-[var(--color-outline-variant)]">credits</span>
      </div>

      {/* Bonus callout */}
      {pack.bonus_credits > 0 && (
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-[var(--color-mint)] px-2.5 py-1 text-xs font-600 text-green-700">
          <CheckCircle2 className="size-3" />
          +{pack.bonus_credits} bonus credits included
        </div>
      )}

      {/* Price + per-credit cost */}
      <div className="mt-auto pt-4 border-t border-[var(--color-outline-variant)]/10">
        <div className="flex items-baseline justify-between mb-4">
          <p className="text-2xl font-700 text-[var(--color-on-surface)]">
            {formatINR(pack.price_paise)}
          </p>
          <p className="text-xs text-[var(--color-outline-variant)]">
            {perCreditCost(pack)}/credit
          </p>
        </div>

        <Button
          onClick={() => onChoose(pack)}
          disabled={isLoading}
          className={`w-full rounded-[var(--radius-button)] font-600 ${
            isPro
              ? "bg-[var(--color-accent-gold)] text-white hover:bg-[var(--color-accent-gold-hover)]"
              : "bg-[var(--color-on-surface)] text-white hover:bg-[var(--color-ink)]"
          }`}
        >
          {isLoading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Zap className="size-4" />
              Choose {pack.display_name}
            </>
          )}
        </Button>
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
        // Non-fatal — SDK will be loaded on demand when user clicks
        console.warn("Cashfree SDK pre-load failed; will retry on click");
      });
  }, []);

  async function handleChoose(pack: CreditPack) {
    if (loadingPack) return;
    setLoadingPack(pack.code);

    try {
      // Ensure SDK is ready
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
        const msg = body.error === "pack_inactive"
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

      // Open Cashfree checkout
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cf = (window as any).Cashfree?.({ mode: process.env.NEXT_PUBLIC_CASHFREE_MODE ?? "sandbox" });
      if (!cf) {
        toast.error("Payment SDK not loaded. Please refresh and try again.");
        return;
      }

      await cf.checkout({
        paymentSessionId: data.paymentSessionId,
        redirectTarget: "_modal",
      });

      // After checkout modal closes, refresh balance via toast
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

  // Filter out free_signup
  const displayPacks = packs.filter((p) => p.code !== "free_signup");

  return (
    <div>
      {/* Header row */}
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-800 tracking-tight text-[var(--color-on-surface)]">
            Buy credits
          </h1>
          <p className="mt-1 text-sm text-[var(--color-outline-variant)]">
            Each credit = 1 AI generation slot. Credits never expire.
          </p>
        </div>

        {/* Balance chip */}
        <div className="shrink-0 flex items-center gap-2 rounded-full border border-[var(--color-ocean-deep)] bg-[var(--color-ocean)]/60 px-4 py-2">
          <Zap className="size-4 text-[var(--color-primary)]" />
          <span className="text-sm font-700 text-[var(--color-on-surface)]">
            {creditsRemaining.toLocaleString("en-IN")} credits left
          </span>
        </div>
      </div>

      {/* Empty state */}
      {displayPacks.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-outline-variant)]/20 bg-[var(--color-surface-container-lowest)] p-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-[var(--color-surface-container-low)]">
            <AlertCircle className="size-5 text-[var(--color-outline-variant)]" />
          </div>
          <p className="text-sm font-600 text-[var(--color-on-surface)]">No credit packs available</p>
          <p className="text-xs text-[var(--color-outline-variant)]">
            Please check back soon or contact support.
          </p>
        </div>
      )}

      {/* Pack grid */}
      {displayPacks.length > 0 && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 items-start">
          {displayPacks.map((pack) => (
            <PackCard
              key={pack.code}
              pack={pack}
              isLoading={loadingPack === pack.code}
              onChoose={handleChoose}
            />
          ))}
        </div>
      )}

      {/* Explainer footer */}
      <div className="mt-10 rounded-[var(--radius-card)] border border-[var(--color-outline-variant)]/15 bg-[var(--color-surface-container-low)] px-5 py-4">
        <p className="text-xs text-[var(--color-outline-variant)] leading-relaxed">
          <span className="font-600 text-[var(--color-on-surface)]">How credits work:</span>{" "}
          Each credit unlocks one AI generation. You also need wallet balance to cover the creator fee
          per image. Credits are deducted immediately on submit; wallet funds are held in escrow and
          released to the creator on approval.
        </p>
      </div>
    </div>
  );
}
