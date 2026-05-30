"use client";

/**
 * VerifyBanner — dashboard nudge that reflects the creator's verification
 * state. Hidden once verified. Pulls /api/creator/verification (cached).
 */

import Link from "next/link";
import { ShieldCheck, Clock, AlertTriangle, ArrowRight } from "lucide-react";
import { useCachedFetch } from "@/lib/hooks/use-cached-fetch";
import { VerifiedSeal } from "@/components/ui/verified-seal";

interface VState {
  is_verified: boolean;
  onboarding_complete: boolean;
  status: "not_started" | "pending" | "verified" | "rejected";
}

export function VerifyBanner() {
  const { data } = useCachedFetch<VState>("/api/creator/verification");
  if (!data) return null;
  // Once verified, no banner — the gold tick lives elsewhere.
  if (data.is_verified || data.status === "verified") return null;
  // Don't nag mid-onboarding.
  if (!data.onboarding_complete) return null;

  if (data.status === "pending") {
    return (
      <Link
        href="/creator/verify"
        className="group flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/8 p-3.5 transition-colors hover:bg-amber-500/12"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
          <Clock className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[14px] font-700 text-[var(--color-foreground)]">
            Verification under review
          </p>
          <p className="text-[12px] text-[var(--color-muted-foreground)]">
            We&apos;re checking your documents — usually 1–2 business days.
          </p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)] transition-transform group-hover:translate-x-0.5" />
      </Link>
    );
  }

  if (data.status === "rejected") {
    return (
      <Link
        href="/creator/verify"
        className="group flex items-center gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/8 p-3.5 transition-colors hover:bg-rose-500/12"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-500">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[14px] font-700 text-[var(--color-foreground)]">
            Verification needs another look
          </p>
          <p className="text-[12px] text-[var(--color-muted-foreground)]">
            Re-check your documents and resubmit to get your gold tick.
          </p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)] transition-transform group-hover:translate-x-0.5" />
      </Link>
    );
  }

  // not_started
  return (
    <Link
      href="/creator/verify"
      className="group flex items-center gap-3 overflow-hidden rounded-2xl border border-[var(--color-primary)]/30 bg-gradient-to-r from-[var(--color-primary)]/10 to-[var(--color-card)] p-3.5 transition-colors hover:from-[var(--color-primary)]/15"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary)]/15">
        <VerifiedSeal size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 font-display text-[14px] font-800 text-[var(--color-foreground)]">
          Get the gold tick
          <ShieldCheck className="h-3.5 w-3.5 text-[var(--color-primary)]" />
        </p>
        <p className="text-[12px] text-[var(--color-muted-foreground)]">
          Verify with Aadhaar + PAN to stand out in discovery and unlock payouts.
        </p>
      </div>
      <span className="hidden shrink-0 items-center gap-1 rounded-full bg-[var(--color-primary)] px-3 py-1.5 text-[11px] font-700 text-[var(--color-primary-foreground)] sm:inline-flex">
        Verify
        <ArrowRight className="h-3 w-3" />
      </span>
    </Link>
  );
}
