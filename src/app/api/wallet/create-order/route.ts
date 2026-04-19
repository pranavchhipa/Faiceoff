import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
      console.error("[wallet/create-order] Missing Razorpay env vars", {
        has_key_id: !!keyId,
        has_key_secret: !!keySecret,
      });
      return NextResponse.json(
        {
          error:
            "Payment gateway not configured — RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET missing on server",
        },
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
      // Razorpay caps `receipt` at 40 chars. UUID alone is 36, so we can't
      // include the full user id. Use first 8 chars of the UUID + base36
      // timestamp — still unique enough for reconciliation, and the full
      // user_id is preserved in `notes` for lookup.
      body: JSON.stringify({
        amount: amount_paise,
        currency: "INR",
        receipt: `wlt_${user.id.slice(0, 8)}_${Date.now().toString(36)}`,
        notes: {
          user_id: user.id,
          type: "wallet_topup",
        },
      }),
    });

    if (!rzpRes.ok) {
      const errText = await rzpRes.text();
      console.error(
        "[wallet/create-order] Razorpay order creation failed:",
        rzpRes.status,
        errText
      );

      // Try to extract Razorpay's structured error so the client can show
      // something actionable ("Authentication failed", "invalid amount", etc.)
      let rzpMessage: string | null = null;
      try {
        const parsed = JSON.parse(errText) as {
          error?: { description?: string; code?: string };
        };
        rzpMessage = parsed.error?.description ?? null;
      } catch {
        // not JSON — leave null
      }

      return NextResponse.json(
        {
          error: rzpMessage
            ? `Razorpay: ${rzpMessage}`
            : `Failed to create payment order (status ${rzpRes.status})`,
          razorpay_status: rzpRes.status,
        },
        { status: 500 }
      );
    }

    const order = await rzpRes.json();

    // Store order reference for verification.
    //
    // Must use admin client: migration 00012 intentionally ships no
    // client-side insert policy on audit_log ("Insert is handled via
    // service role (server-side only)"), so a user-scoped insert
    // silently fails under RLS. verify-payment already uses the admin
    // client for its audit_log write; this keeps the pair consistent
    // and ensures the topup_initiated → topup_completed trail is
    // actually recorded for DPDP compliance.
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
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
