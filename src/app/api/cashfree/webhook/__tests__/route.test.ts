// ─────────────────────────────────────────────────────────────────────────────
// POST /api/cashfree/webhook — route tests
// ─────────────────────────────────────────────────────────────────────────────
//
// Covers:
//   • 400 on bad signature
//   • 200 + idempotent no-op on duplicate event
//   • PAYMENT_SUCCESS_WEBHOOK → flips top-up to success + calls commitTopUp
//   • PAYMENT_FAILED_WEBHOOK → flips top-up to failed
//   • PAYMENT_USER_DROPPED_WEBHOOK → flips top-up to failed (user_dropped reason)
//   • TRANSFER_SUCCESS → calls commitWithdrawalSuccess(withdrawalRequestId, cfUtr)
//   • TRANSFER_FAILED → calls commitWithdrawalFailure
//   • TRANSFER_REVERSED → calls commitWithdrawalFailure
//   • Always returns 200 if signature valid, even on downstream handler error
//     (prevents Cashfree from retry-storming)
// ─────────────────────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

// ── Mocks ────────────────────────────────────────────────────────────────────

const commitTopUpMock = vi.fn();
const commitWithdrawalSuccessMock = vi.fn();
const commitWithdrawalFailureMock = vi.fn();

// Admin chain — shared state across tables so test can inspect calls.
interface AdminMocks {
  // webhook_events.insert(...).select().single()
  webhookInsertSingle: ReturnType<typeof vi.fn>;
  // credit_top_ups.select('*').eq('cf_order_id', x).maybeSingle()
  topUpMaybeSingle: ReturnType<typeof vi.fn>;
  // credit_top_ups.update(...).eq('id', x)
  topUpUpdate: ReturnType<typeof vi.fn>;
  // withdrawal_requests.select('*').eq('cf_transfer_id', x).maybeSingle()
  withdrawalMaybeSingle: ReturnType<typeof vi.fn>;
  // webhook_events.update(...).eq('id', x)
  webhookUpdate: ReturnType<typeof vi.fn>;
}

let adminMocks: AdminMocks;

function buildAdminClient() {
  return {
    from(table: string) {
      if (table === "webhook_events") {
        return {
          insert: () => ({
            select: () => ({ single: adminMocks.webhookInsertSingle }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: (col: string, val: string) =>
              (adminMocks.webhookUpdate as (
                p: Record<string, unknown>,
                c: string,
                v: string,
              ) => Promise<{ error: unknown }>)(patch, col, val),
          }),
        };
      }
      if (table === "credit_top_ups") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: adminMocks.topUpMaybeSingle }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: (col: string, val: string) =>
              (adminMocks.topUpUpdate as (
                p: Record<string, unknown>,
                c: string,
                v: string,
              ) => Promise<{ error: unknown }>)(patch, col, val),
          }),
        };
      }
      if (table === "withdrawal_requests") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: adminMocks.withdrawalMaybeSingle }),
          }),
        };
      }
      throw new Error(`Unexpected table in admin mock: ${table}`);
    },
  };
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => buildAdminClient(),
}));

vi.mock("@/lib/ledger/commit", () => ({
  commitTopUp: (...args: unknown[]) => commitTopUpMock(...args),
  commitWithdrawalSuccess: (...args: unknown[]) =>
    commitWithdrawalSuccessMock(...args),
  commitWithdrawalFailure: (...args: unknown[]) =>
    commitWithdrawalFailureMock(...args),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const WEBHOOK_SECRET = "whsec-test";

function sign(body: string, timestamp: string): string {
  return createHmac("sha256", WEBHOOK_SECRET)
    .update(timestamp + body)
    .digest("base64");
}

async function callRoute(opts: {
  body: string;
  timestamp?: string;
  signature?: string;
}) {
  const { POST } = await import("../route");
  const timestamp = opts.timestamp ?? "1700000000";
  const signature = opts.signature ?? sign(opts.body, timestamp);
  const req = new Request("http://localhost/api/cashfree/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-webhook-timestamp": timestamp,
      "x-webhook-signature": signature,
    },
    body: opts.body,
  });
  return POST(req as unknown as Parameters<typeof POST>[0]);
}

function defaultMocks(): AdminMocks {
  return {
    webhookInsertSingle: vi.fn().mockResolvedValue({
      data: { id: "we-1" },
      error: null,
    }),
    topUpMaybeSingle: vi.fn().mockResolvedValue({
      data: {
        id: "topup-1",
        brand_id: "brand-1",
        cf_order_id: "topup_brand-1_123",
        status: "processing",
        amount_paise: 50000,
        credits: 10,
      },
      error: null,
    }),
    topUpUpdate: vi.fn().mockResolvedValue({ error: null }),
    withdrawalMaybeSingle: vi.fn().mockResolvedValue({
      data: {
        id: "wr-1",
        creator_id: "creator-1",
        cf_transfer_id: "wd_xxx",
        status: "processing",
      },
      error: null,
    }),
    webhookUpdate: vi.fn().mockResolvedValue({ error: null }),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/cashfree/webhook", () => {
  beforeEach(() => {
    adminMocks = defaultMocks();
    vi.stubEnv("CASHFREE_MODE", "test");
    vi.stubEnv("CASHFREE_APP_ID", "app-id");
    vi.stubEnv("CASHFREE_SECRET_KEY", "secret-key");
    vi.stubEnv("CASHFREE_WEBHOOK_SECRET", WEBHOOK_SECRET);
    commitTopUpMock.mockResolvedValue(undefined);
    commitWithdrawalSuccessMock.mockResolvedValue(undefined);
    commitWithdrawalFailureMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("400 on invalid signature", async () => {
    const body = JSON.stringify({
      type: "PAYMENT_SUCCESS_WEBHOOK",
      event_time: "2026-04-22T10:00:00Z",
      data: { order: { order_id: "topup_brand-1_123" } },
    });
    const res = await callRoute({
      body,
      signature: "definitely-not-the-real-sig",
    });
    expect(res.status).toBe(400);
    // Must NOT persist event — signature verification is our gate.
    expect(adminMocks.webhookInsertSingle).not.toHaveBeenCalled();
  });

  it("PAYMENT_SUCCESS_WEBHOOK: flips status + calls commitTopUp with id", async () => {
    const body = JSON.stringify({
      type: "PAYMENT_SUCCESS_WEBHOOK",
      event_time: "2026-04-22T10:00:00Z",
      data: {
        order: { order_id: "topup_brand-1_123" },
        payment: { cf_payment_id: "cfp_1", payment_status: "SUCCESS" },
      },
    });
    const res = await callRoute({ body });
    expect(res.status).toBe(200);

    // Row flipped to success before commit
    expect(adminMocks.topUpUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "success" }),
      "id",
      "topup-1",
    );

    // Ledger commit called with the top-up row id
    expect(commitTopUpMock).toHaveBeenCalledWith("topup-1");
  });

  it("idempotent: second delivery of same event is no-op", async () => {
    // webhook_events insert fails with unique constraint → dedup
    adminMocks.webhookInsertSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "duplicate key value violates unique constraint", code: "23505" },
    });
    const body = JSON.stringify({
      type: "PAYMENT_SUCCESS_WEBHOOK",
      event_time: "2026-04-22T10:00:00Z",
      data: { order: { order_id: "topup_brand-1_123" } },
    });
    const res = await callRoute({ body });
    expect(res.status).toBe(200);
    // Crucial: don't re-commit
    expect(commitTopUpMock).not.toHaveBeenCalled();
  });

  it("PAYMENT_SUCCESS: if row already status=success, no re-commit", async () => {
    adminMocks.topUpMaybeSingle.mockResolvedValueOnce({
      data: {
        id: "topup-1",
        cf_order_id: "topup_brand-1_123",
        status: "success",
      },
      error: null,
    });
    const body = JSON.stringify({
      type: "PAYMENT_SUCCESS_WEBHOOK",
      event_time: "2026-04-22T10:00:00Z",
      data: { order: { order_id: "topup_brand-1_123" } },
    });
    const res = await callRoute({ body });
    expect(res.status).toBe(200);
    expect(commitTopUpMock).not.toHaveBeenCalled();
  });

  it("PAYMENT_FAILED_WEBHOOK: flips status=failed with reason", async () => {
    const body = JSON.stringify({
      type: "PAYMENT_FAILED_WEBHOOK",
      event_time: "2026-04-22T10:00:00Z",
      data: {
        order: { order_id: "topup_brand-1_123" },
        payment: {
          payment_status: "FAILED",
          payment_message: "card_declined",
        },
      },
    });
    const res = await callRoute({ body });
    expect(res.status).toBe(200);

    expect(adminMocks.topUpUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        failure_reason: expect.stringMatching(/card_declined|failed/i),
      }),
      "id",
      "topup-1",
    );
    expect(commitTopUpMock).not.toHaveBeenCalled();
  });

  it("PAYMENT_USER_DROPPED_WEBHOOK: reason = user_dropped", async () => {
    const body = JSON.stringify({
      type: "PAYMENT_USER_DROPPED_WEBHOOK",
      event_time: "2026-04-22T10:00:00Z",
      data: { order: { order_id: "topup_brand-1_123" } },
    });
    const res = await callRoute({ body });
    expect(res.status).toBe(200);
    expect(adminMocks.topUpUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        failure_reason: "user_dropped",
      }),
      "id",
      "topup-1",
    );
  });

  it("TRANSFER_SUCCESS: calls commitWithdrawalSuccess with id + utr", async () => {
    const body = JSON.stringify({
      type: "TRANSFER_SUCCESS",
      event_time: "2026-04-22T10:00:00Z",
      data: {
        transfer: {
          transfer_id: "wd_xxx",
          status: "SUCCESS",
          utr: "UTR-12345",
        },
      },
    });
    const res = await callRoute({ body });
    expect(res.status).toBe(200);
    expect(commitWithdrawalSuccessMock).toHaveBeenCalledWith({
      withdrawalRequestId: "wr-1",
      cfUtr: "UTR-12345",
    });
  });

  it("TRANSFER_FAILED: calls commitWithdrawalFailure with reason", async () => {
    const body = JSON.stringify({
      type: "TRANSFER_FAILED",
      event_time: "2026-04-22T10:00:00Z",
      data: {
        transfer: {
          transfer_id: "wd_xxx",
          status: "FAILED",
          status_description: "beneficiary_invalid",
        },
      },
    });
    const res = await callRoute({ body });
    expect(res.status).toBe(200);
    expect(commitWithdrawalFailureMock).toHaveBeenCalledWith({
      withdrawalRequestId: "wr-1",
      reason: "beneficiary_invalid",
    });
  });

  it("TRANSFER_REVERSED: also routed to commitWithdrawalFailure", async () => {
    const body = JSON.stringify({
      type: "TRANSFER_REVERSED",
      event_time: "2026-04-22T10:00:00Z",
      data: {
        transfer: {
          transfer_id: "wd_xxx",
          status: "REVERSED",
          status_description: "returned_by_bank",
        },
      },
    });
    const res = await callRoute({ body });
    expect(res.status).toBe(200);
    expect(commitWithdrawalFailureMock).toHaveBeenCalledWith({
      withdrawalRequestId: "wr-1",
      reason: "returned_by_bank",
    });
  });

  it("still 200 when no matching top-up row found (race condition)", async () => {
    // Webhook arrived before the DB row was committed. Accept + record;
    // reconciliation cron will process later.
    adminMocks.topUpMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });
    const body = JSON.stringify({
      type: "PAYMENT_SUCCESS_WEBHOOK",
      event_time: "2026-04-22T10:00:00Z",
      data: { order: { order_id: "unknown_order" } },
    });
    const res = await callRoute({ body });
    expect(res.status).toBe(200);
    expect(commitTopUpMock).not.toHaveBeenCalled();
  });

  it("still 200 when commitTopUp throws (protects Cashfree from retry storm)", async () => {
    commitTopUpMock.mockRejectedValueOnce(new Error("db transient"));
    const body = JSON.stringify({
      type: "PAYMENT_SUCCESS_WEBHOOK",
      event_time: "2026-04-22T10:00:00Z",
      data: { order: { order_id: "topup_brand-1_123" } },
    });
    const res = await callRoute({ body });
    // We deliberately DO want retries for transient failures — so if the
    // ledger commit errors, mark webhook_event.processing_error and surface
    // 200 only after recording. Test: route still returns 200 but records the
    // error on webhook_events so the reconciliation cron picks it up.
    expect(res.status).toBe(200);
    expect(adminMocks.webhookUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        processing_error: expect.stringContaining("db transient"),
      }),
      "id",
      "we-1",
    );
  });
});
