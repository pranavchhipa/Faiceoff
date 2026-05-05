import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CashfreeClient } from "@/lib/payments/cashfree/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

function resolveAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

// POST /api/collabs/[id]/start-payment
// [id] = collab_request id. Creates a Cashfree order for the package price.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params;

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient() as Admin;

  const { data: brand } = await admin
    .from("brands")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!brand) return NextResponse.json({ error: "Brand profile not found" }, { status: 403 });

  const { data: req } = await admin
    .from("collab_requests")
    .select("id, status, brand_id, package_tier, package_price_paise, product_name")
    .eq("id", requestId)
    .maybeSingle();

  if (!req) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (req.brand_id !== brand.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (req.status !== "accepted") {
    return NextResponse.json({ error: `Cannot pay for a ${req.status} request` }, { status: 400 });
  }

  const { data: publicUser } = await admin
    .from("users")
    .select("email, phone")
    .eq("id", user.id)
    .maybeSingle();

  const customerEmail = publicUser?.email ?? user.email ?? "noreply@faiceoff.com";
  const customerPhone = (publicUser?.phone as string | null)?.replace(/\D/g, "").slice(-10) ?? "9999999999";

  const amount_paise = req.package_price_paise as number;
  const orderId = `collab_${requestId}_${Date.now()}`;
  const appUrl = resolveAppUrl();

  try {
    const client = new CashfreeClient();
    const cfRes = await client.request<{ order_id: string; payment_session_id: string }>({
      method: "POST",
      path: "/orders",
      body: {
        order_id: orderId,
        order_amount: amount_paise / 100,
        order_currency: "INR",
        customer_details: {
          customer_id: user.id,
          customer_email: customerEmail,
          customer_phone: customerPhone,
        },
        order_meta: {
          return_url: `${appUrl}/brand/collabs/${requestId}/payment?status=done&order_id={order_id}`,
          notify_url: `${appUrl}/api/cashfree/webhook`,
        },
        order_tags: {
          type: "collab_payment",
          collab_request_id: requestId,
          brand_id: brand.id,
        },
      },
    });

    return NextResponse.json({
      order_id: cfRes.order_id,
      payment_session_id: cfRes.payment_session_id,
      amount_paise,
    });
  } catch (err) {
    console.error("[collabs/start-payment]", err);
    return NextResponse.json({ error: "Failed to create payment order" }, { status: 502 });
  }
}
