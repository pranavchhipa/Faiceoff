// ─────────────────────────────────────────────────────────────────────────────
// /brand/wallet — wallet top-up page (Chunk E rewrite)
// Task E22 — replaces legacy stub with live top-up UI
// ─────────────────────────────────────────────────────────────────────────────

import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { WalletTopup } from "./wallet-topup";

// ── Types ──────────────────────────────────────────────────────────────────────

interface WalletBalance {
  wallet_balance_paise: number;
  wallet_reserved_paise: number;
  wallet_available_paise: number;
  lifetime_topup_paise: number;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function WalletSkeleton() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="h-8 w-32 animate-pulse rounded-xl bg-[var(--color-neutral-200)]" />
        <div className="mt-2 h-4 w-72 animate-pulse rounded-xl bg-[var(--color-neutral-100)]" />
      </div>
      <div className="h-72 animate-pulse rounded-[var(--radius-card)] bg-[var(--color-neutral-100)]" />
      <div className="h-48 animate-pulse rounded-[var(--radius-card)] bg-[var(--color-neutral-100)]" />
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
  };

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const admin = createAdminClient() as any;

      // Resolve brand id
      const { data: brand } = await admin
        .from("brands")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (brand?.id) {
        // Query v_brand_billing view for balances. View exposes brand id
        // as `brand_id`, NOT `id`.
        const { data: billing } = await admin
          .from("v_brand_billing")
          .select(
            "wallet_balance_paise, wallet_reserved_paise, wallet_available_paise, lifetime_topup_paise",
          )
          .eq("brand_id", brand.id)
          .maybeSingle();

        if (billing) {
          walletBalance = {
            wallet_balance_paise: billing.wallet_balance_paise as number ?? 0,
            wallet_reserved_paise: billing.wallet_reserved_paise as number ?? 0,
            wallet_available_paise: billing.wallet_available_paise as number ?? 0,
            lifetime_topup_paise: billing.lifetime_topup_paise as number ?? 0,
          };
        }
      }
    }
  } catch (err) {
    console.error("[brand/wallet] failed to fetch balance:", err);
  }

  return <WalletTopup initialBalance={walletBalance} />;
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
