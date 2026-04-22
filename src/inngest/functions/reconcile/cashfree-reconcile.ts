// ─────────────────────────────────────────────────────────────────────────────
// cashfree-reconcile — cron every 6 hours
// Ref plan Task 31
// ─────────────────────────────────────────────────────────────────────────────
//
// Three reconciliation passes per run:
//
//   1. Stuck top-ups — credit_top_ups in ('initiated','processing') older
//      than 6h. Query Cashfree getOrderStatus(cf_order_id):
//        PAID                 → handleTopUpSuccess
//        EXPIRED / CANCELLED  → handleTopUpFailed (reason: reconciled_*)
//        ACTIVE               → leave alone (brand may still complete checkout)
//
//   2. Stuck withdrawals — withdrawal_requests in
//      ('deductions_applied','processing') older than 6h. Query Cashfree
//      getTransferStatus(cf_transfer_id) via mapTransferStatus:
//        success    → handleTransferSuccess with UTR from API
//        failed     → handleTransferFailed
//        processing → leave alone
//
//   3. Unprocessed webhook_events — source='cashfree' AND processed_at IS NULL
//      AND received_at older than 1h AND retry_count < 5. Replay the event
//      through routeWebhookEvent() so a race-conditioned delivery (webhook
//      arrived before our DB row committed) eventually gets processed.
//
// Limits:
//   • 100 rows per type per run. Cashfree charges for getOrderStatus calls
//     and we don't want to burn budget catching up a pathological backlog —
//     the next tick 6h later will catch the rest.
//   • 50 webhook_events per run. These are cheaper (no external HTTP) but
//     still capped to bound wall time.
//
// Partial-failure safe: same model as expire-licenses — each row is its own
// step.run, errors are collected + logged at end, function only throws if
// the initial fetch step fails. Inngest retries the function as a whole
// on throw, which we want for transient DB blips but not for per-row
// failures.
// ─────────────────────────────────────────────────────────────────────────────

import { inngest } from "@/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrderStatus } from "@/lib/payments/cashfree/collect";
import {
  getTransferStatus,
  mapTransferStatus,
} from "@/lib/payments/cashfree/payouts";
import {
  handleTopUpFailed,
  handleTopUpSuccess,
  handleTransferFailed,
  handleTransferSuccess,
  routeWebhookEvent,
  type AdminUntyped,
} from "@/app/api/cashfree/webhook/handlers";
import type { CashfreeWebhookEvent } from "@/lib/payments/cashfree/types";

const MAX_TOP_UPS_PER_RUN = 100;
const MAX_WITHDRAWALS_PER_RUN = 100;
const MAX_WEBHOOKS_PER_RUN = 50;
const TOP_UP_STUCK_HOURS = 6;
const WITHDRAWAL_STUCK_HOURS = 6;
const WEBHOOK_STUCK_HOURS = 1;
const MAX_WEBHOOK_RETRIES = 5;

// ── Narrowed admin shape ────────────────────────────────────────────────────

/**
 * The reconcile cron needs extra query shapes that the webhook handler's
 * AdminUntyped doesn't expose (`in`, `not`, `order`, `is`). We build a
 * superset. The handler module still accepts the reconcile admin because
 * AdminUntyped is structurally compatible — `in/not/order/is` just aren't
 * called from those paths.
 */
export interface ReconcileAdmin extends AdminUntyped {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): {
        maybeSingle(): Promise<{
          data: Record<string, unknown> | null;
          error: { message: string; code?: string } | null;
        }>;
      };
      in(col: string, values: string[]): {
        lt(col2: string, val2: string): {
          not(col3: string, op: string, val3: null): {
            limit(n: number): Promise<{
              data: Array<Record<string, unknown>> | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
      is(col: string, val: null): {
        eq(col2: string, val2: string): {
          lt(col3: string, val3: string): {
            lt(col4: string, val4: number): {
              order(
                col5: string,
                options: { ascending: boolean },
              ): {
                limit(n: number): Promise<{
                  data: Array<Record<string, unknown>> | null;
                  error: { message: string } | null;
                }>;
              };
            };
          };
        };
      };
    };
    update(patch: Record<string, unknown>): {
      eq(col: string, val: string): Promise<{
        error: { message: string; code?: string } | null;
      }>;
    };
  };
}

export interface MinimalStep {
  run<T>(id: string, fn: () => Promise<T>): Promise<T>;
}

export interface MinimalLogger {
  info(msg: string, meta?: unknown): void;
  warn(msg: string, meta?: unknown): void;
  error(msg: string, meta?: unknown): void;
}

// ── Injectable dependencies (Cashfree SDK calls) ────────────────────────────

export interface ReconcileDeps {
  getOrderStatus: typeof getOrderStatus;
  getTransferStatus: typeof getTransferStatus;
  handleTopUpSuccess: typeof handleTopUpSuccess;
  handleTopUpFailed: typeof handleTopUpFailed;
  handleTransferSuccess: typeof handleTransferSuccess;
  handleTransferFailed: typeof handleTransferFailed;
  routeWebhookEvent: typeof routeWebhookEvent;
}

export const defaultDeps: ReconcileDeps = {
  getOrderStatus,
  getTransferStatus,
  handleTopUpSuccess,
  handleTopUpFailed,
  handleTransferSuccess,
  handleTransferFailed,
  routeWebhookEvent,
};

// ── Row shapes ──────────────────────────────────────────────────────────────

interface StuckTopUp {
  id: string;
  cf_order_id: string;
  status: string;
  brand_id: string;
}

interface StuckWithdrawal {
  id: string;
  cf_transfer_id: string;
  status: string;
}

interface StuckWebhookEvent {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  retry_count: number;
}

export interface ReconcileResult {
  top_ups_reconciled: number;
  top_ups_errors: Array<{ id: string; error: string }>;
  withdrawals_reconciled: number;
  withdrawals_errors: Array<{ id: string; error: string }>;
  webhooks_reprocessed: number;
  webhooks_errors: Array<{ id: string; error: string }>;
}

// ── Core logic (pure — testable without Inngest runtime) ────────────────────

export async function runCashfreeReconcile(args: {
  admin: ReconcileAdmin;
  step: MinimalStep;
  logger: MinimalLogger;
  deps?: ReconcileDeps;
  now?: () => Date;
}): Promise<ReconcileResult> {
  const { admin, step, logger } = args;
  const deps = args.deps ?? defaultDeps;
  const now = args.now ?? (() => new Date());

  const result: ReconcileResult = {
    top_ups_reconciled: 0,
    top_ups_errors: [],
    withdrawals_reconciled: 0,
    withdrawals_errors: [],
    webhooks_reprocessed: 0,
    webhooks_errors: [],
  };

  // ── Pass 1: Stuck top-ups ─────────────────────────────────────────────────
  const stuckTopUps = await step.run("fetch-stuck-top-ups", async () => {
    const cutoff = new Date(
      now().getTime() - TOP_UP_STUCK_HOURS * 60 * 60 * 1000,
    ).toISOString();
    const { data, error } = await admin
      .from("credit_top_ups")
      .select("id, cf_order_id, status, brand_id")
      .in("status", ["initiated", "processing"])
      .lt("created_at", cutoff)
      .not("cf_order_id", "is", null)
      .limit(MAX_TOP_UPS_PER_RUN);
    if (error) throw new Error(`fetch-stuck-top-ups failed: ${error.message}`);
    return (data ?? []) as unknown as StuckTopUp[];
  });

  logger.info(`[cashfree-reconcile] ${stuckTopUps.length} stuck top-up(s)`);

  for (const topUp of stuckTopUps) {
    try {
      await step.run(`reconcile-top-up-${topUp.id}`, async () => {
        const orderStatus = await deps.getOrderStatus(topUp.cf_order_id);
        const cashfreeStatus = orderStatus.order_status;

        if (cashfreeStatus === "PAID") {
          const successfulPayment = orderStatus.payments?.find(
            (p) => p.payment_status === "SUCCESS",
          );
          await deps.handleTopUpSuccess(admin, {
            orderId: topUp.cf_order_id,
            cfPaymentId: successfulPayment?.cf_payment_id ?? null,
          });
          result.top_ups_reconciled += 1;
        } else if (
          cashfreeStatus === "EXPIRED" ||
          cashfreeStatus === "CANCELLED" ||
          cashfreeStatus === "TERMINATED"
        ) {
          await deps.handleTopUpFailed(admin, {
            orderId: topUp.cf_order_id,
            reason: `reconciled_${cashfreeStatus.toLowerCase()}`,
          });
          result.top_ups_reconciled += 1;
        }
        // ACTIVE → leave alone, checkout session may still be live.
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      result.top_ups_errors.push({ id: topUp.id, error: message });
    }
  }

  // ── Pass 2: Stuck withdrawals ─────────────────────────────────────────────
  const stuckWithdrawals = await step.run(
    "fetch-stuck-withdrawals",
    async () => {
      const cutoff = new Date(
        now().getTime() - WITHDRAWAL_STUCK_HOURS * 60 * 60 * 1000,
      ).toISOString();
      const { data, error } = await admin
        .from("withdrawal_requests")
        .select("id, cf_transfer_id, status")
        .in("status", ["deductions_applied", "processing"])
        .lt("updated_at", cutoff)
        .not("cf_transfer_id", "is", null)
        .limit(MAX_WITHDRAWALS_PER_RUN);
      if (error) {
        throw new Error(`fetch-stuck-withdrawals failed: ${error.message}`);
      }
      return (data ?? []) as unknown as StuckWithdrawal[];
    },
  );

  logger.info(
    `[cashfree-reconcile] ${stuckWithdrawals.length} stuck withdrawal(s)`,
  );

  for (const wr of stuckWithdrawals) {
    try {
      await step.run(`reconcile-withdrawal-${wr.id}`, async () => {
        const transferStatus = await deps.getTransferStatus(wr.cf_transfer_id);
        const mapped = mapTransferStatus(transferStatus.status);

        if (mapped === "success") {
          await deps.handleTransferSuccess(admin, {
            transferId: wr.cf_transfer_id,
            utr: transferStatus.utr ?? "",
          });
          result.withdrawals_reconciled += 1;
        } else if (mapped === "failed") {
          await deps.handleTransferFailed(admin, {
            transferId: wr.cf_transfer_id,
            reason:
              transferStatus.status_description ??
              `reconciled_${transferStatus.status.toLowerCase()}`,
          });
          result.withdrawals_reconciled += 1;
        }
        // processing → leave alone until next tick.
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      result.withdrawals_errors.push({ id: wr.id, error: message });
    }
  }

  // ── Pass 3: Unprocessed webhook_events ────────────────────────────────────
  const stuckWebhooks = await step.run(
    "fetch-unprocessed-webhooks",
    async () => {
      const cutoff = new Date(
        now().getTime() - WEBHOOK_STUCK_HOURS * 60 * 60 * 1000,
      ).toISOString();
      const { data, error } = await admin
        .from("webhook_events")
        .select("id, event_type, payload, retry_count")
        .is("processed_at", null)
        .eq("source", "cashfree")
        .lt("received_at", cutoff)
        .lt("retry_count", MAX_WEBHOOK_RETRIES)
        .order("received_at", { ascending: true })
        .limit(MAX_WEBHOOKS_PER_RUN);
      if (error) {
        throw new Error(`fetch-unprocessed-webhooks failed: ${error.message}`);
      }
      return (data ?? []) as unknown as StuckWebhookEvent[];
    },
  );

  logger.info(
    `[cashfree-reconcile] ${stuckWebhooks.length} unprocessed webhook(s)`,
  );

  for (const we of stuckWebhooks) {
    try {
      await step.run(`retry-webhook-${we.id}`, async () => {
        // Reconstruct a CashfreeWebhookEvent envelope from the stored payload.
        // The raw payload is the full JSON body Cashfree sent, which has the
        // same shape as CashfreeWebhookEvent (type/event_time/data).
        const envelope = we.payload as Partial<CashfreeWebhookEvent>;
        if (!envelope?.type || !envelope?.data) {
          // Malformed payload — bump retry_count so we stop rechecking it.
          await admin
            .from("webhook_events")
            .update({
              retry_count: we.retry_count + 1,
              processing_error: "malformed payload — missing type/data",
            })
            .eq("id", we.id);
          throw new Error("malformed payload");
        }

        try {
          await deps.routeWebhookEvent(admin, envelope as CashfreeWebhookEvent);
          await admin
            .from("webhook_events")
            .update({ processed_at: new Date().toISOString() })
            .eq("id", we.id);
          result.webhooks_reprocessed += 1;
        } catch (handlerErr) {
          const message =
            handlerErr instanceof Error
              ? handlerErr.message
              : String(handlerErr);
          await admin
            .from("webhook_events")
            .update({
              retry_count: we.retry_count + 1,
              processing_error: message.slice(0, 1000),
            })
            .eq("id", we.id);
          throw handlerErr;
        }
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      result.webhooks_errors.push({ id: we.id, error: message });
    }
  }

  if (
    result.top_ups_errors.length > 0 ||
    result.withdrawals_errors.length > 0 ||
    result.webhooks_errors.length > 0
  ) {
    logger.error("[cashfree-reconcile] reconciliation errors", {
      top_ups_errors: result.top_ups_errors,
      withdrawals_errors: result.withdrawals_errors,
      webhooks_errors: result.webhooks_errors,
    });
  }

  return result;
}

// ── Inngest registration ─────────────────────────────────────────────────────

export const cashfreeReconcile = inngest.createFunction(
  {
    id: "reconcile/cashfree-reconcile",
    retries: 3,
    // Every 6 hours (UTC). First run of each UTC day is at midnight, then
    // 06:00, 12:00, 18:00. Timezone is not critical for reconciliation.
    triggers: [{ cron: "0 */6 * * *" }],
  },
  async ({ step, logger }) => {
    const admin = createAdminClient() as unknown as ReconcileAdmin;
    return runCashfreeReconcile({
      admin,
      step: step as unknown as MinimalStep,
      logger: logger as unknown as MinimalLogger,
    });
  },
);
