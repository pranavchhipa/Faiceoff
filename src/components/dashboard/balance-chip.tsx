"use client";

/**
 * BalanceChip — role-aware live balance pill that sits in the topbar.
 *
 *   Brand   → "₹50,000 · ⚡120"   → links to /brand/wallet
 *   Creator → "₹12,400 available" → links to /creator/earnings
 *   Admin   → null (no balance concept for admin)
 *
 * Polls /api/dashboard/stats every 60s so the chip stays fresh after a
 * top-up / generation / payout. Hidden on mobile (<md) to keep the topbar
 * uncluttered — desktop only.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Zap, Wallet } from "lucide-react";
import type { Role } from "@/config/routes";

interface Props {
  role: Role | null;
}

const REFRESH_MS = 60_000;

function formatINR(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

export function BalanceChip({ role }: Props) {
  const [walletPaise, setWalletPaise] = useState<number | null>(null);
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    if (role !== "brand" && role !== "creator") return;

    let cancelled = false;

    // For both roles, /api/dashboard/stats is the LEGACY source — its
    // walletBalance reads from the sealed wallet_transactions_archive table
    // and is effectively always 0 / stale. The live numbers live in:
    //   - brand   → /api/billing/balance       (v_brand_billing view)
    //   - creator → /api/earnings/dashboard    (v_creator_dashboard view)
    // The stats route is only kept for activeCampaigns / pendingApprovals.
    async function load() {
      try {
        // Use the browser cache. The server sets `private, max-age=15, swr=60`
        // on both endpoints (see /api/billing/balance + /api/earnings/dashboard)
        // so back-to-back navigations + the 60s poll itself land instantly
        // from cache when nothing has changed.
        const liveRes =
          role === "brand"
            ? await fetch("/api/billing/balance")
            : await fetch("/api/earnings/dashboard");

        if (cancelled) return;
        if (!liveRes.ok) return;

        const data = (await liveRes.json()) as {
          // brand
          credits_remaining?: number;
          wallet_available_paise?: number;
          wallet_balance_paise?: number;
          // creator
          available_paise?: number;
        };

        if (role === "brand") {
          if (typeof data.credits_remaining === "number") {
            setCredits(data.credits_remaining);
          }
          if (typeof data.wallet_available_paise === "number") {
            setWalletPaise(data.wallet_available_paise);
          } else if (typeof data.wallet_balance_paise === "number") {
            setWalletPaise(data.wallet_balance_paise);
          }
        } else if (role === "creator") {
          if (typeof data.available_paise === "number") {
            setWalletPaise(data.available_paise);
          }
        }
      } catch {
        // Best-effort — chip will just not show data.
      }
    }

    load();
    // Pause polling in background tabs; refresh on return.
    const handle = setInterval(() => {
      if (!document.hidden) load();
    }, REFRESH_MS);
    const onVis = () => {
      if (!document.hidden) load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      clearInterval(handle);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [role]);

  if (role === "brand") {
    return (
      <Link
        href="/brand/wallet"
        className="hidden h-9 shrink-0 items-center gap-2 rounded-lg border border-[var(--color-primary)]/25 bg-[var(--color-primary)]/8 px-3 text-[12px] font-700 text-[var(--color-foreground)] transition-all hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-primary)]/15 md:flex"
        aria-label="Wallet and credits"
      >
        <Wallet className="h-3.5 w-3.5 text-[var(--color-primary)]" />
        <span className="font-display tracking-tight">
          {walletPaise === null ? "—" : formatINR(walletPaise)}
        </span>
        <span className="h-3 w-px bg-[var(--color-border)]" />
        <Zap className="h-3.5 w-3.5 text-[var(--color-primary)]" />
        <span className="font-display tabular-nums">
          {credits === null ? "—" : credits.toLocaleString("en-IN")}
        </span>
      </Link>
    );
  }

  if (role === "creator") {
    return (
      <Link
        href="/creator/earnings"
        className="hidden h-9 shrink-0 items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/8 px-3 text-[12px] font-700 text-[var(--color-foreground)] transition-all hover:border-emerald-400/50 hover:bg-emerald-400/15 md:flex"
        aria-label="Earnings"
      >
        <Wallet className="h-3.5 w-3.5 text-emerald-400" />
        <span className="font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-emerald-300">
          Available
        </span>
        <span className="font-display tracking-tight">
          {walletPaise === null ? "—" : formatINR(walletPaise)}
        </span>
      </Link>
    );
  }

  return null;
}
