// ─────────────────────────────────────────────────────────────────────────────
// GET /api/credits/balance — brand wallet snapshot + last 20 transactions
// Ref plan Task 18
// ─────────────────────────────────────────────────────────────────────────────
//
// Response shape:
//   {
//     credits_balance_paise:  number,
//     credits_reserved_paise: number,
//     available_paise:        number,   // balance - reserved (floored at 0)
//     lifetime_topup_paise:   number,
//     recent_transactions:    Array<{ id, type, amount_paise, balance_after_paise, description, created_at }>
//   }
//
// Always uses the admin client (ledger fields are sensitive; RLS isn't
// enforced here because we explicitly scope by the authenticated user's brand
// row).
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const RECENT_TX_LIMIT = 20;

interface BrandBalanceRow {
  id: string;
  user_id: string;
  credits_balance_paise: number;
  credits_reserved_paise: number;
  lifetime_topup_paise: number;
}

interface RecentTxRow {
  id: string;
  type: string;
  amount_paise: number;
  balance_after_paise: number;
  description: string | null;
  created_at: string;
}

export async function GET(_req: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ── Resolve brand ──────────────────────────────────────────────────────────
  // The new credit columns on brands (credits_balance_paise etc.) aren't in
  // src/types/supabase.ts yet; use a loose typed handle.
  const admin = createAdminClient();
  const adminUntyped = admin as unknown as {
    from(table: string): {
      select(cols?: string): {
        eq(col: string, val: string): {
          maybeSingle(): Promise<{
            data: Record<string, unknown> | null;
            error: { message: string } | null;
          }>;
          order(
            col: string,
            opts: { ascending: boolean },
          ): {
            limit(
              n: number,
            ): Promise<{
              data: Record<string, unknown>[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };

  const { data: brandData, error: brandError } = await adminUntyped
    .from("brands")
    .select(
      "id, user_id, credits_balance_paise, credits_reserved_paise, lifetime_topup_paise",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (brandError) {
    console.error("[credits/balance] brand lookup failed", brandError);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  if (!brandData) {
    return NextResponse.json({ error: "no_brand_profile" }, { status: 404 });
  }

  const brand = brandData as unknown as BrandBalanceRow;

  // ── Recent transactions ────────────────────────────────────────────────────
  const { data: txs, error: txError } = await adminUntyped
    .from("credit_transactions")
    .select(
      "id, type, amount_paise, balance_after_paise, description, created_at",
    )
    .eq("brand_id", brand.id)
    .order("created_at", { ascending: false })
    .limit(RECENT_TX_LIMIT);

  if (txError) {
    console.error("[credits/balance] tx lookup failed", txError);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  const available_paise = Math.max(
    0,
    brand.credits_balance_paise - brand.credits_reserved_paise,
  );

  const recent_transactions = ((txs ?? []) as unknown as RecentTxRow[]).map(
    (t) => ({
      id: t.id,
      type: t.type,
      amount_paise: t.amount_paise,
      balance_after_paise: t.balance_after_paise,
      description: t.description,
      created_at: t.created_at,
    }),
  );

  return NextResponse.json({
    credits_balance_paise: brand.credits_balance_paise,
    credits_reserved_paise: brand.credits_reserved_paise,
    available_paise,
    lifetime_topup_paise: brand.lifetime_topup_paise,
    recent_transactions,
  });
}
