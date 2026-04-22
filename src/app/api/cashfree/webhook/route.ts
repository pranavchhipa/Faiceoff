// ─────────────────────────────────────────────────────────────────────────────
// POST /api/cashfree/webhook — single receiver for all Cashfree events
// Ref plan Task 19 / spec §6.3
// ─────────────────────────────────────────────────────────────────────────────
//
// Flow:
//   1. Read raw body (signature depends on the exact bytes Cashfree sent).
//   2. Verify signature via parseWebhook → throws CashfreeWebhookSignatureError.
//   3. Dedup: insert webhook_events row with idempotency_key =
//      sha256(signature || timestamp). Unique violation → already processed →
//      return 200.
//   4. Route on event.type:
//      - PAYMENT_SUCCESS_WEBHOOK    → flip credit_top_ups.status='success' +
//                                      call commitTopUp(top_up_id)
//      - PAYMENT_FAILED_WEBHOOK     → status='failed' with reason
//      - PAYMENT_USER_DROPPED_WEBHOOK → status='failed' reason='user_dropped'
//      - TRANSFER_SUCCESS           → commitWithdrawalSuccess({ id, cfUtr })
//      - TRANSFER_FAILED            → commitWithdrawalFailure({ id, reason })
//      - TRANSFER_REVERSED          → commitWithdrawalFailure (same path)
//   5. Always return { ok: true } / 200 if signature valid, even if the inner
//      handler fails — we persist the error on webhook_events so the
//      reconciliation cron can pick it up. Returning 500 would cause Cashfree
//      to retry-storm the endpoint on every deploy blip.
//
// Gotchas:
//   • This route MUST be public (no auth). Signature IS the auth.
//   • DO NOT `await req.json()` — it breaks raw-body signature verify. Use
//     `req.text()` and hand the raw string to parseWebhook.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CashfreeWebhookSignatureError,
  parseWebhook,
} from "@/lib/payments/cashfree/webhook";
import type { CashfreeWebhookEvent } from "@/lib/payments/cashfree/types";
import {
  commitTopUp,
  commitWithdrawalFailure,
  commitWithdrawalSuccess,
} from "@/lib/ledger/commit";

// ── Types ────────────────────────────────────────────────────────────────────

interface TopUpRow {
  id: string;
  brand_id: string;
  cf_order_id: string;
  status: string;
}

interface WithdrawalRow {
  id: string;
  creator_id: string;
  cf_transfer_id: string;
  status: string;
}

// The webhook-events unique violation looks the same on every Postgres
// adapter: SQLSTATE 23505. We only care about "did the insert succeed".
function isUniqueViolation(error: { message: string; code?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "23505") return true;
  return /duplicate key|unique constraint/i.test(error.message);
}

// Narrow admin-client type because types/supabase.ts does not yet know about
// the 20-30 migrations (credit_top_ups, withdrawal_requests, webhook_events).
type AdminUntyped = {
  from(table: string): {
    insert(row: Record<string, unknown>): {
      select(): {
        single(): Promise<{
          data: { id: string } | null;
          error: { message: string; code?: string } | null;
        }>;
      };
    };
    select(cols?: string): {
      eq(col: string, val: string): {
        maybeSingle(): Promise<{
          data: Record<string, unknown> | null;
          error: { message: string; code?: string } | null;
        }>;
      };
    };
    update(patch: Record<string, unknown>): {
      eq(col: string, val: string): Promise<{
        error: { message: string; code?: string } | null;
      }>;
    };
  };
};

// ── Entry point ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const timestamp = req.headers.get("x-webhook-timestamp") ?? "";
  const signature = req.headers.get("x-webhook-signature") ?? "";

  // ── 1. Signature verification ──────────────────────────────────────────────
  let event: CashfreeWebhookEvent;
  try {
    event = parseWebhook(rawBody, { timestamp, signature });
  } catch (err) {
    if (err instanceof CashfreeWebhookSignatureError) {
      console.warn("[cashfree/webhook] signature failed");
      return NextResponse.json(
        { error: "invalid_signature" },
        { status: 400 },
      );
    }
    // Malformed JSON / missing envelope fields — still 400, still no write.
    const message = err instanceof Error ? err.message : "parse_error";
    console.warn("[cashfree/webhook] parse failed:", message);
    return NextResponse.json({ error: "parse_error" }, { status: 400 });
  }

  // ── 2. Idempotency key ─────────────────────────────────────────────────────
  const idempotencyKey = createHash("sha256")
    .update(`${signature}|${timestamp}`)
    .digest("hex");

  const admin = createAdminClient() as unknown as AdminUntyped;

  const { data: inserted, error: insertError } = await admin
    .from("webhook_events")
    .insert({
      source: "cashfree",
      event_type: event.type,
      idempotency_key: idempotencyKey,
      payload: JSON.parse(rawBody),
    })
    .select()
    .single();

  if (insertError) {
    if (isUniqueViolation(insertError)) {
      // Dup delivery — Cashfree saw a timeout on the first round and is
      // retrying. We've already processed (or are processing) this event.
      return NextResponse.json({ ok: true, dedup: true }, { status: 200 });
    }
    console.error("[cashfree/webhook] webhook_events insert failed", insertError);
    // Still 200 so Cashfree doesn't retry a transient DB hiccup indefinitely.
    return NextResponse.json({ ok: true, warning: "audit_insert_failed" });
  }

  const webhookEventId = inserted?.id;

  // ── 3. Route on event type ─────────────────────────────────────────────────
  try {
    switch (event.type) {
      case "PAYMENT_SUCCESS_WEBHOOK":
        await handlePaymentSuccess(admin, event);
        break;
      case "PAYMENT_FAILED_WEBHOOK":
        await handlePaymentFailed(admin, event);
        break;
      case "PAYMENT_USER_DROPPED_WEBHOOK":
        await handlePaymentDropped(admin, event);
        break;
      case "TRANSFER_SUCCESS":
        await handleTransferSuccess(admin, event);
        break;
      case "TRANSFER_FAILED":
      case "TRANSFER_REVERSED":
        await handleTransferFailed(admin, event);
        break;
      default: {
        // Unknown event type — recorded in webhook_events but no handler.
        // Not an error; Cashfree occasionally adds new event types.
        break;
      }
    }

    // Mark event processed.
    if (webhookEventId) {
      await admin
        .from("webhook_events")
        .update({ processed_at: new Date().toISOString() })
        .eq("id", webhookEventId);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    // Record the error on the webhook_events row so reconciliation can retry.
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cashfree/webhook] handler failure:", event.type, message);
    if (webhookEventId) {
      await admin
        .from("webhook_events")
        .update({ processing_error: message.slice(0, 1000) })
        .eq("id", webhookEventId);
    }
    // Still 200 — we own the retry via reconciliation. Returning 500 here
    // would trigger Cashfree's own retry schedule and give us duplicate
    // processing attempts.
    return NextResponse.json({ ok: true, error: "deferred" }, { status: 200 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Payment handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cashfree payload shape (2025-01-01):
 *   data.order.order_id
 *   data.payment.cf_payment_id
 *   data.payment.payment_status
 *   data.payment.payment_message  (on failure)
 */
function extractOrderId(event: CashfreeWebhookEvent): string | null {
  const data = event.data as { order?: { order_id?: unknown } } | undefined;
  const orderId = data?.order?.order_id;
  return typeof orderId === "string" ? orderId : null;
}

function extractPaymentMessage(event: CashfreeWebhookEvent): string {
  const data = event.data as {
    payment?: { payment_message?: unknown; payment_status?: unknown };
  };
  const msg = data?.payment?.payment_message;
  if (typeof msg === "string" && msg.length > 0) return msg;
  const status = data?.payment?.payment_status;
  return typeof status === "string" ? status : "payment_failed";
}

async function lookupTopUp(
  admin: AdminUntyped,
  orderId: string,
): Promise<TopUpRow | null> {
  const { data } = await admin
    .from("credit_top_ups")
    .select("id, brand_id, cf_order_id, status")
    .eq("cf_order_id", orderId)
    .maybeSingle();
  return (data as TopUpRow | null) ?? null;
}

async function handlePaymentSuccess(
  admin: AdminUntyped,
  event: CashfreeWebhookEvent,
): Promise<void> {
  const orderId = extractOrderId(event);
  if (!orderId) return;
  const topUp = await lookupTopUp(admin, orderId);
  if (!topUp) {
    // Race: webhook arrived before our DB row committed.
    // Leave processed_at=null so reconciliation cron retries.
    console.warn(
      `[cashfree/webhook] PAYMENT_SUCCESS no top-up for order ${orderId}`,
    );
    return;
  }
  if (topUp.status === "success") {
    // Already committed — idempotent no-op.
    return;
  }

  // Extract payment id if present.
  const payment = (event.data as { payment?: { cf_payment_id?: unknown } })
    ?.payment;
  const cfPaymentId =
    typeof payment?.cf_payment_id === "string"
      ? payment.cf_payment_id
      : undefined;

  // Flip status BEFORE committing so commit_top_up's internal guard
  // (requires status='success') passes.
  await admin
    .from("credit_top_ups")
    .update({
      status: "success",
      cf_payment_id: cfPaymentId ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", topUp.id);

  await commitTopUp(topUp.id);
}

async function handlePaymentFailed(
  admin: AdminUntyped,
  event: CashfreeWebhookEvent,
): Promise<void> {
  const orderId = extractOrderId(event);
  if (!orderId) return;
  const topUp = await lookupTopUp(admin, orderId);
  if (!topUp) return;
  if (topUp.status === "failed" || topUp.status === "success") return;

  const reason = extractPaymentMessage(event);
  await admin
    .from("credit_top_ups")
    .update({
      status: "failed",
      failure_reason: reason.slice(0, 500),
      completed_at: new Date().toISOString(),
    })
    .eq("id", topUp.id);
}

async function handlePaymentDropped(
  admin: AdminUntyped,
  event: CashfreeWebhookEvent,
): Promise<void> {
  const orderId = extractOrderId(event);
  if (!orderId) return;
  const topUp = await lookupTopUp(admin, orderId);
  if (!topUp) return;
  if (topUp.status === "failed" || topUp.status === "success") return;

  await admin
    .from("credit_top_ups")
    .update({
      status: "failed",
      failure_reason: "user_dropped",
      completed_at: new Date().toISOString(),
    })
    .eq("id", topUp.id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Transfer (payout) handlers
// ─────────────────────────────────────────────────────────────────────────────

function extractTransferId(event: CashfreeWebhookEvent): string | null {
  const data = event.data as { transfer?: { transfer_id?: unknown } };
  const tid = data?.transfer?.transfer_id;
  return typeof tid === "string" ? tid : null;
}

function extractTransferUtr(event: CashfreeWebhookEvent): string {
  const data = event.data as { transfer?: { utr?: unknown } };
  const utr = data?.transfer?.utr;
  return typeof utr === "string" ? utr : "";
}

function extractTransferFailureReason(event: CashfreeWebhookEvent): string {
  const data = event.data as {
    transfer?: { status_description?: unknown; status?: unknown };
  };
  const desc = data?.transfer?.status_description;
  if (typeof desc === "string" && desc.length > 0) return desc;
  const status = data?.transfer?.status;
  return typeof status === "string" ? status : "transfer_failed";
}

async function lookupWithdrawal(
  admin: AdminUntyped,
  transferId: string,
): Promise<WithdrawalRow | null> {
  const { data } = await admin
    .from("withdrawal_requests")
    .select("id, creator_id, cf_transfer_id, status")
    .eq("cf_transfer_id", transferId)
    .maybeSingle();
  return (data as WithdrawalRow | null) ?? null;
}

async function handleTransferSuccess(
  admin: AdminUntyped,
  event: CashfreeWebhookEvent,
): Promise<void> {
  const transferId = extractTransferId(event);
  if (!transferId) return;
  const wr = await lookupWithdrawal(admin, transferId);
  if (!wr) {
    console.warn(
      `[cashfree/webhook] TRANSFER_SUCCESS no withdrawal for transfer ${transferId}`,
    );
    return;
  }
  if (wr.status === "success") return;

  await commitWithdrawalSuccess({
    withdrawalRequestId: wr.id,
    cfUtr: extractTransferUtr(event),
  });
}

async function handleTransferFailed(
  admin: AdminUntyped,
  event: CashfreeWebhookEvent,
): Promise<void> {
  const transferId = extractTransferId(event);
  if (!transferId) return;
  const wr = await lookupWithdrawal(admin, transferId);
  if (!wr) {
    console.warn(
      `[cashfree/webhook] TRANSFER_FAILED no withdrawal for transfer ${transferId}`,
    );
    return;
  }
  if (wr.status === "failed" || wr.status === "success") return;

  await commitWithdrawalFailure({
    withdrawalRequestId: wr.id,
    reason: extractTransferFailureReason(event),
  });
}
