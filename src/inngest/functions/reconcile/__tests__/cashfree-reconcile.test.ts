// ─────────────────────────────────────────────────────────────────────────────
// cashfree-reconcile — unit tests for runCashfreeReconcile.
// ─────────────────────────────────────────────────────────────────────────────
//
// Strategy:
//   • Mock the admin client to return canned rows.
//   • Mock the Cashfree SDK (getOrderStatus, getTransferStatus) and handlers
//     (handleTopUpSuccess, etc.) via the injectable `deps` parameter.
//   • Assert: PAID/EXPIRED/ACTIVE top-ups routed correctly; SUCCESS/FAILED/
//     PROCESSING withdrawals routed correctly; ACTIVE/processing left alone;
//     one row error doesn't crash the whole job.
// ─────────────────────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  runCashfreeReconcile,
  type MinimalLogger,
  type MinimalStep,
  type ReconcileAdmin,
  type ReconcileDeps,
} from "../cashfree-reconcile";
import type {
  CashfreeOrderStatusResponse,
  CashfreeTransferResponse,
} from "@/lib/payments/cashfree/types";

// ── Mock builders ───────────────────────────────────────────────────────────

function makeStep(): MinimalStep {
  return {
    async run<T>(_id: string, fn: () => Promise<T>): Promise<T> {
      return fn();
    },
  };
}

type LoggerFn = (msg: string, meta?: unknown) => void;

function makeLogger(): MinimalLogger & {
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
} {
  return {
    info: vi.fn<LoggerFn>(),
    warn: vi.fn<LoggerFn>(),
    error: vi.fn<LoggerFn>(),
  };
}

interface MockState {
  topUps: Array<{
    id: string;
    cf_order_id: string;
    status: string;
    brand_id: string;
  }>;
  withdrawals: Array<{
    id: string;
    cf_transfer_id: string;
    status: string;
  }>;
  webhookEvents: Array<{
    id: string;
    event_type: string;
    payload: Record<string, unknown>;
    retry_count: number;
  }>;
  updateCalls: Array<{ table: string; patch: Record<string, unknown>; id: string }>;
}

function makeAdmin(state: MockState): ReconcileAdmin {
  return {
    from(table: string) {
      // For top-ups / withdrawals: select -> in -> lt -> not -> limit
      // For webhook_events: select -> is -> eq -> lt -> lt -> order -> limit
      if (table === "credit_top_ups") {
        return {
          select(_cols: string) {
            return {
              eq(_col: string, _val: string) {
                return {
                  async maybeSingle() {
                    return { data: null, error: null };
                  },
                };
              },
              in(_col: string, _values: string[]) {
                return {
                  lt(_col2: string, _val2: string) {
                    return {
                      not(_col3: string, _op: string, _val3: null) {
                        return {
                          async limit(_n: number) {
                            return { data: state.topUps, error: null };
                          },
                        };
                      },
                    };
                  },
                };
              },
              is(_col: string, _val: null) {
                throw new Error("unexpected is() on credit_top_ups");
              },
            };
          },
          update(patch: Record<string, unknown>) {
            return {
              async eq(_col: string, id: string) {
                state.updateCalls.push({ table, patch, id });
                return { error: null };
              },
            };
          },
        };
      }
      if (table === "withdrawal_requests") {
        return {
          select(_cols: string) {
            return {
              eq(_col: string, _val: string) {
                return {
                  async maybeSingle() {
                    return { data: null, error: null };
                  },
                };
              },
              in(_col: string, _values: string[]) {
                return {
                  lt(_col2: string, _val2: string) {
                    return {
                      not(_col3: string, _op: string, _val3: null) {
                        return {
                          async limit(_n: number) {
                            return { data: state.withdrawals, error: null };
                          },
                        };
                      },
                    };
                  },
                };
              },
              is(_col: string, _val: null) {
                throw new Error("unexpected is() on withdrawal_requests");
              },
            };
          },
          update(_patch: Record<string, unknown>) {
            return {
              async eq(_col: string, _id: string) {
                return { error: null };
              },
            };
          },
        };
      }
      if (table === "webhook_events") {
        return {
          select(_cols: string) {
            return {
              eq(_col: string, _val: string) {
                return {
                  async maybeSingle() {
                    return { data: null, error: null };
                  },
                };
              },
              in(_col: string, _values: string[]) {
                throw new Error("unexpected in() on webhook_events");
              },
              is(_col: string, _val: null) {
                return {
                  eq(_col2: string, _val2: string) {
                    return {
                      lt(_col3: string, _val3: string) {
                        return {
                          lt(_col4: string, _val4: number) {
                            return {
                              order(
                                _col5: string,
                                _options: { ascending: boolean },
                              ) {
                                return {
                                  async limit(_n: number) {
                                    return {
                                      data: state.webhookEvents,
                                      error: null,
                                    };
                                  },
                                };
                              },
                            };
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
          update(patch: Record<string, unknown>) {
            return {
              async eq(_col: string, id: string) {
                state.updateCalls.push({ table, patch, id });
                return { error: null };
              },
            };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  } as unknown as ReconcileAdmin;
}

function makeDeps(
  overrides: Partial<ReconcileDeps> & {
    orderStatusByOrderId?: Map<string, CashfreeOrderStatusResponse>;
    transferStatusByTransferId?: Map<string, CashfreeTransferResponse>;
  } = {},
): ReconcileDeps & {
  _getOrderStatus: ReturnType<typeof vi.fn>;
  _getTransferStatus: ReturnType<typeof vi.fn>;
  _handleTopUpSuccess: ReturnType<typeof vi.fn>;
  _handleTopUpFailed: ReturnType<typeof vi.fn>;
  _handleTransferSuccess: ReturnType<typeof vi.fn>;
  _handleTransferFailed: ReturnType<typeof vi.fn>;
  _routeWebhookEvent: ReturnType<typeof vi.fn>;
} {
  const orderMap = overrides.orderStatusByOrderId ?? new Map();
  const transferMap = overrides.transferStatusByTransferId ?? new Map();

  const getOrderStatus = vi.fn(async (orderId: string) => {
    const hit = orderMap.get(orderId);
    if (!hit) throw new Error(`no mock order for ${orderId}`);
    return hit;
  });
  const getTransferStatus = vi.fn(async (transferId: string) => {
    const hit = transferMap.get(transferId);
    if (!hit) throw new Error(`no mock transfer for ${transferId}`);
    return hit;
  });
  const handleTopUpSuccess = vi.fn(async () => {});
  const handleTopUpFailed = vi.fn(async () => {});
  const handleTransferSuccess = vi.fn(async () => {});
  const handleTransferFailed = vi.fn(async () => {});
  const routeWebhookEvent = vi.fn(async () => {});

  return {
    getOrderStatus: overrides.getOrderStatus ?? getOrderStatus,
    getTransferStatus: overrides.getTransferStatus ?? getTransferStatus,
    handleTopUpSuccess: overrides.handleTopUpSuccess ?? handleTopUpSuccess,
    handleTopUpFailed: overrides.handleTopUpFailed ?? handleTopUpFailed,
    handleTransferSuccess:
      overrides.handleTransferSuccess ?? handleTransferSuccess,
    handleTransferFailed:
      overrides.handleTransferFailed ?? handleTransferFailed,
    routeWebhookEvent: overrides.routeWebhookEvent ?? routeWebhookEvent,
    _getOrderStatus: getOrderStatus,
    _getTransferStatus: getTransferStatus,
    _handleTopUpSuccess: handleTopUpSuccess,
    _handleTopUpFailed: handleTopUpFailed,
    _handleTransferSuccess: handleTransferSuccess,
    _handleTransferFailed: handleTransferFailed,
    _routeWebhookEvent: routeWebhookEvent,
  };
}

// Factory for a PAID order-status response.
function paidOrder(
  orderId: string,
  cfPaymentId = "cfp_1",
): CashfreeOrderStatusResponse {
  return {
    order_id: orderId,
    order_status: "PAID",
    order_amount: 500,
    order_currency: "INR",
    payments: [
      {
        cf_payment_id: cfPaymentId,
        payment_id: cfPaymentId,
        payment_status: "SUCCESS",
        payment_amount: 500,
        payment_currency: "INR",
      },
    ],
  };
}

function expiredOrder(orderId: string): CashfreeOrderStatusResponse {
  return {
    order_id: orderId,
    order_status: "EXPIRED",
    order_amount: 500,
    order_currency: "INR",
    payments: [],
  };
}

function activeOrder(orderId: string): CashfreeOrderStatusResponse {
  return {
    order_id: orderId,
    order_status: "ACTIVE",
    order_amount: 500,
    order_currency: "INR",
    payments: [],
  };
}

function successfulTransfer(
  transferId: string,
  utr = "UTR-123",
): CashfreeTransferResponse {
  return {
    transfer_id: transferId,
    status: "SUCCESS",
    utr,
  };
}

function failedTransfer(transferId: string): CashfreeTransferResponse {
  return {
    transfer_id: transferId,
    status: "FAILED",
    status_description: "beneficiary_invalid",
  };
}

function processingTransfer(transferId: string): CashfreeTransferResponse {
  return {
    transfer_id: transferId,
    status: "PROCESSING",
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("runCashfreeReconcile", () => {
  let state: MockState;
  const fixedNow = new Date("2026-04-22T18:00:00Z");

  beforeEach(() => {
    state = {
      topUps: [],
      withdrawals: [],
      webhookEvents: [],
      updateCalls: [],
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("no-op when nothing is stuck", async () => {
    const result = await runCashfreeReconcile({
      admin: makeAdmin(state),
      step: makeStep(),
      logger: makeLogger(),
      deps: makeDeps(),
      now: () => fixedNow,
    });

    expect(result.top_ups_reconciled).toBe(0);
    expect(result.withdrawals_reconciled).toBe(0);
    expect(result.webhooks_reprocessed).toBe(0);
  });

  it("stuck top-up status=PAID → handleTopUpSuccess called", async () => {
    state.topUps = [
      {
        id: "tu-1",
        cf_order_id: "topup_brand-1_abc",
        status: "processing",
        brand_id: "brand-1",
      },
    ];
    const deps = makeDeps({
      orderStatusByOrderId: new Map([
        ["topup_brand-1_abc", paidOrder("topup_brand-1_abc", "cfp_99")],
      ]),
    });
    const result = await runCashfreeReconcile({
      admin: makeAdmin(state),
      step: makeStep(),
      logger: makeLogger(),
      deps,
      now: () => fixedNow,
    });

    expect(result.top_ups_reconciled).toBe(1);
    expect(result.top_ups_errors).toEqual([]);
    expect(deps._handleTopUpSuccess).toHaveBeenCalledWith(
      expect.anything(),
      {
        orderId: "topup_brand-1_abc",
        cfPaymentId: "cfp_99",
      },
    );
    expect(deps._handleTopUpFailed).not.toHaveBeenCalled();
  });

  it("stuck top-up status=EXPIRED → handleTopUpFailed with reconciled_expired", async () => {
    state.topUps = [
      {
        id: "tu-1",
        cf_order_id: "topup_brand-1_exp",
        status: "processing",
        brand_id: "brand-1",
      },
    ];
    const deps = makeDeps({
      orderStatusByOrderId: new Map([
        ["topup_brand-1_exp", expiredOrder("topup_brand-1_exp")],
      ]),
    });

    const result = await runCashfreeReconcile({
      admin: makeAdmin(state),
      step: makeStep(),
      logger: makeLogger(),
      deps,
      now: () => fixedNow,
    });

    expect(result.top_ups_reconciled).toBe(1);
    expect(deps._handleTopUpFailed).toHaveBeenCalledWith(
      expect.anything(),
      {
        orderId: "topup_brand-1_exp",
        reason: "reconciled_expired",
      },
    );
    expect(deps._handleTopUpSuccess).not.toHaveBeenCalled();
  });

  it("stuck top-up status=ACTIVE → left alone, no handler called", async () => {
    state.topUps = [
      {
        id: "tu-1",
        cf_order_id: "topup_brand-1_act",
        status: "processing",
        brand_id: "brand-1",
      },
    ];
    const deps = makeDeps({
      orderStatusByOrderId: new Map([
        ["topup_brand-1_act", activeOrder("topup_brand-1_act")],
      ]),
    });

    const result = await runCashfreeReconcile({
      admin: makeAdmin(state),
      step: makeStep(),
      logger: makeLogger(),
      deps,
      now: () => fixedNow,
    });

    expect(result.top_ups_reconciled).toBe(0);
    expect(result.top_ups_errors).toEqual([]);
    expect(deps._handleTopUpSuccess).not.toHaveBeenCalled();
    expect(deps._handleTopUpFailed).not.toHaveBeenCalled();
  });

  it("stuck withdrawal status=SUCCESS → handleTransferSuccess with UTR", async () => {
    state.withdrawals = [
      { id: "wr-1", cf_transfer_id: "wd_aaa", status: "processing" },
    ];
    const deps = makeDeps({
      transferStatusByTransferId: new Map([
        ["wd_aaa", successfulTransfer("wd_aaa", "UTR-XYZ")],
      ]),
    });

    const result = await runCashfreeReconcile({
      admin: makeAdmin(state),
      step: makeStep(),
      logger: makeLogger(),
      deps,
      now: () => fixedNow,
    });

    expect(result.withdrawals_reconciled).toBe(1);
    expect(deps._handleTransferSuccess).toHaveBeenCalledWith(
      expect.anything(),
      { transferId: "wd_aaa", utr: "UTR-XYZ" },
    );
  });

  it("stuck withdrawal status=FAILED → handleTransferFailed with reason", async () => {
    state.withdrawals = [
      { id: "wr-1", cf_transfer_id: "wd_bbb", status: "processing" },
    ];
    const deps = makeDeps({
      transferStatusByTransferId: new Map([
        ["wd_bbb", failedTransfer("wd_bbb")],
      ]),
    });

    const result = await runCashfreeReconcile({
      admin: makeAdmin(state),
      step: makeStep(),
      logger: makeLogger(),
      deps,
      now: () => fixedNow,
    });

    expect(result.withdrawals_reconciled).toBe(1);
    expect(deps._handleTransferFailed).toHaveBeenCalledWith(
      expect.anything(),
      { transferId: "wd_bbb", reason: "beneficiary_invalid" },
    );
  });

  it("stuck withdrawal status=PROCESSING → left alone", async () => {
    state.withdrawals = [
      { id: "wr-1", cf_transfer_id: "wd_ccc", status: "processing" },
    ];
    const deps = makeDeps({
      transferStatusByTransferId: new Map([
        ["wd_ccc", processingTransfer("wd_ccc")],
      ]),
    });

    const result = await runCashfreeReconcile({
      admin: makeAdmin(state),
      step: makeStep(),
      logger: makeLogger(),
      deps,
      now: () => fixedNow,
    });

    expect(result.withdrawals_reconciled).toBe(0);
    expect(deps._handleTransferSuccess).not.toHaveBeenCalled();
    expect(deps._handleTransferFailed).not.toHaveBeenCalled();
  });

  it("error on ONE top-up does not crash the job — others still reconciled", async () => {
    state.topUps = [
      {
        id: "tu-good",
        cf_order_id: "topup_ok",
        status: "processing",
        brand_id: "b-1",
      },
      {
        id: "tu-bad",
        cf_order_id: "topup_bad",
        status: "processing",
        brand_id: "b-2",
      },
      {
        id: "tu-good-2",
        cf_order_id: "topup_ok_2",
        status: "processing",
        brand_id: "b-3",
      },
    ];
    const getOrderStatus = vi.fn(async (orderId: string) => {
      if (orderId === "topup_bad") throw new Error("cashfree 500");
      return paidOrder(orderId);
    });
    const deps = makeDeps({ getOrderStatus });

    const result = await runCashfreeReconcile({
      admin: makeAdmin(state),
      step: makeStep(),
      logger: makeLogger(),
      deps,
      now: () => fixedNow,
    });

    expect(result.top_ups_reconciled).toBe(2);
    expect(result.top_ups_errors).toHaveLength(1);
    expect(result.top_ups_errors[0].id).toBe("tu-bad");
    expect(result.top_ups_errors[0].error).toMatch(/cashfree 500/);
  });

  it("unprocessed webhook_event gets replayed via routeWebhookEvent", async () => {
    const payload = {
      type: "PAYMENT_SUCCESS_WEBHOOK",
      event_time: "2026-04-22T10:00:00Z",
      data: { order: { order_id: "topup_late_arriver" } },
    };
    state.webhookEvents = [
      {
        id: "we-1",
        event_type: "PAYMENT_SUCCESS_WEBHOOK",
        payload,
        retry_count: 0,
      },
    ];
    const deps = makeDeps();

    const result = await runCashfreeReconcile({
      admin: makeAdmin(state),
      step: makeStep(),
      logger: makeLogger(),
      deps,
      now: () => fixedNow,
    });

    expect(result.webhooks_reprocessed).toBe(1);
    expect(deps._routeWebhookEvent).toHaveBeenCalledTimes(1);
    // Updated with processed_at
    const update = state.updateCalls.find(
      (c) => c.table === "webhook_events" && c.id === "we-1",
    );
    expect(update?.patch).toMatchObject({ processed_at: expect.any(String) });
  });

  it("webhook replay failure increments retry_count and records error", async () => {
    const payload = {
      type: "PAYMENT_SUCCESS_WEBHOOK",
      event_time: "2026-04-22T10:00:00Z",
      data: { order: { order_id: "topup_late" } },
    };
    state.webhookEvents = [
      {
        id: "we-2",
        event_type: "PAYMENT_SUCCESS_WEBHOOK",
        payload,
        retry_count: 2,
      },
    ];
    const routeWebhookEvent = vi.fn(async () => {
      throw new Error("handler exploded");
    });
    const deps = makeDeps({ routeWebhookEvent });

    const result = await runCashfreeReconcile({
      admin: makeAdmin(state),
      step: makeStep(),
      logger: makeLogger(),
      deps,
      now: () => fixedNow,
    });

    expect(result.webhooks_reprocessed).toBe(0);
    expect(result.webhooks_errors).toHaveLength(1);
    expect(result.webhooks_errors[0].id).toBe("we-2");
    // retry_count bumped
    const update = state.updateCalls.find(
      (c) => c.table === "webhook_events" && c.id === "we-2",
    );
    expect(update?.patch).toMatchObject({
      retry_count: 3,
      processing_error: expect.stringContaining("handler exploded"),
    });
  });

  it("runs all 3 passes in a single call", async () => {
    state.topUps = [
      {
        id: "tu-1",
        cf_order_id: "topup_1",
        status: "processing",
        brand_id: "b-1",
      },
    ];
    state.withdrawals = [
      { id: "wr-1", cf_transfer_id: "wd_1", status: "processing" },
    ];
    state.webhookEvents = [
      {
        id: "we-1",
        event_type: "TRANSFER_SUCCESS",
        payload: {
          type: "TRANSFER_SUCCESS",
          event_time: "t",
          data: { transfer: { transfer_id: "wd_legacy", utr: "UTR-legacy" } },
        },
        retry_count: 0,
      },
    ];
    const deps = makeDeps({
      orderStatusByOrderId: new Map([["topup_1", paidOrder("topup_1")]]),
      transferStatusByTransferId: new Map([
        ["wd_1", successfulTransfer("wd_1", "UTR-OK")],
      ]),
    });

    const result = await runCashfreeReconcile({
      admin: makeAdmin(state),
      step: makeStep(),
      logger: makeLogger(),
      deps,
      now: () => fixedNow,
    });

    expect(result.top_ups_reconciled).toBe(1);
    expect(result.withdrawals_reconciled).toBe(1);
    expect(result.webhooks_reprocessed).toBe(1);
    expect(deps._handleTopUpSuccess).toHaveBeenCalledTimes(1);
    expect(deps._handleTransferSuccess).toHaveBeenCalledTimes(1);
    expect(deps._routeWebhookEvent).toHaveBeenCalledTimes(1);
  });
});
