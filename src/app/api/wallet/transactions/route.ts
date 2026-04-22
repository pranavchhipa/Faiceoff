import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/wallet/transactions
 *
 * Returns the authenticated user's historical wallet transactions + the last
 * recorded balance. Reads from `wallet_transactions_archive` — the pre-Chunk-C
 * table that was sealed against new writes in migration 00027. New money
 * movement (brand credits + creator earnings via escrow_ledger) lives in the
 * specialised ledgers introduced in 00020-00023 and is surfaced via
 * /api/credits/balance + the Chunk B /brand/credits page.
 *
 * This route is kept only for the legacy /dashboard/wallet view which now
 * renders as a read-only historical archive (see that page for context).
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    // Cast to any because Supabase generated types in src/types/supabase.ts
    // still reference `wallet_transactions`; the DB table is renamed to
    // wallet_transactions_archive by migration 00027 and types will self-fix
    // on next regen. Avoids a hard compile error without making the user wait
    // for a types refresh.
    const adminUntyped = admin as unknown as {
      from(table: string): {
        select(cols: string): {
          eq(col: string, val: string): {
            order(
              col: string,
              opts: { ascending: boolean },
            ): {
              limit(n: number): Promise<{
                data: Array<{
                  id: string;
                  type: string;
                  amount_paise: number;
                  direction: "credit" | "debit";
                  reference_type: string | null;
                  description: string | null;
                  balance_after_paise: number;
                  created_at: string;
                }> | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
    };

    const { data, error } = await adminUntyped
      .from("wallet_transactions_archive")
      .select(
        "id, type, amount_paise, direction, reference_type, description, balance_after_paise, created_at"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[wallet/transactions] db error:", error);
      return NextResponse.json(
        { error: "Failed to load transactions" },
        { status: 500 }
      );
    }

    const transactions = data ?? [];
    const balance_paise =
      transactions.length > 0 ? transactions[0].balance_after_paise : 0;

    return NextResponse.json({
      transactions,
      balance_paise,
    });
  } catch (err) {
    console.error("[wallet/transactions] unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
