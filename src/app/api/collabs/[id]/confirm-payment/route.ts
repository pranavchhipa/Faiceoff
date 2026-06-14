import { NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { track } from "@/lib/observability/analytics";
import { verifyRazorpayPaymentSignature } from "@/lib/payments/razorpay/webhook";
import { sendCreatorPaymentReceived } from "@/lib/email/transactional";
import { emitNotification } from "@/lib/notifications/emit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

// POST /api/collabs/[id]/confirm-payment
// [id] = collab_request id. Called by:
//   - Razorpay checkout handler (brand UI) — includes razorpay payment proof
//   - Razorpay webhook via /api/razorpay/webhook
//   - Manual brand reconciliation if webhook was missed
// Effect: creates collab_session, sets request.status='paid', gen_credits unlocked
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params;

  // Can be called from webhook (no user session) or brand UI
  const authHeader = request.headers.get("authorization") ?? "";
  const isWebhook = authHeader === `Bearer ${process.env.RAZORPAY_WEBHOOK_SECRET}` ||
                    authHeader === `Bearer ${process.env.CRON_SECRET}`;

  let userId: string | null = null;
  if (!isWebhook) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id ?? null;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient() as Admin;

  const { data: req } = await admin
    .from("collab_requests")
    .select("id, status, brand_id, creator_id, package_id, package_tier, package_price_paise, final_images, gen_credits, usage_scope, license_duration_days, product_name, collab_session_id")
    .eq("id", requestId)
    .maybeSingle();

  if (!req) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  // Idempotency: already paid
  if (req.status === "paid" && req.collab_session_id) {
    return NextResponse.json({ ok: true, collab_session_id: req.collab_session_id, status: "already_paid" });
  }

  if (req.status !== "accepted") {
    return NextResponse.json({ error: `Cannot confirm payment for a ${req.status} request` }, { status: 400 });
  }

  // Brand authorization check (non-webhook)
  if (!isWebhook && userId) {
    const { data: brand } = await admin.from("brands").select("id").eq("user_id", userId).maybeSingle();
    if (!brand || brand.id !== req.brand_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Razorpay signature is MANDATORY on the brand (non-webhook) path. An empty
    // body must NEVER create a funded session / grant generation credits — that
    // was a payment bypass (authenticated brand could POST {} to unlock a paid
    // collab for free). Webhooks are HMAC-verified upstream + CRON_SECRET-gated.
    let bodyData: Record<string, unknown> = {};
    try { bodyData = await request.json().catch(() => ({})); } catch { /* ok */ }
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = bodyData as {
      razorpay_payment_id?: string;
      razorpay_order_id?: string;
      razorpay_signature?: string;
    };
    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return NextResponse.json(
        { error: "Missing payment confirmation — Razorpay signature required" },
        { status: 400 },
      );
    }
    const valid = verifyRazorpayPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!valid) return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });
  }

  // Create collab_session
  const gen_credits_total = (req.gen_credits as number) || (req.final_images as number) * 3;

  const { data: session, error: sessionErr } = await admin
    .from("collab_sessions")
    .insert({
      brand_id: req.brand_id,
      creator_id: req.creator_id,
      name: req.product_name,
      description: `${req.package_tier} package · ${req.final_images} images`,
      budget_paise: req.package_price_paise,
      max_generations: gen_credits_total,
      status: "active",
      // New package fields
      collab_request_id: req.id,
      package_id: req.package_id,
      package_tier: req.package_tier,
      package_price_paise: req.package_price_paise,
      final_images_target: req.final_images,
      gen_credits_total,
      gen_credits_used: 0,
      approved_count: 0,
      usage_scope: req.usage_scope,
    })
    .select("id")
    .single();

  if (sessionErr || !session) {
    console.error("[confirm-payment] session insert FAILED", {
      requestId,
      brand_id: req.brand_id,
      creator_id: req.creator_id,
      package_id: req.package_id,
      error: sessionErr,
    });
    return NextResponse.json(
      {
        error: "Failed to create collab session",
        // Surface DB error to help debug. If a migration is missing, message
        // will include "column does not exist" or similar.
        detail: sessionErr?.message ?? "Unknown error",
        code: sessionErr?.code ?? null,
        hint: "If this persists, your payment is captured by Razorpay. The webhook will retry automatically — refresh in 1 minute. If it still fails, contact support with this request ID: " + requestId,
      },
      { status: 500 }
    );
  }

  // Update request to paid
  await admin
    .from("collab_requests")
    .update({ status: "paid", paid_at: new Date().toISOString(), collab_session_id: session.id })
    .eq("id", requestId);

  // ── Single-pool model: add package credits to brand's global wallet ──
  // The collab session still tracks gen_credits_total/used for per-collab cap,
  // but actual debit happens against brands.credits_remaining when generating.
  // Idempotency: this block runs only when status flips accepted → paid (above
  // we already short-circuit if req.status === 'paid').
  try {
    const { data: brandRow } = await admin
      .from("brands")
      .select("credits_remaining, credits_lifetime_purchased")
      .eq("id", req.brand_id)
      .maybeSingle();

    if (brandRow) {
      const currentRemaining = (brandRow.credits_remaining ?? 0) as number;
      const currentLifetime  = (brandRow.credits_lifetime_purchased ?? 0) as number;
      const newRemaining = currentRemaining + gen_credits_total;
      const newLifetime  = currentLifetime + gen_credits_total;

      await admin
        .from("brands")
        .update({
          credits_remaining: newRemaining,
          credits_lifetime_purchased: newLifetime,
        })
        .eq("id", req.brand_id);

      await admin
        .from("credit_transactions")
        .insert({
          brand_id: req.brand_id,
          type: "topup",
          credits: gen_credits_total,
          balance_after: newRemaining,
          reference_type: "collab_session",
          reference_id: session.id,
          description: `${req.package_tier} package · ${gen_credits_total} credits unlocked`,
        });
    }
  } catch (err) {
    // Non-fatal — collab is already created. Credits can be reconciled
    // by an admin if this fails. Logged for observability.
    console.error("[confirm-payment] global credit grant failed (non-fatal)", err);
  }

  track("collab_payment_confirmed", {
    request_id: requestId,
    collab_session_id: session.id,
    brand_id: req.brand_id,
    creator_id: req.creator_id,
    amount_paise: req.package_price_paise,
    package_tier: req.package_tier,
  }, userId ?? req.brand_id);

  // Fire-and-forget: notify creator payment received + studio is live
  after(async () => {
    try {
      const { data: creatorRow } = await admin
        .from("creators").select("user_id").eq("id", req.creator_id).maybeSingle();
      if (!creatorRow) return;
      const [creatorUserRes, brandRes] = await Promise.all([
        admin.from("users").select("email, display_name").eq("id", creatorRow.user_id).maybeSingle(),
        admin.from("brands").select("company_name").eq("id", req.brand_id).maybeSingle(),
      ]);
      const creatorUser = creatorUserRes.data;
      const brandData = brandRes.data;
      if (creatorUser && brandData) {
        await sendCreatorPaymentReceived({
          to: creatorUser.email,
          creatorName: creatorUser.display_name ?? "Creator",
          brandName: brandData.company_name ?? "Brand",
          productName: req.product_name as string,
          pricePaise: req.package_price_paise as number,
          collabSessionId: session.id,
        });
      }
      if (creatorRow.user_id) {
        await emitNotification(admin, {
          userId: creatorRow.user_id,
          type: "payment_received",
          title: `${brandData?.company_name ?? "A brand"} paid — collab is live`,
          body: `"${req.product_name}" is funded. Images will come to you for approval.`,
          href: "/creator/collabs",
        });
      }
    } catch (err) {
      console.error("[confirm-payment] notification failed", err);
    }
  });

  return NextResponse.json({ ok: true, collab_session_id: session.id }, { status: 201 });
}
