"use client";

/**
 * LaunchSection — Client island for /brand/discover/[creatorId]
 *
 * Owns the GenerationSheet state and renders the balance summary + Generate
 * CTA. Brand balance and creator info are pre-loaded server-side and passed
 * in as props.
 *
 * Hybrid Soft Luxe v2 — uses canonical theme tokens so it reads cleanly in
 * both light and dark modes. (Older bg-white / text-ink usage caused
 * invisible-text issues in dark mode and harsh red "error" pills.)
 */

import { useState } from "react";
import Link from "next/link";
import { Zap, Wallet, CreditCard, ChevronRight, Check, AlertTriangle } from "lucide-react";
import { GenerationSheet } from "@/components/sessions/generation-sheet";
import type {
  CreatorInfo,
  BrandBalance,
} from "@/components/sessions/generation-sheet";

function formatINR(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

interface Props {
  creator: CreatorInfo;
  brandBalance: BrandBalance;
}

export function LaunchSection({ creator, brandBalance }: Props) {
  const [open, setOpen] = useState(false);

  const hasCredits = brandBalance.credits_remaining >= 1;
  const hasWallet = brandBalance.wallet_available_paise >= creator.base_price_paise;
  const canLaunch = hasCredits && hasWallet;

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.4)]">
        <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
          Launch a generation
        </p>

        {/* Price summary */}
        <div className="mt-3 mb-5">
          <p className="font-display text-[34px] font-800 leading-none tracking-tight text-[var(--color-foreground)]">
            {formatINR(creator.base_price_paise)}
          </p>
          <p className="mt-1.5 text-[11px] text-[var(--color-muted-foreground)]">
            Starting fee · 1 credit per image
          </p>
        </div>

        {/* Balance rows */}
        <div className="mb-4 space-y-1.5">
          <BalanceRow
            icon={<Zap className="h-3.5 w-3.5" />}
            label="Credits"
            value={`${brandBalance.credits_remaining} left`}
            ok={hasCredits}
          />
          <BalanceRow
            icon={<Wallet className="h-3.5 w-3.5" />}
            label="Wallet"
            value={formatINR(brandBalance.wallet_available_paise)}
            ok={hasWallet}
          />
        </div>

        {/* CTA */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={!canLaunch}
          className={`flex w-full items-center justify-center gap-2 rounded-[var(--radius-button)] px-4 py-3 text-[13px] font-700 transition-all ${
            canLaunch
              ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.5)] hover:-translate-y-0.5 hover:shadow-[0_6px_18px_-4px_rgba(201,169,110,0.7)]"
              : "cursor-not-allowed border border-[var(--color-border)] bg-[var(--color-secondary)] text-[var(--color-muted-foreground)]"
          }`}
        >
          <Zap className="h-3.5 w-3.5" />
          {canLaunch ? "Generate" : "Top up to generate"}
        </button>

        {/* Top-up shortcuts when blocked */}
        {!canLaunch && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {!hasCredits && (
              <Link
                href="/brand/credits"
                className="inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-button)] border border-[var(--color-border)] bg-[var(--color-secondary)] px-3 py-2 text-[12px] font-600 text-[var(--color-foreground)] transition-colors hover:border-[var(--color-primary)]/40 hover:text-[var(--color-primary)]"
              >
                <CreditCard className="h-3.5 w-3.5" />
                Buy credits
              </Link>
            )}
            {!hasWallet && (
              <Link
                href="/brand/wallet"
                className="inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-button)] border border-[var(--color-border)] bg-[var(--color-secondary)] px-3 py-2 text-[12px] font-600 text-[var(--color-foreground)] transition-colors hover:border-[var(--color-primary)]/40 hover:text-[var(--color-primary)]"
              >
                <Wallet className="h-3.5 w-3.5" />
                Add wallet
              </Link>
            )}
          </div>
        )}

        {/* Footer */}
        <Link
          href="/brand/sessions"
          className="mt-4 flex items-center justify-center gap-1 text-[11px] font-600 text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
        >
          View past sessions
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      <GenerationSheet
        open={open}
        onOpenChange={setOpen}
        creator={creator}
        brandBalance={brandBalance}
      />
    </>
  );
}

// ── Subcomponent ──────────────────────────────────────────────────────────────

function BalanceRow({
  icon,
  label,
  value,
  ok,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-[12px] font-600 ${
        ok
          ? "border-emerald-400/25 bg-emerald-400/8 text-emerald-300"
          : "border-amber-400/25 bg-amber-400/8 text-amber-300"
      }`}
    >
      <span className="inline-flex items-center gap-1.5">
        <span
          className={`flex h-5 w-5 items-center justify-center rounded ${
            ok ? "bg-emerald-400/15" : "bg-amber-400/15"
          }`}
        >
          {icon}
        </span>
        <span className="text-[var(--color-foreground)]">{label}</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        {ok ? (
          <Check className="h-3 w-3" />
        ) : (
          <AlertTriangle className="h-3 w-3" />
        )}
        {value}
      </span>
    </div>
  );
}
