import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { order_id, payment_id, signature } = await req.json();

    if (!order_id || !payment_id || !signature) {
      return NextResponse.json(
        { error: "Missing payment details" },
        { status: 400 }
      );
    }

    // Verify Razorpay signature
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) {
      return NextResponse.json(
        { error: "Payment gateway not configured" },
        { status: 500 }
      );
    }

    const body = `${order_id}|${payment_id}`;
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("hex");

    if (expectedSignature !== signature) {
      return NextResponse.json(
        { error: "Payment verification failed" },
        { status: 400 }
      );
    }

    // Fetch order details from Razorpay to get amount
    const keyId = process.env.RAZORPAY_KEY_ID!;
    const auth = Buffer.from(`${keyId}:${secret}`).toString("base64");

    const orderRes = await fetch(
      `https://api.razorpay.com/v1/orders/${order_id}`,
      {
        headers: { Authorization: `Basic ${auth}` },
      }
    );

    if (!orderRes.ok) {
      return NextResponse.json(
        { error: "Failed to verify order" },
        { status: 500 }
      );
    }

    const order = await orderRes.json();
    const amountPaise: number = order.amount;

    // Get current balance
    const { data: lastTx } = await supabase
      .from("wallet_transactions")
      .select("balance_after_paise")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const currentBalance = lastTx?.balance_after_paise ?? 0;
    const newBalance = currentBalance + amountPaise;

    // Create wallet transaction
    const { error: txError } = await supabase
      .from("wallet_transactions")
      .insert({
        user_id: user.id,
        type: "topup",
        amount_paise: amountPaise,
        direction: "credit" as const,
        reference_id: payment_id,
        reference_type: "razorpay_payment",
        balance_after_paise: newBalance,
        description: `Wallet top-up via Razorpay (${order_id})`,
      });

    if (txError) {
      console.error("Failed to record transaction:", txError);
      return NextResponse.json(
        { error: "Payment received but failed to update wallet" },
        { status: 500 }
      );
    }

    // Log success
    await supabase.from("audit_log").insert({
      actor_id: user.id,
      actor_type: "user" as const,
      action: "wallet_topup_completed",
      resource_type: "razorpay_payment",
      resource_id: payment_id,
      metadata: {
        amount_paise: amountPaise,
        order_id,
        payment_id,
        new_balance: newBalance,
      },
    });

    return NextResponse.json({
      success: true,
      balance_paise: newBalance,
    });
  } catch (err) {
    console.error("Verify payment error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
