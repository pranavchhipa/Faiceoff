"use client";

/**
 * LaunchSection — Client island for /brand/discover/[creatorId]
 *
 * Owns the GenerationSheet state and renders the balance summary + Generate
 * CTA. Brand balance and creator info are pre-loaded server-side and passed
 * in as props.
 */

import { useState } from "react";
import Link from "next/link";
import { Zap, Wallet, CreditCard, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
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
      <div className="rounded-[var(--radius-card)] border border-[var(--color-outline-variant)]/20 bg-white p-5 shadow-[var(--shadow-card)]">
        <p className="text-xs font-700 uppercase tracking-wider text-[var(--color-neutral-500)] mb-3">
          Launch a generation
        </p>

        {/* Price summary */}
        <div className="mb-4">
          <p className="text-3xl font-800 text-[var(--color-ink)]">
            {formatINR(creator.base_price_paise)}
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-neutral-500)]">
            Starting fee · 1 credit per image
          </p>
        </div>

        {/* Balance pills */}
        <div className="space-y-1.5 mb-4">
          <div
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs font-600 ${
              hasCredits
                ? "bg-[var(--color-mint)] text-green-700"
                : "bg-[var(--color-blush)] text-red-600"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <Zap className="size-3.5" />
              Credits
            </span>
            <span>{brandBalance.credits_remaining} left</span>
          </div>
          <div
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs font-600 ${
              hasWallet
                ? "bg-[var(--color-mint)] text-green-700"
                : "bg-[var(--color-blush)] text-red-600"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <Wallet className="size-3.5" />
              Wallet
            </span>
            <span>{formatINR(brandBalance.wallet_available_paise)}</span>
          </div>
        </div>

        {/* CTA */}
        <Button
          onClick={() => setOpen(true)}
          disabled={!canLaunch}
          className="w-full rounded-[var(--radius-button)] bg-[var(--color-ink)] font-600 text-white hover:opacity-90 h-11 disabled:opacity-50"
        >
          <Zap className="size-4" />
          {canLaunch ? "Generate" : "Top up to generate"}
        </Button>

        {/* Top-up shortcuts when blocked */}
        {!canLaunch && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {!hasCredits && (
              <Link
                href="/brand/credits"
                className="inline-flex items-center justify-center gap-1 rounded-[var(--radius-button)] border border-[var(--color-outline-variant)]/25 bg-white px-3 py-2 text-xs font-600 text-[var(--color-ink)] hover:border-[var(--color-outline-variant)]/45 transition-colors"
              >
                <CreditCard className="size-3.5" />
                Buy credits
              </Link>
            )}
            {!hasWallet && (
              <Link
                href="/brand/wallet"
                className="inline-flex items-center justify-center gap-1 rounded-[var(--radius-button)] border border-[var(--color-outline-variant)]/25 bg-white px-3 py-2 text-xs font-600 text-[var(--color-ink)] hover:border-[var(--color-outline-variant)]/45 transition-colors"
              >
                <Wallet className="size-3.5" />
                Add wallet
              </Link>
            )}
          </div>
        )}

        {/* Footer */}
        <Link
          href="/brand/sessions"
          className="mt-4 flex items-center justify-center gap-1 text-[11px] font-600 text-[var(--color-neutral-500)] hover:text-[var(--color-ink)] transition-colors"
        >
          View past sessions
          <ChevronRight className="size-3" />
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
