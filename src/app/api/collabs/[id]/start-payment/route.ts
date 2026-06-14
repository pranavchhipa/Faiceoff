import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRazorpayOrder, getRazorpayKeyId } from "@/lib/payments/razorpay/orders";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

// POST /api/collabs/[id]/start-payment
// [id] = collab_request id. Creates a Razorpay order for the package price.
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
    .select("id, is_verified")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!brand) return NextResponse.json({ error: "Brand profile not found" }, { status: 403 });
  if (brand.is_verified !== true) {
    return NextResponse.json(
      { error: "verification_required", message: "Get your brand verified before starting a collaboration." },
      { status: 403 },
    );
  }

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

  const amount_paise = req.package_price_paise as number;

  try {
    const order = await createRazorpayOrder({
      amount_paise,
      receipt: requestId.slice(0, 40),
      notes: {
        type: "collab_payment",
        collab_request_id: requestId,
        brand_id: brand.id,
        product_name: (req.product_name as string ?? "").slice(0, 50),
      },
    });

    return NextResponse.json({
      order_id: order.id,
      key_id: getRazorpayKeyId(),
      amount_paise,
    });
  } catch (err) {
    console.error("[collabs/start-payment]", err);
    return NextResponse.json({ error: "Failed to create payment order" }, { status: 502 });
  }
}
