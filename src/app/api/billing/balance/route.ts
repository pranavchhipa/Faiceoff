// ─────────────────────────────────────────────────────────────────────────────
// GET /api/billing/balance — brand billing summary from v_brand_billing view
// Task E10 — Chunk E new route
// ─────────────────────────────────────────────────────────────────────────────
//
// Flow:
//   1. Auth (user must be signed in as a brand)
//   2. Resolve brand by user.id → 404 if none
//   3. SELECT from v_brand_billing view
//   4. Return billing summary JSON
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ── Shape from v_brand_billing view ───────────────────────────────────────────

interface BrandBillingView {
  credits_remaining: number;
  credits_lifetime_purchased: number;
  wallet_balance_paise: number;
  wallet_reserved_paise: number;
  wallet_available_paise: number;
  lifetime_topup_paise: number;
}

// ── Admin client type helper ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminAny = any;

export async function GET(req: NextRequest) {
  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ── 2. Resolve brand ───────────────────────────────────────────────────────
  const admin = createAdminClient() as AdminAny;

  const { data: brand, error: brandError } = await admin
    .from("brands")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (brandError) {
    console.error("[billing/balance] brand lookup failed", brandError);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  if (!brand) {
    return NextResponse.json({ error: "no_brand_profile" }, { status: 404 });
  }
  const brandId = brand.id as string;

  // ── 3. Query v_brand_billing view ─────────────────────────────────────────
  const { data: billing, error: billingError } = await admin
    .from("v_brand_billing")
    .select(
      "credits_remaining, credits_lifetime_purchased, wallet_balance_paise, wallet_reserved_paise, wallet_available_paise, lifetime_topup_paise",
    )
    // The view exposes the brand id as `brand_id`, not `id`. Filtering on
    // `id` returns 0 rows (or errors on some PostgREST versions) and the
    // route then surfaces all-zero balances despite the brand having funds.
    .eq("brand_id", brandId)
    .maybeSingle();

  if (billingError) {
    console.error("[billing/balance] v_brand_billing query failed", billingError);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  if (!billing) {
    // Brand exists but view row is missing — treat as zero balances
    const zeroBilling: BrandBillingView = {
      credits_remaining: 0,
      credits_lifetime_purchased: 0,
      wallet_balance_paise: 0,
      wallet_reserved_paise: 0,
      wallet_available_paise: 0,
      lifetime_topup_paise: 0,
    };
    return NextResponse.json(zeroBilling, { status: 200 });
  }

  // ── 4. Return ──────────────────────────────────────────────────────────────
  const response: BrandBillingView = {
    credits_remaining: billing.credits_remaining as number,
    credits_lifetime_purchased: billing.credits_lifetime_purchased as number,
    wallet_balance_paise: billing.wallet_balance_paise as number,
    wallet_reserved_paise: billing.wallet_reserved_paise as number,
    wallet_available_paise: billing.wallet_available_paise as number,
    lifetime_topup_paise: billing.lifetime_topup_paise as number,
  };

  return NextResponse.json(response, { status: 200 });
}
