// ─────────────────────────────────────────────────────────────────────────────
// POST /api/cashfree/payout-webhook — Cashfree payout transfer event receiver
//
// PUBLIC route — Cashfree calls this. Signature is the auth.
//
// Flow:
//   1. Read raw body (signature depends on exact bytes Cashfree sent).
//   2. Verify signature via parseWebhook → throws CashfreeWebhookSignatureError.
//   3. Dedup: insert webhook_events row with idempotency_key =
//      sha256(signature || timestamp). Unique violation → already processed → 200.
//   4. Only handle TRANSFER_* event types; route to handlePayoutWebhook service.
//   5. Always return 200 on valid signature — Cashfree retries on non-2xx.
//
// Mirrors: src/app/api/cashfree/webhook/route.ts (the Collect webhook).
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CashfreeWebhookSignatureError,
  parseWebhook,
} from "@/lib/payments/cashfree/webhook";
import { handlePayoutWebhook, PayoutError } from "@/lib/payouts";
import type { CashfreeWebhookEvent } from "@/lib/payments/cashfree/types";
import type { PayoutWebhookEvent } from "@/lib/payouts";

function isUniqueViolation(error: { message: string; code?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "23505") return true;
  return /duplicate key|unique constraint/i.test(error.message);
}

// Extract cf_transfer_id from TRANSFER_* webhook data envelope.
function extractCfTransferId(event: CashfreeWebhookEvent): string | null {
  const data = event.data as { transfer?: { cf_transfer_id?: unknown; transfer_id?: unknown } };
  const cfId = data?.transfer?.cf_transfer_id;
  if (typeof cfId === "string" && cfId.length > 0) return cfId;
  // Fallback: some Cashfree versions send transfer_id instead.
  const tid = data?.transfer?.transfer_id;
  return typeof tid === "string" && tid.length > 0 ? tid : null;
}

// Extract failure reason from TRANSFER_FAILED / TRANSFER_REVERSED payload.
function extractFailureReason(event: CashfreeWebhookEvent): string | undefined {
  const data = event.data as {
    transfer?: { status_description?: unknown; status?: unknown };
  };
  const desc = data?.transfer?.status_description;
  if (typeof desc === "string" && desc.length > 0) return desc;
  const status = data?.transfer?.status;
  return typeof status === "string" ? status : undefined;
}

// Narrow Cashfree event type to PayoutWebhookEvent type union.
function isSupportedPayoutEvent(
  type: string,
): type is PayoutWebhookEvent["type"] {
  return (
    type === "TRANSFER_SUCCESS" ||
    type === "TRANSFER_FAILED" ||
    type === "TRANSFER_REVERSED"
  );
}

type AdminWithWebhookInsert = {
  from(table: string): {
    insert(row: Record<string, unknown>): {
      select(): {
        single(): Promise<{
          data: { id: string } | null;
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
      console.warn("[cashfree/payout-webhook] signature failed");
      return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "parse_error";
    console.warn("[cashfree/payout-webhook] parse failed:", message);
    return NextResponse.json({ error: "parse_error" }, { status: 400 });
  }

  // ── 2. Idempotency key ─────────────────────────────────────────────────────
  const idempotencyKey = createHash("sha256")
    .update(`${signature}|${timestamp}`)
    .digest("hex");

  const admin = createAdminClient() as unknown as AdminWithWebhookInsert;

  const { data: inserted, error: insertError } = await admin
    .from("webhook_events")
    .insert({
      source: "cashfree_payout",
      event_type: event.type,
      idempotency_key: idempotencyKey,
      payload: JSON.parse(rawBody),
    })
    .select()
    .single();

  if (insertError) {
    if (isUniqueViolation(insertError)) {
      return NextResponse.json({ ok: true, dedup: true }, { status: 200 });
    }
    console.error(
      "[cashfree/payout-webhook] webhook_events insert failed",
      insertError,
    );
    // Still 200 to avoid Cashfree retry storm on transient DB hiccup.
    return NextResponse.json({ ok: true, warning: "audit_insert_failed" });
  }

  const webhookEventId = inserted?.id;

  // ── 3. Route TRANSFER_* events to payout service ───────────────────────────
  if (!isSupportedPayoutEvent(event.type)) {
    // Non-transfer events received at this endpoint — log and ack.
    console.warn(
      `[cashfree/payout-webhook] unexpected event type: ${event.type}`,
    );
    if (webhookEventId) {
      await admin
        .from("webhook_events")
        .update({ processed_at: new Date().toISOString() })
        .eq("id", webhookEventId);
    }
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const cfTransferId = extractCfTransferId(event);
  if (!cfTransferId) {
    console.warn(
      `[cashfree/payout-webhook] missing cf_transfer_id for ${event.type}`,
    );
    if (webhookEventId) {
      await admin
        .from("webhook_events")
        .update({ processed_at: new Date().toISOString() })
        .eq("id", webhookEventId);
    }
    return NextResponse.json({ ok: true, warning: "missing_transfer_id" });
  }

  const payoutEvent: PayoutWebhookEvent = {
    cfTransferId,
    type: event.type,
    failureReason:
      event.type !== "TRANSFER_SUCCESS"
        ? extractFailureReason(event)
        : undefined,
  };

  try {
    await handlePayoutWebhook(payoutEvent);

    if (webhookEventId) {
      await admin
        .from("webhook_events")
        .update({ processed_at: new Date().toISOString() })
        .eq("id", webhookEventId);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    const message =
      err instanceof PayoutError
        ? `${err.code}: ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);

    console.error(
      "[cashfree/payout-webhook] handler failure:",
      event.type,
      message,
    );

    if (webhookEventId) {
      await admin
        .from("webhook_events")
        .update({ processing_error: message.slice(0, 1000) })
        .eq("id", webhookEventId);
    }

    // Always 200 — reconciliation cron will retry via webhook_events rows
    // where processing_error IS NOT NULL.
    return NextResponse.json({ ok: true, error: "deferred" }, { status: 200 });
  }
}
