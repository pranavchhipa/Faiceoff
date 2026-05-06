import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyRazorpayPaymentSignature } from "@/lib/payments/razorpay/webhook";
import { handleWalletTopUpSuccess } from "@/app/api/wallet/handlers";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

const ConfirmSchema = z.object({
  razorpay_payment_id: z.string().min(1),
  razorpay_order_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

// POST /api/wallet/confirm-topup
// Called by frontend after Razorpay checkout handler fires.
// Verifies signature + immediately credits wallet (don't wait for webhook).
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

  // handleWalletTopUpSuccess is idempotent — safe to call even if webhook already processed
  await handleWalletTopUpSuccess(admin, {
    orderId: razorpay_order_id,
    cfPaymentId: razorpay_payment_id,
  });

  return NextResponse.json({ ok: true });
}
