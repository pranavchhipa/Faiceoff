// ─────────────────────────────────────────────────────────────────────────────
// /brand/billing — billing overview (server component)
// Task E23 — Chunk E
// ─────────────────────────────────────────────────────────────────────────────

import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
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
    <div className="max-w-5xl space-y-6">
      <div className="h-8 w-40 animate-pulse rounded-xl bg-[var(--color-neutral-200)]" />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="h-52 animate-pulse rounded-[var(--radius-card)] bg-[var(--color-neutral-100)]" />
        <div className="h-52 animate-pulse rounded-[var(--radius-card)] bg-[var(--color-neutral-100)]" />
      </div>
      <div className="h-72 animate-pulse rounded-[var(--radius-card)] bg-[var(--color-neutral-100)]" />
    </div>
  );
}

// ── Status pill ───────────────────────────────────────────────────────────────

function StatusPill({ isCredit }: { isCredit: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-700 uppercase tracking-wide ${
        isCredit
          ? "bg-[var(--color-mint)] text-green-700"
          : "bg-[var(--color-blush)] text-red-600"
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
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const admin = createAdminClient() as any;

      // Resolve brand
      const { data: brand } = await admin
        .from("brands")
        .select("id, credits_remaining, credits_lifetime_purchased")
        .eq("user_id", user.id)
        .maybeSingle();

      if (brand?.id) {
        brandId = brand.id as string;

        // Billing view
        const { data: billingView } = await admin
          .from("v_brand_billing")
          .select(
            "credits_remaining, credits_lifetime_purchased, wallet_balance_paise, wallet_reserved_paise, wallet_available_paise, lifetime_topup_paise",
          )
          .eq("id", brandId)
          .maybeSingle();

        if (billingView) {
          billing = {
            credits_remaining: billingView.credits_remaining as number ?? 0,
            credits_lifetime_purchased: billingView.credits_lifetime_purchased as number ?? 0,
            wallet_available_paise: billingView.wallet_available_paise as number ?? 0,
            wallet_reserved_paise: billingView.wallet_reserved_paise as number ?? 0,
            wallet_balance_paise: billingView.wallet_balance_paise as number ?? 0,
            lifetime_topup_paise: billingView.lifetime_topup_paise as number ?? 0,
          };
        } else {
          // Fallback: use brand row columns if view is empty
          billing.credits_remaining = brand.credits_remaining as number ?? 0;
          billing.credits_lifetime_purchased = brand.credits_lifetime_purchased as number ?? 0;
        }

        // Last 10 wallet transactions (new ledger)
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
    <div className="max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-800 tracking-tight text-[var(--color-on-surface)]">
          Billing overview
        </h1>
        <p className="mt-1 text-sm text-[var(--color-outline-variant)]">
          Your credit balance, wallet funds, and recent transactions.
        </p>
      </div>

      {/* 2-column balance cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 mb-8">
        {/* Credits card */}
        <div className="rounded-[var(--radius-card)] border border-[var(--color-ocean-deep)]/40 bg-gradient-to-br from-[var(--color-ocean)]/30 to-white p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex size-10 items-center justify-center rounded-full bg-[var(--color-ocean)]/60">
              <Zap className="size-5 text-[var(--color-primary)]" />
            </div>
            <p className="text-[10px] font-700 uppercase tracking-widest text-[var(--color-outline-variant)] mt-1">
              Credits
            </p>
          </div>

          <p className="text-4xl font-800 text-[var(--color-on-surface)] mb-1">
            {billing.credits_remaining.toLocaleString("en-IN")}
          </p>
          <p className="text-xs text-[var(--color-outline-variant)] mb-6">
            {billing.credits_lifetime_purchased.toLocaleString("en-IN")} purchased lifetime
          </p>

          <Link href="/brand/credits">
            <Button
              size="sm"
              className="rounded-[var(--radius-button)] bg-[var(--color-primary)] font-600 text-white hover:bg-[var(--color-primary-dim)]"
            >
              <Zap className="size-3.5" />
              Buy more credits
            </Button>
          </Link>
        </div>

        {/* Wallet card */}
        <div className="rounded-[var(--radius-card)] border border-[var(--color-accent-gold)]/30 bg-gradient-to-br from-[var(--color-accent-gold)]/10 to-white p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex size-10 items-center justify-center rounded-full bg-[var(--color-accent-gold)]/20">
              <Wallet className="size-5 text-[var(--color-accent-gold)]" />
            </div>
            <p className="text-[10px] font-700 uppercase tracking-widest text-[var(--color-outline-variant)] mt-1">
              Wallet ₹
            </p>
          </div>

          <p className="text-4xl font-800 text-[var(--color-on-surface)] mb-1">
            {formatINR(billing.wallet_available_paise)}
          </p>
          <p className="text-xs text-[var(--color-outline-variant)] mb-1">
            available balance
          </p>

          {billing.wallet_reserved_paise > 0 && (
            <div className="flex items-center gap-1 mb-1">
              <p className="text-xs text-[var(--color-outline-variant)]">
                {formatINRDecimal(billing.wallet_reserved_paise)} in escrow
              </p>
              <span title="Funds held in escrow on pending generations — released on creator approval">
                <HelpCircle className="size-3 text-[var(--color-outline-variant)]" />
              </span>
            </div>
          )}

          <p className="text-xs text-[var(--color-outline-variant)] mb-5">
            {formatINRDecimal(billing.lifetime_topup_paise)} topped up lifetime
          </p>

          <Link href="/brand/wallet">
            <Button
              size="sm"
              className="rounded-[var(--radius-button)] bg-[var(--color-accent-gold)] font-600 text-white hover:bg-[var(--color-accent-gold-hover)]"
            >
              <ExternalLink className="size-3.5" />
              Top up wallet
            </Button>
          </Link>
        </div>
      </div>

      {/* Recent transactions */}
      <div className="rounded-[var(--radius-card)] border border-[var(--color-outline-variant)]/20 bg-[var(--color-surface-container-lowest)] shadow-[var(--shadow-card)]">
        <div className="border-b border-[var(--color-outline-variant)]/10 px-6 py-4">
          <p className="text-sm font-700 text-[var(--color-on-surface)]">Recent transactions</p>
          <p className="text-xs text-[var(--color-outline-variant)]">Last 10 wallet movements</p>
        </div>

        {transactions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-12 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-[var(--color-surface-container-low)]">
              <Wallet className="size-5 text-[var(--color-outline-variant)]" />
            </div>
            <p className="text-sm font-600 text-[var(--color-on-surface)]">No transactions yet</p>
            <p className="text-xs text-[var(--color-outline-variant)]">
              Top up your wallet to start generating.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-[var(--color-outline-variant)]/10">
                  <th className="px-6 py-3 text-left text-[10px] font-700 uppercase tracking-widest text-[var(--color-outline-variant)]">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-[10px] font-700 uppercase tracking-widest text-[var(--color-outline-variant)]">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-[10px] font-700 uppercase tracking-widest text-[var(--color-outline-variant)]">
                    Reference
                  </th>
                  <th className="px-6 py-3 text-right text-[10px] font-700 uppercase tracking-widest text-[var(--color-outline-variant)]">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-right text-[10px] font-700 uppercase tracking-widest text-[var(--color-outline-variant)]">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-outline-variant)]/10">
                {transactions.map((tx) => {
                  const isCredit = txIsCredit(tx.type);
                  return (
                    <tr key={tx.id} className="hover:bg-[var(--color-surface-container-low)]/40 transition-colors">
                      <td className="px-6 py-3.5">
                        <p className="text-xs text-[var(--color-outline-variant)]">
                          {formatDate(tx.created_at)}
                        </p>
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-2">
                          <div
                            className={`flex size-7 items-center justify-center rounded-full ${
                              isCredit
                                ? "bg-[var(--color-mint)]"
                                : "bg-[var(--color-blush)]"
                            }`}
                          >
                            {isCredit ? (
                              <ArrowDownLeft className="size-3.5 text-green-600" />
                            ) : (
                              <ArrowUpRight className="size-3.5 text-red-500" />
                            )}
                          </div>
                          <span className="text-sm font-600 text-[var(--color-on-surface)]">
                            {txTypeLabel(tx.type)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-3.5">
                        <p className="text-xs text-[var(--color-outline-variant)] truncate max-w-[160px]">
                          {tx.description ?? tx.reference_type ?? "—"}
                        </p>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <p
                          className={`text-sm font-700 ${
                            isCredit ? "text-green-600" : "text-[var(--color-on-surface)]"
                          }`}
                        >
                          {isCredit ? "+" : "-"}
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
