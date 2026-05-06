// POST /api/credits/top-up — create a Razorpay order for a credit pack
//
// Flow:
//   1. Auth (brand only)
//   2. Parse + validate body: { pack: 'spark'|'flow'|'pro'|'studio'|'enterprise' }
//   3. Resolve pack from credit_packs_catalog
//   4. Resolve brand
//   5. Insert credit_top_ups row status='initiated'
//   6. Create Razorpay order
//   7. Update row: cf_order_id + status='processing'
//   8. Return { orderId, keyId, amount_paise, credits, bonus_credits }

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRazorpayOrder, getRazorpayKeyId } from "@/lib/payments/razorpay/orders";
import { getPackByCode, BillingError } from "@/lib/billing";

const PURCHASABLE_PACK_CODES = [
  "spark",
  "flow",
  "pro",
  "studio",
  "enterprise",
] as const;

const TopUpRequestSchema = z.object({
  pack: z.enum(PURCHASABLE_PACK_CODES),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export async function POST(req: NextRequest) {
  // 1. Auth
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // 2. Parse body
  let rawBody: unknown;
  try { rawBody = await req.json(); }
  catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const parsed = TopUpRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.issues }, { status: 400 });
  }
  const { pack: packCode } = parsed.data;

  // 3. Resolve pack
  let packConfig;
  try {
    packConfig = await getPackByCode(packCode);
  } catch (err) {
    if (err instanceof BillingError && err.code === "PACK_NOT_FOUND") {
      return NextResponse.json({ error: "pack_not_found", pack: packCode }, { status: 400 });
    }
    console.error("[credits/top-up] getPackByCode failed", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  if (!packConfig.is_active) {
    return NextResponse.json({ error: "pack_inactive", pack: packCode }, { status: 400 });
  }

  // 4. Resolve brand
  const admin = createAdminClient() as Admin;
  const { data: brand } = await admin.from("brands").select("id").eq("user_id", user.id).maybeSingle();
  if (!brand) return NextResponse.json({ error: "no_brand_profile" }, { status: 404 });
  const brandId = brand.id as string;

  // 5. Insert credit_top_ups row
  const { data: topUpRow, error: insertError } = await admin
    .from("credit_top_ups")
    .insert({
      brand_id: brandId,
      pack: packCode,
      credits: packConfig.credits,
      bonus_credits: packConfig.bonus_credits,
      credits_granted: 0,
      amount_paise: packConfig.price_paise,
      status: "initiated",
    })
    .select()
    .single();

  if (insertError || !topUpRow) {
    console.error("[credits/top-up] insert failed", insertError);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  const topUpId = topUpRow.id as string;

  // 6. Create Razorpay order
  try {
    const order = await createRazorpayOrder({
      amount_paise: packConfig.price_paise,
      receipt: topUpId.slice(0, 40),
      notes: {
        type: "credit_top_up",
        credit_top_up_id: topUpId,
        brand_id: brandId,
        pack: packCode,
      },
    });

    // 7. Update row with order ID
    await admin
      .from("credit_top_ups")
      .update({ cf_order_id: order.id, status: "processing" })
      .eq("id", topUpId);

    // 8. Return
    return NextResponse.json({
      orderId: order.id,
      keyId: getRazorpayKeyId(),
      amount_paise: packConfig.price_paise,
      credits: packConfig.credits,
      bonus_credits: packConfig.bonus_credits,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "razorpay_error";
    await admin
      .from("credit_top_ups")
      .update({ status: "failed", failure_reason: reason.slice(0, 500) })
      .eq("id", topUpId);
    console.error("[credits/top-up] Razorpay createOrder failed", err);
    return NextResponse.json({ error: "payment_unavailable", message: reason }, { status: 502 });
  }
}
