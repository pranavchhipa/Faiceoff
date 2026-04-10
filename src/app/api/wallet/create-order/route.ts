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

    const { amount_paise } = await req.json();

    if (!amount_paise || amount_paise < 100) {
      return NextResponse.json(
        { error: "Minimum amount is ₹1 (100 paise)" },
        { status: 400 }
      );
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return NextResponse.json(
        { error: "Payment gateway not configured" },
        { status: 500 }
      );
    }

    // Create Razorpay order via REST API
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

    const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        amount: amount_paise,
        currency: "INR",
        receipt: `wallet_${user.id}_${Date.now()}`,
        notes: {
          user_id: user.id,
          type: "wallet_topup",
        },
      }),
    });

    if (!rzpRes.ok) {
      const err = await rzpRes.text();
      console.error("Razorpay order creation failed:", err);
      return NextResponse.json(
        { error: "Failed to create payment order" },
        { status: 500 }
      );
    }

    const order = await rzpRes.json();

    // Store order reference for verification
    await supabase.from("audit_log").insert({
      actor_id: user.id,
      actor_type: "user" as const,
      action: "wallet_topup_initiated",
      resource_type: "razorpay_order",
      resource_id: order.id,
      metadata: { amount_paise, order_id: order.id },
    });

    return NextResponse.json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (err) {
    console.error("Create order error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Verify signature helper — exported for use in verify-payment route
export function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string
): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;

  const body = `${orderId}|${paymentId}`;
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  return expectedSignature === signature;
}
