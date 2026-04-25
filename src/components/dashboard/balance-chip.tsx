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

interface BrandStatsShape {
  role: "brand";
  brand: { id: string } | null;
  stats?: {
    walletBalance?: number; // paise
  };
  credits_remaining?: number;
}

interface CreatorStatsShape {
  role: "creator";
  creator: { id: string } | null;
  stats?: {
    walletBalance?: number; // paise
  };
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

    async function load() {
      try {
        const [statsRes, billingRes] = await Promise.allSettled([
          fetch("/api/dashboard/stats", { cache: "no-store" }),
          // For brand, also pull credits from the billing endpoint (more
          // authoritative — stats route reads from legacy archive table).
          role === "brand"
            ? fetch("/api/billing/balance", { cache: "no-store" })
            : Promise.resolve(null),
        ]);

        if (cancelled) return;

        if (statsRes.status === "fulfilled" && statsRes.value.ok) {
          const data = (await statsRes.value.json()) as
            | BrandStatsShape
            | CreatorStatsShape;
          if (data.stats?.walletBalance !== undefined) {
            setWalletPaise(data.stats.walletBalance);
          }
        }

        if (
          role === "brand" &&
          billingRes.status === "fulfilled" &&
          billingRes.value &&
          billingRes.value.ok
        ) {
          const data = (await billingRes.value.json()) as {
            credits_remaining?: number;
            wallet_available_paise?: number;
            wallet_balance_paise?: number;
          };
          if (typeof data.credits_remaining === "number") {
            setCredits(data.credits_remaining);
          }
          // Prefer the new ledger's balance if present.
          if (typeof data.wallet_available_paise === "number") {
            setWalletPaise(data.wallet_available_paise);
          } else if (typeof data.wallet_balance_paise === "number") {
            setWalletPaise(data.wallet_balance_paise);
          }
        }
      } catch {
        // Best-effort — chip will just not show data.
      }
    }

    load();
    const handle = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(handle);
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
