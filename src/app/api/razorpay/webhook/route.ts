// POST /api/razorpay/webhook — single receiver for all Razorpay events
//
// Signature: HMAC-SHA256 of raw body with RAZORPAY_WEBHOOK_SECRET.
// Header: x-razorpay-signature
//
// Handled events:
//   payment.captured → wallet top-up OR collab payment confirmation
//   payment.failed   → mark order failed

import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  verifyRazorpayWebhook,
  RazorpayWebhookSignatureError,
} from "@/lib/payments/razorpay/webhook";
import {
  handleWalletTopUpSuccess,
  handleWalletTopUpFailed,
} from "@/app/api/wallet/handlers";
import { addCredits } from "@/lib/billing/credits-service";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

interface RazorpayPaymentEntity {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  error_description?: string;
  notes?: Record<string, string>;
}

interface RazorpayWebhookPayload {
  entity: string;
  event: string;
  payload: {
    payment?: {
      entity: RazorpayPaymentEntity;
    };
  };
}

function isUniqueViolation(error: { message: string; code?: string } | null): boolean {
  if (!error) return false;
  return error.code === "23505" || /duplicate key|unique constraint/i.test(error.message);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";

  // 1. Verify signature
  try {
    verifyRazorpayWebhook(rawBody, signature);
  } catch (err) {
    if (err instanceof RazorpayWebhookSignatureError) {
      console.warn("[razorpay/webhook] signature failed");
      return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
    }
    return NextResponse.json({ error: "parse_error" }, { status: 400 });
  }

  let event: RazorpayWebhookPayload;
  try {
    event = JSON.parse(rawBody) as RazorpayWebhookPayload;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // 2. Idempotency — insert webhook_events row
  const idempotencyKey = createHash("sha256")
    .update(`${signature}|${event.event}`)
    .digest("hex");

  const admin = createAdminClient() as Admin;

  const { data: inserted, error: insertError } = await admin
    .from("webhook_events")
    .insert({
      source: "razorpay",
      event_type: event.event,
      idempotency_key: idempotencyKey,
      payload: JSON.parse(rawBody),
    })
    .select()
    .single();

  if (insertError) {
    if (isUniqueViolation(insertError)) {
      return NextResponse.json({ ok: true, dedup: true });
    }
    console.error("[razorpay/webhook] webhook_events insert failed", insertError);
    return NextResponse.json({ ok: true, warning: "audit_insert_failed" });
  }

  const webhookEventId = inserted?.id as string | undefined;

  // 3. Route event
  try {
    await handleRazorpayEvent(admin, event);

    if (webhookEventId) {
      await admin
        .from("webhook_events")
        .update({ processed_at: new Date().toISOString() })
        .eq("id", webhookEventId);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[razorpay/webhook] handler failed:", event.event, message);
    if (webhookEventId) {
      await admin
        .from("webhook_events")
        .update({ processing_error: message.slice(0, 1000) })
        .eq("id", webhookEventId);
    }
    return NextResponse.json({ ok: true, error: "deferred" });
  }
}

async function handleRazorpayEvent(admin: Admin, event: RazorpayWebhookPayload): Promise<void> {
  const payment = event.payload?.payment?.entity;

  switch (event.event) {
    case "payment.captured": {
      if (!payment) return;
      const orderId = payment.order_id;
      const notes = payment.notes ?? {};

      if (notes.type === "collab_payment") {
        // Confirm collab session creation (idempotent)
        const collabRequestId = notes.collab_request_id;
        if (!collabRequestId) return;

        await admin
          .from("collab_requests")
          .select("id, status")
          .eq("id", collabRequestId)
          .maybeSingle()
          .then(async ({ data: req }: { data: { id: string; status: string } | null }) => {
            if (!req || req.status === "paid") return;
            if (req.status !== "accepted") return;

            // Fetch full request for session creation
            const { data: fullReq } = await admin
              .from("collab_requests")
              .select("id, status, brand_id, creator_id, package_id, package_tier, package_price_paise, final_images, gen_credits, usage_scope, product_name, collab_session_id")
              .eq("id", collabRequestId)
              .maybeSingle();

            if (!fullReq || fullReq.status === "paid") return;

            const gen_credits_total = (fullReq.gen_credits as number) || (fullReq.final_images as number) * 3;

            const { data: session } = await admin
              .from("collab_sessions")
              .insert({
                brand_id: fullReq.brand_id,
                creator_id: fullReq.creator_id,
                name: fullReq.product_name,
                description: `${fullReq.package_tier} package · ${fullReq.final_images} images`,
                budget_paise: fullReq.package_price_paise,
                max_generations: gen_credits_total,
                status: "active",
                collab_request_id: fullReq.id,
                package_id: fullReq.package_id,
                package_tier: fullReq.package_tier,
                package_price_paise: fullReq.package_price_paise,
                final_images_target: fullReq.final_images,
                gen_credits_total,
                gen_credits_used: 0,
                approved_count: 0,
                usage_scope: fullReq.usage_scope,
              })
              .select("id")
              .single();

            if (session) {
              await admin
                .from("collab_requests")
                .update({ status: "paid", paid_at: new Date().toISOString(), collab_session_id: session.id })
                .eq("id", collabRequestId);
            }
          });
      } else if (notes.type === "credit_top_up") {
        // Credits purchase via Razorpay
        const creditTopUpId = notes.credit_top_up_id;
        if (creditTopUpId) {
          const { data: topUp } = await admin
            .from("credit_top_ups")
            .select("id, brand_id, status, credits")
            .eq("id", creditTopUpId)
            .maybeSingle();
          if (topUp && topUp.status !== "success") {
            await admin
              .from("credit_top_ups")
              .update({
                status: "success",
                cf_payment_id: payment.id,
                completed_at: new Date().toISOString(),
                credits_granted: topUp.credits ?? 0,
              })
              .eq("id", creditTopUpId);
            await addCredits({ brandId: topUp.brand_id, topUpId: topUp.id }).catch(
              (err: Error) => console.error("[razorpay/webhook] addCredits failed", err)
            );
          }
        }
      } else {
        // Default: wallet top-up (notes.type === "wallet_top_up" or legacy)
        await handleWalletTopUpSuccess(admin, { orderId, cfPaymentId: payment.id });
      }
      return;
    }

    case "payment.failed": {
      if (!payment) return;
      const orderId = payment.order_id;
      const reason = payment.error_description ?? "payment_failed";
      const notes = payment.notes ?? {};

      if (notes.type !== "collab_payment") {
        await handleWalletTopUpFailed(admin, { orderId, reason });
      }
      // For collab: request stays 'accepted', brand can retry payment
      return;
    }

    default:
      // Unknown events — recorded in webhook_events, not an error
      return;
  }
}
