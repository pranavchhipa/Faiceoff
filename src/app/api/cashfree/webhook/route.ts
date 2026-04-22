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
//   4. Route on event.type via `routeWebhookEvent` in `./handlers.ts`. Same
//      handler module is also imported by the reconciliation cron so a
//      replayed event from webhook_events goes through the exact same code
//      path as a fresh delivery.
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
import { routeWebhookEvent, type AdminUntyped } from "./handlers";

// The webhook-events unique violation looks the same on every Postgres
// adapter: SQLSTATE 23505. We only care about "did the insert succeed".
function isUniqueViolation(error: { message: string; code?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "23505") return true;
  return /duplicate key|unique constraint/i.test(error.message);
}

// Route-local augmentation: the webhook_events row carries extra methods not
// on the shared AdminUntyped (`insert().select().single()`). Kept here rather
// than in handlers.ts because only the route does the initial insert.
type AdminWithWebhookInsert = AdminUntyped & {
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

  const admin = createAdminClient() as unknown as AdminWithWebhookInsert;

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
    await routeWebhookEvent(admin, event);

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
