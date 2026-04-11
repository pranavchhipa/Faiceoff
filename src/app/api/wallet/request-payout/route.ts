import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only creators can request payouts
    const role = user.user_metadata?.role ?? "creator";
    if (role !== "creator") {
      return NextResponse.json(
        { error: "Only creators can request payouts" },
        { status: 403 },
      );
    }

    const { amount_paise } = await req.json();

    if (!amount_paise || typeof amount_paise !== "number") {
      return NextResponse.json(
        { error: "Amount is required" },
        { status: 400 },
      );
    }

    // Minimum payout: ₹100 (10000 paise)
    const MIN_PAYOUT_PAISE = 10000;
    if (amount_paise < MIN_PAYOUT_PAISE) {
      return NextResponse.json(
        { error: "Minimum payout amount is ₹100" },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    // Get current balance from latest transaction
    const { data: lastTx } = await admin
      .from("wallet_transactions")
      .select("balance_after_paise")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const currentBalance = lastTx?.balance_after_paise ?? 0;

    if (amount_paise > currentBalance) {
      return NextResponse.json(
        { error: "Insufficient balance" },
        { status: 400 },
      );
    }

    const newBalance = currentBalance - amount_paise;

    // Create payout transaction
    const { error: txError } = await admin
      .from("wallet_transactions")
      .insert({
        user_id: user.id,
        type: "payout",
        amount_paise,
        direction: "debit",
        reference_type: "payout_request",
        balance_after_paise: newBalance,
        description: "Payout to bank account (processing 3-5 business days)",
      });

    if (txError) {
      console.error("[request-payout] txn error:", txError.message);
      return NextResponse.json(
        { error: "Failed to process payout request" },
        { status: 500 },
      );
    }

    // Audit log
    await admin.from("audit_log").insert({
      actor_id: user.id,
      actor_type: "user",
      action: "payout_requested",
      resource_type: "wallet",
      resource_id: user.id,
      metadata: {
        amount_paise,
        previous_balance: currentBalance,
        new_balance: newBalance,
      },
    });

    return NextResponse.json({
      success: true,
      amount_paise,
      new_balance_paise: newBalance,
    });
  } catch (err) {
    console.error("[request-payout] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
