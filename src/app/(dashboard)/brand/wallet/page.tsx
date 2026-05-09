// ─────────────────────────────────────────────────────────────────────────────
// /brand/wallet — single source of truth for everything money.
//
// Single-pool credit model:
//   wallet (INR) + credit balance + transactions ledger live on this page.
//   Billing was merged into Wallet (see /brand/billing — now a redirect).
//
// Server component: fetches balance + recent transactions, then hands the
// data to <WalletTopup> (client island for Razorpay Checkout integration).
// ─────────────────────────────────────────────────────────────────────────────

import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { WalletTopup, type WalletBalance, type WalletTransaction } from "./wallet-topup";

// ── Skeleton ──────────────────────────────────────────────────────────────────

function WalletSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 px-4 py-6 lg:px-8 lg:py-8">
      <div className="space-y-2">
        <div className="h-3 w-48 animate-pulse rounded bg-[var(--color-secondary)]" />
        <div className="h-10 w-40 animate-pulse rounded-xl bg-[var(--color-secondary)]" />
        <div className="h-4 w-72 animate-pulse rounded bg-[var(--color-secondary)]" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="h-24 animate-pulse rounded-2xl bg-[var(--color-secondary)]" />
        <div className="h-24 animate-pulse rounded-2xl bg-[var(--color-secondary)]" />
        <div className="h-24 animate-pulse rounded-2xl bg-[var(--color-secondary)]" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
        <div className="h-[420px] animate-pulse rounded-2xl bg-[var(--color-secondary)] lg:col-span-2" />
        <div className="h-[420px] animate-pulse rounded-2xl bg-[var(--color-secondary)]" />
      </div>
    </div>
  );
}

// ── Data fetcher ──────────────────────────────────────────────────────────────

async function WalletPageInner() {
  let walletBalance: WalletBalance = {
    wallet_balance_paise: 0,
    wallet_reserved_paise: 0,
    wallet_available_paise: 0,
    lifetime_topup_paise: 0,
    credits_remaining: 0,
    credits_lifetime_purchased: 0,
  };
  let transactions: WalletTransaction[] = [];

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const admin = createAdminClient() as any;

      // Resolve brand id
      const { data: brand } = await admin
        .from("brands")
        .select("id, credits_remaining, credits_lifetime_purchased")
        .eq("user_id", user.id)
        .maybeSingle();

      if (brand?.id) {
        // Query v_brand_billing view for balances. Note: view exposes brand id
        // as `brand_id` in some envs; fall back to `id` if needed.
        const { data: billing } = await admin
          .from("v_brand_billing")
          .select(
            "wallet_balance_paise, wallet_reserved_paise, wallet_available_paise, lifetime_topup_paise, credits_remaining, credits_lifetime_purchased",
          )
          .eq("brand_id", brand.id)
          .maybeSingle();

        if (billing) {
          walletBalance = {
            wallet_balance_paise: (billing.wallet_balance_paise as number) ?? 0,
            wallet_reserved_paise: (billing.wallet_reserved_paise as number) ?? 0,
            wallet_available_paise: (billing.wallet_available_paise as number) ?? 0,
            lifetime_topup_paise: (billing.lifetime_topup_paise as number) ?? 0,
            credits_remaining:
              (billing.credits_remaining as number) ??
              (brand.credits_remaining as number) ??
              0,
            credits_lifetime_purchased:
              (billing.credits_lifetime_purchased as number) ??
              (brand.credits_lifetime_purchased as number) ??
              0,
          };
        } else {
          walletBalance.credits_remaining =
            (brand.credits_remaining as number) ?? 0;
          walletBalance.credits_lifetime_purchased =
            (brand.credits_lifetime_purchased as number) ?? 0;
        }

        // Recent transactions — pulls from wallet_transactions if it exists,
        // else falls back to credit_transactions. Try wallet first.
        const { data: walletTxRows } = await admin
          .from("wallet_transactions")
          .select(
            "id, type, amount_paise, balance_after_paise, reference_type, description, created_at",
          )
          .eq("brand_id", brand.id)
          .order("created_at", { ascending: false })
          .limit(20);

        if (walletTxRows && Array.isArray(walletTxRows) && walletTxRows.length > 0) {
          transactions = walletTxRows as WalletTransaction[];
        } else {
          // Fallback: credit_transactions ledger
          const { data: creditTxRows } = await admin
            .from("credit_transactions")
            .select(
              "id, type, amount_paise, balance_after_paise, description, created_at",
            )
            .eq("brand_id", brand.id)
            .order("created_at", { ascending: false })
            .limit(20);

          if (creditTxRows && Array.isArray(creditTxRows)) {
            transactions = (creditTxRows as Array<{
              id: string;
              type: string;
              amount_paise: number;
              balance_after_paise: number;
              description: string | null;
              created_at: string;
            }>).map((t) => ({
              id: t.id,
              type: t.type,
              amount_paise: t.amount_paise,
              balance_after_paise: t.balance_after_paise,
              reference_type: null,
              description: t.description,
              created_at: t.created_at,
            }));
          }
        }
      }
    }
  } catch (err) {
    console.error("[brand/wallet] failed to fetch data:", err);
  }

  return (
    <WalletTopup
      initialBalance={walletBalance}
      initialTransactions={transactions}
    />
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BrandWalletPage() {
  return (
    <Suspense fallback={<WalletSkeleton />}>
      <WalletPageInner />
    </Suspense>
  );
}

export const dynamic = "force-dynamic";
