import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/wallet/transactions
 *
 * Returns the authenticated user's wallet transactions + current balance.
 * Uses the admin client server-side so RLS quirks between environments
 * (missing policy on new prod projects, service role context, etc.) can
 * never silently 500 the whole wallet UI.
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

    const { data, error } = await admin
      .from("wallet_transactions")
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
