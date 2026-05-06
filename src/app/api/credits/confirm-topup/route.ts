import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyRazorpayPaymentSignature } from "@/lib/payments/razorpay/webhook";
import { addCredits } from "@/lib/billing/credits-service";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

const ConfirmSchema = z.object({
  razorpay_payment_id: z.string().min(1),
  razorpay_order_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

// POST /api/credits/confirm-topup
// Called by frontend after Razorpay checkout success.
// Verifies signature + grants credits immediately (don't wait for webhook).
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = ConfirmSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid params" }, { status: 400 });

  const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = parsed.data;

  // Verify signature
  const valid = verifyRazorpayPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
  if (!valid) return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });

  const admin = createAdminClient() as Admin;

  // Look up the credit_top_ups row by Razorpay order ID (stored in cf_order_id)
  const { data: topUp } = await admin
    .from("credit_top_ups")
    .select("id, brand_id, status")
    .eq("cf_order_id", razorpay_order_id)
    .maybeSingle();

  if (!topUp) return NextResponse.json({ error: "Top-up order not found" }, { status: 404 });

  // Idempotency: already credited
  if (topUp.status === "success") {
    return NextResponse.json({ ok: true, idempotent: true });
  }

  // Verify brand ownership
  const { data: brand } = await admin.from("brands").select("id").eq("user_id", user.id).maybeSingle();
  if (!brand || brand.id !== topUp.brand_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Mark as success
  await admin
    .from("credit_top_ups")
    .update({
      status: "success",
      cf_payment_id: razorpay_payment_id,
      completed_at: new Date().toISOString(),
      credits_granted: topUp.credits ?? 0,
    })
    .eq("id", topUp.id);

  // Grant credits — idempotent via credit_transactions ledger check
  try {
    await addCredits({ brandId: topUp.brand_id, topUpId: topUp.id });
  } catch (err) {
    console.error("[credits/confirm-topup] addCredits failed", err);
    // Don't 500 — top-up is marked success, webhook will retry addCredits
  }

  return NextResponse.json({ ok: true });
}
