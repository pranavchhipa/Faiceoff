// ─────────────────────────────────────────────────────────────────────────────
// /brand/billing — billing overview (server component)
// Hybrid Soft Luxe v2 dark-mode revamp
// ─────────────────────────────────────────────────────────────────────────────

import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  Zap,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  HelpCircle,
  ExternalLink,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface BillingData {
  credits_remaining: number;
  credits_lifetime_purchased: number;
  wallet_available_paise: number;
  wallet_reserved_paise: number;
  wallet_balance_paise: number;
  lifetime_topup_paise: number;
}

interface WalletTransaction {
  id: string;
  type: string;
  amount_paise: number;
  balance_after_paise: number;
  reference_type: string | null;
  description: string | null;
  created_at: string;
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function txTypeLabel(type: string): string {
  const map: Record<string, string> = {
    topup: "Wallet Top-up",
    reserve: "Generation Reserve",
    release_reserve: "Reserve Released",
    spend: "Creator Payment",
    refund: "Refund",
    bonus: "Bonus",
    adjustment: "Adjustment",
    withdraw: "Withdrawal",
  };
  return map[type] ?? type.replace(/_/g, " ");
}

function txIsCredit(type: string): boolean {
  return ["topup", "release_reserve", "refund", "bonus", "adjustment"].includes(type);
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function BillingSkeleton() {
  return (
    <div className="w-full max-w-[1200px] space-y-6">
      <div className="h-12 w-48 animate-pulse rounded-xl bg-[var(--color-secondary)]" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-5">
        <div className="h-56 animate-pulse rounded-2xl bg-[var(--color-secondary)]" />
        <div className="h-56 animate-pulse rounded-2xl bg-[var(--color-secondary)]" />
      </div>
      <div className="h-72 animate-pulse rounded-2xl bg-[var(--color-secondary)]" />
    </div>
  );
}

// ── Status pill ───────────────────────────────────────────────────────────────

function StatusPill({ isCredit }: { isCredit: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] font-700 uppercase tracking-wider ${
        isCredit
          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
          : "border-rose-400/30 bg-rose-400/10 text-rose-300"
      }`}
    >
      {isCredit ? "Credit" : "Debit"}
    </span>
  );
}

// ── Data fetcher + content ────────────────────────────────────────────────────

async function BillingPageInner() {
  let billing: BillingData = {
    credits_remaining: 0,
    credits_lifetime_purchased: 0,
    wallet_available_paise: 0,
    wallet_reserved_paise: 0,
    wallet_balance_paise: 0,
    lifetime_topup_paise: 0,
  };
  let transactions: WalletTransaction[] = [];
  let brandId: string | null = null;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const admin = createAdminClient() as any;

      const { data: brand } = await admin
        .from("brands")
        .select("id, credits_remaining, credits_lifetime_purchased")
        .eq("user_id", user.id)
        .maybeSingle();

      if (brand?.id) {
        brandId = brand.id as string;

        const { data: billingView } = await admin
          .from("v_brand_billing")
          .select(
            "credits_remaining, credits_lifetime_purchased, wallet_balance_paise, wallet_reserved_paise, wallet_available_paise, lifetime_topup_paise",
          )
          // View exposes brand id as `brand_id`, not `id`.
          .eq("brand_id", brandId)
          .maybeSingle();

        if (billingView) {
          billing = {
            credits_remaining: (billingView.credits_remaining as number) ?? 0,
            credits_lifetime_purchased:
              (billingView.credits_lifetime_purchased as number) ?? 0,
            wallet_available_paise:
              (billingView.wallet_available_paise as number) ?? 0,
            wallet_reserved_paise:
              (billingView.wallet_reserved_paise as number) ?? 0,
            wallet_balance_paise:
              (billingView.wallet_balance_paise as number) ?? 0,
            lifetime_topup_paise:
              (billingView.lifetime_topup_paise as number) ?? 0,
          };
        } else {
          billing.credits_remaining = (brand.credits_remaining as number) ?? 0;
          billing.credits_lifetime_purchased =
            (brand.credits_lifetime_purchased as number) ?? 0;
        }

        const { data: txRows } = await admin
          .from("wallet_transactions")
          .select(
            "id, type, amount_paise, balance_after_paise, reference_type, description, created_at",
          )
          .eq("brand_id", brandId)
          .order("created_at", { ascending: false })
          .limit(10);

        if (txRows && Array.isArray(txRows)) {
          transactions = txRows as WalletTransaction[];
        }
      }
    }
  } catch (err) {
    console.error("[brand/billing] data fetch failed:", err);
  }

  return (
    <div className="w-full max-w-[1200px]">
      {/* ═══ Header ═══ */}
      <div className="mb-8">
        <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
          Billing
        </p>
        <h1 className="mt-1 font-display text-[32px] font-800 leading-none tracking-tight text-[var(--color-foreground)] md:text-[40px]">
          Overview
          <span className="text-[var(--color-primary)]">.</span>
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
          Credit balance, wallet funds, and recent transactions — all in one place.
        </p>
      </div>

      {/* ═══ Balance cards (2-up) ═══ */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-5">
        {/* Credits card */}
        <div className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6">
          <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-[var(--color-primary)]/8 blur-3xl" />
          <div className="relative">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary)]/12 text-[var(--color-primary)]">
                <Zap className="h-5 w-5" />
              </div>
              <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-muted-foreground)]">
                Credits
              </p>
            </div>

            <p className="font-display text-[44px] font-800 leading-none tracking-tight text-[var(--color-foreground)]">
              {billing.credits_remaining.toLocaleString("en-IN")}
            </p>
            <p className="mt-2 text-[11px] text-[var(--color-muted-foreground)]">
              {billing.credits_lifetime_purchased.toLocaleString("en-IN")} purchased
              lifetime
            </p>

            <Link
              href="/brand/credits"
              className="mt-5 inline-flex items-center gap-1.5 rounded-[var(--radius-button)] bg-[var(--color-primary)] px-3.5 py-2 text-[12px] font-700 text-[var(--color-primary-foreground)] shadow-[0_4px_14px_-4px_rgba(201,169,110,0.5)] transition-all hover:-translate-y-0.5"
            >
              <Zap className="h-3.5 w-3.5" />
              Buy more credits
            </Link>
          </div>
        </div>

        {/* Wallet card */}
        <div className="relative overflow-hidden rounded-2xl border border-[var(--color-primary)]/30 bg-gradient-to-br from-[var(--color-primary)]/12 via-[var(--color-card)] to-[var(--color-card)] p-6">
          <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-[var(--color-primary)]/15 blur-3xl" />
          <div className="relative">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary)]/20 text-[var(--color-primary)]">
                <Wallet className="h-5 w-5" />
              </div>
              <p className="font-mono text-[10px] font-700 uppercase tracking-[0.22em] text-[var(--color-primary)]">
                Wallet ₹
              </p>
            </div>

            <p className="font-display text-[44px] font-800 leading-none tracking-tight text-[var(--color-foreground)]">
              {formatINR(billing.wallet_available_paise)}
            </p>
            <p className="mt-2 text-[11px] text-[var(--color-muted-foreground)]">
              available
              {billing.wallet_reserved_paise > 0 && (
                <>
                  {" "}
                  ·{" "}
                  <span className="inline-flex items-center gap-1">
                    {formatINRDecimal(billing.wallet_reserved_paise)} in escrow
                    <span title="Held against pending generations — released on creator approval">
                      <HelpCircle className="h-3 w-3" />
                    </span>
                  </span>
                </>
              )}
            </p>

            <Link
              href="/brand/wallet"
              className="mt-5 inline-flex items-center gap-1.5 rounded-[var(--radius-button)] border border-[var(--color-border)] bg-[var(--color-secondary)] px-3.5 py-2 text-[12px] font-700 text-[var(--color-foreground)] transition-all hover:border-[var(--color-primary)]/40"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Top up wallet
            </Link>
          </div>
        </div>
      </div>

      {/* ═══ Lifetime stats strip ═══ */}
      <div className="mb-8 grid grid-cols-2 gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 md:grid-cols-3">
        <div>
          <p className="font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
            Lifetime topped up
          </p>
          <p className="mt-1 font-display text-[20px] font-800 tracking-tight text-[var(--color-foreground)]">
            {formatINRDecimal(billing.lifetime_topup_paise)}
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
            Wallet total
          </p>
          <p className="mt-1 font-display text-[20px] font-800 tracking-tight text-[var(--color-foreground)]">
            {formatINRDecimal(billing.wallet_balance_paise)}
          </p>
        </div>
        <div className="col-span-2 md:col-span-1">
          <p className="font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
            Credits purchased
          </p>
          <p className="mt-1 font-display text-[20px] font-800 tracking-tight text-[var(--color-foreground)]">
            {billing.credits_lifetime_purchased.toLocaleString("en-IN")}
          </p>
        </div>
      </div>

      {/* ═══ Recent transactions table ═══ */}
      <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]">
        <div className="border-b border-[var(--color-border)] px-6 py-4">
          <p className="font-display text-[14px] font-700 text-[var(--color-foreground)]">
            Recent transactions
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--color-muted-foreground)]">
            Last 10 wallet movements
          </p>
        </div>

        {transactions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-secondary)]">
              <Wallet className="h-5 w-5 text-[var(--color-muted-foreground)]" />
            </div>
            <p className="font-display text-[14px] font-700 text-[var(--color-foreground)]">
              No transactions yet
            </p>
            <p className="text-[11px] text-[var(--color-muted-foreground)]">
              Top up your wallet to start generating.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-secondary)]/40">
                  <th className="px-6 py-3 text-left font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                    Reference
                  </th>
                  <th className="px-6 py-3 text-right font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-right font-mono text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  const isCredit = txIsCredit(tx.type);
                  return (
                    <tr
                      key={tx.id}
                      className="border-b border-[var(--color-border)] last:border-0 transition-colors hover:bg-[var(--color-secondary)]/30"
                    >
                      <td className="px-6 py-3.5">
                        <p className="font-mono text-[11px] text-[var(--color-muted-foreground)]">
                          {formatDate(tx.created_at)}
                        </p>
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`flex h-7 w-7 items-center justify-center rounded-full border ${
                              isCredit
                                ? "border-emerald-400/30 bg-emerald-400/10"
                                : "border-rose-400/30 bg-rose-400/10"
                            }`}
                          >
                            {isCredit ? (
                              <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-400" />
                            ) : (
                              <ArrowUpRight className="h-3.5 w-3.5 text-rose-400" />
                            )}
                          </div>
                          <span className="text-[13px] font-600 text-[var(--color-foreground)]">
                            {txTypeLabel(tx.type)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-3.5">
                        <p className="max-w-[200px] truncate text-[12px] text-[var(--color-muted-foreground)]">
                          {tx.description ?? tx.reference_type ?? "—"}
                        </p>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <p
                          className={`font-display text-[13px] font-700 ${
                            isCredit
                              ? "text-emerald-400"
                              : "text-[var(--color-foreground)]"
                          }`}
                        >
                          {isCredit ? "+" : "−"}
                          {formatINRDecimal(tx.amount_paise)}
                        </p>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <StatusPill isCredit={isCredit} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  return (
    <Suspense fallback={<BillingSkeleton />}>
      <BillingPageInner />
    </Suspense>
  );
}

export const dynamic = "force-dynamic";
