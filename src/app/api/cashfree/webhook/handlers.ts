// ─────────────────────────────────────────────────────────────────────────────
// Cashfree event handlers — shared by the webhook route and the Inngest
// reconciliation cron.
// ─────────────────────────────────────────────────────────────────────────────
//
// These handlers take pre-parsed domain arguments (orderId / transferId /
// reason / utr) rather than a raw webhook envelope. That lets the reconcile
// cron — which polls Cashfree's order / transfer status API and receives
// structured responses, not webhook events — reuse them 1:1.
//
// Each handler is idempotent:
//   • If the DB row is already in the target terminal state, we return without
//     re-committing the ledger. The PL/pgSQL procedures in 00029 also guard
//     against double-commit, but we short-circuit here to avoid round-tripping
//     to the DB for a no-op.
//   • `handleTopUpSuccess` flips `credit_top_ups.status` BEFORE calling
//     `commitTopUp()` because the procedure's internal guard requires
//     status='success'.
//
// The `AdminUntyped` type mirrors `route.ts` — required because
// types/supabase.ts has not been regenerated after 00020–00030 yet.
// ─────────────────────────────────────────────────────────────────────────────

import {
  commitTopUp,
  commitWithdrawalFailure,
  commitWithdrawalSuccess,
} from "@/lib/ledger/commit";
import type { CashfreeWebhookEvent } from "@/lib/payments/cashfree/types";

// ── Shared admin narrowing ──────────────────────────────────────────────────

export type AdminUntyped = {
  from(table: string): {
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

// ── Row types ───────────────────────────────────────────────────────────────

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

// ── Top-up handlers ─────────────────────────────────────────────────────────

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

/**
 * Cashfree `PAYMENT_SUCCESS_WEBHOOK` — or a reconciliation tick that saw
 * `order_status=PAID`. Flips credit_top_ups.status to 'success' and fires
 * the ledger commit.
 *
 * No-op when:
 *   • row not found (race: webhook before DB insert — reconciliation will retry)
 *   • row already status='success' (idempotent replay)
 */
export async function handleTopUpSuccess(
  admin: AdminUntyped,
  params: { orderId: string; cfPaymentId?: string | null },
): Promise<void> {
  const topUp = await lookupTopUp(admin, params.orderId);
  if (!topUp) {
    console.warn(
      `[cashfree/handlers] handleTopUpSuccess: no top-up for order ${params.orderId}`,
    );
    return;
  }
  if (topUp.status === "success") return;

  await admin
    .from("credit_top_ups")
    .update({
      status: "success",
      cf_payment_id: params.cfPaymentId ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", topUp.id);

  await commitTopUp(topUp.id);
}

/**
 * Cashfree `PAYMENT_FAILED_WEBHOOK` / `PAYMENT_USER_DROPPED_WEBHOOK` or a
 * reconciliation tick that saw `order_status=EXPIRED` / `CANCELLED`.
 */
export async function handleTopUpFailed(
  admin: AdminUntyped,
  params: { orderId: string; reason: string },
): Promise<void> {
  const topUp = await lookupTopUp(admin, params.orderId);
  if (!topUp) return;
  if (topUp.status === "failed" || topUp.status === "success") return;

  await admin
    .from("credit_top_ups")
    .update({
      status: "failed",
      failure_reason: params.reason.slice(0, 500),
      completed_at: new Date().toISOString(),
    })
    .eq("id", topUp.id);
}

// ── Transfer handlers ───────────────────────────────────────────────────────

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

/**
 * Cashfree `TRANSFER_SUCCESS` or a reconciliation tick that saw
 * `status=SUCCESS`. Records UTR on the withdrawal_requests row and
 * decrements creator pending_balance via the ledger procedure.
 */
export async function handleTransferSuccess(
  admin: AdminUntyped,
  params: { transferId: string; utr: string },
): Promise<void> {
  const wr = await lookupWithdrawal(admin, params.transferId);
  if (!wr) {
    console.warn(
      `[cashfree/handlers] handleTransferSuccess: no withdrawal for transfer ${params.transferId}`,
    );
    return;
  }
  if (wr.status === "success") return;

  await commitWithdrawalSuccess({
    withdrawalRequestId: wr.id,
    cfUtr: params.utr,
  });
}

/**
 * Cashfree `TRANSFER_FAILED` / `TRANSFER_REVERSED` or a reconciliation tick
 * that saw `status=FAILED` / `REJECTED` / `REVERSED`.
 */
export async function handleTransferFailed(
  admin: AdminUntyped,
  params: { transferId: string; reason: string },
): Promise<void> {
  const wr = await lookupWithdrawal(admin, params.transferId);
  if (!wr) {
    console.warn(
      `[cashfree/handlers] handleTransferFailed: no withdrawal for transfer ${params.transferId}`,
    );
    return;
  }
  if (wr.status === "failed" || wr.status === "success") return;

  await commitWithdrawalFailure({
    withdrawalRequestId: wr.id,
    reason: params.reason,
  });
}

// ── Webhook envelope routing ────────────────────────────────────────────────

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

function extractCfPaymentId(event: CashfreeWebhookEvent): string | null {
  const payment = (event.data as { payment?: { cf_payment_id?: unknown } })
    ?.payment;
  return typeof payment?.cf_payment_id === "string"
    ? payment.cf_payment_id
    : null;
}

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

/**
 * Dispatch a Cashfree webhook envelope to the correct handler. Used by both
 * the webhook route (normal delivery) and the reconciliation cron (retrying
 * `webhook_events` rows where `processed_at IS NULL`).
 *
 * Unknown event types are swallowed — Cashfree occasionally adds new events
 * and we don't want the cron to crash on them.
 */
export async function routeWebhookEvent(
  admin: AdminUntyped,
  event: CashfreeWebhookEvent,
): Promise<void> {
  switch (event.type) {
    case "PAYMENT_SUCCESS_WEBHOOK": {
      const orderId = extractOrderId(event);
      if (!orderId) return;
      await handleTopUpSuccess(admin, {
        orderId,
        cfPaymentId: extractCfPaymentId(event),
      });
      return;
    }
    case "PAYMENT_FAILED_WEBHOOK": {
      const orderId = extractOrderId(event);
      if (!orderId) return;
      await handleTopUpFailed(admin, {
        orderId,
        reason: extractPaymentMessage(event),
      });
      return;
    }
    case "PAYMENT_USER_DROPPED_WEBHOOK": {
      const orderId = extractOrderId(event);
      if (!orderId) return;
      await handleTopUpFailed(admin, { orderId, reason: "user_dropped" });
      return;
    }
    case "TRANSFER_SUCCESS": {
      const transferId = extractTransferId(event);
      if (!transferId) return;
      await handleTransferSuccess(admin, {
        transferId,
        utr: extractTransferUtr(event),
      });
      return;
    }
    case "TRANSFER_FAILED":
    case "TRANSFER_REVERSED": {
      const transferId = extractTransferId(event);
      if (!transferId) return;
      await handleTransferFailed(admin, {
        transferId,
        reason: extractTransferFailureReason(event),
      });
      return;
    }
    default: {
      // Unknown event types are recorded in webhook_events by the caller but
      // otherwise ignored. Not an error.
      return;
    }
  }
}
