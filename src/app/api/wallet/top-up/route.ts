// POST /api/wallet/top-up — initiate a Razorpay order for INR wallet top-up
//
// Flow:
//   1. Auth (brand only)
//   2. Validate body: { amount_paise: number }  min ₹500, max ₹5,00,000
//   3. Compute bonus tier
//   4. Resolve brand
//   5. Insert wallet_top_ups row status='initiated'
//   6. Create Razorpay order
//   7. Update row: cf_order_id = rzp_order_id, status='processing'
//   8. Return { orderId, keyId, amount_paise, bonus_paise }

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRazorpayOrder, getRazorpayKeyId } from "@/lib/payments/razorpay/orders";
import { computeWalletBonus } from "@/lib/billing/wallet-bonus";

const WalletTopUpRequestSchema = z.object({
  amount_paise: z
    .number()
    .int()
    .min(50_000, "minimum top-up is ₹500")
    .max(50_000_000, "maximum top-up is ₹5,00,000"),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let rawBody: unknown;
  try { rawBody = await req.json(); }
  catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const parsed = WalletTopUpRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.issues }, { status: 400 });
  }
  const { amount_paise } = parsed.data;
  const bonus_paise = computeWalletBonus(amount_paise).bonusPaise;

  const admin = createAdminClient() as Admin;

  const { data: brand } = await admin
    .from("brands")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!brand) return NextResponse.json({ error: "no_brand_profile" }, { status: 404 });
  const brandId = brand.id as string;

  const { data: topUpRow, error: insertError } = await admin
    .from("wallet_top_ups")
    .insert({ brand_id: brandId, amount_paise, bonus_paise, status: "initiated" })
    .select()
    .single();

  if (insertError || !topUpRow) {
    console.error("[wallet/top-up] insert failed", insertError);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  const topUpId = topUpRow.id as string;

  try {
    const order = await createRazorpayOrder({
      amount_paise,
      receipt: topUpId.slice(0, 40),
      notes: { type: "wallet_top_up", wallet_top_up_id: topUpId, brand_id: brandId },
    });

    await admin
      .from("wallet_top_ups")
      .update({ cf_order_id: order.id, status: "processing" })
      .eq("id", topUpId);

    return NextResponse.json({
      orderId: order.id,
      keyId: getRazorpayKeyId(),
      amount_paise,
      bonus_paise,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "razorpay_error";
    await admin
      .from("wallet_top_ups")
      .update({ status: "failed", failure_reason: reason.slice(0, 500) })
      .eq("id", topUpId);
    console.error("[wallet/top-up] Razorpay createOrder failed", err);
    return NextResponse.json({ error: "payment_gateway_error", message: reason }, { status: 502 });
  }
}
