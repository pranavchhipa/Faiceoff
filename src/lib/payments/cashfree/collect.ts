/**
 * Cashfree Collect (Payment Gateway) — brand credit top-up orders.
 *
 * Flow:
 *   1. Brand picks a credit pack → server calls `createTopUpOrder` →
 *      returns `payment_session_id` to the client.
 *   2. Client opens Cashfree checkout with that session id.
 *   3. Cashfree posts webhook → `/api/cashfree/webhook` → we flip
 *      credit_top_ups.status and credit the brand wallet.
 *   4. For reconciliation we can also poll `getOrderStatus`.
 *
 * Amounts are passed in paise (integer) at the call site and converted to
 * rupees (float) at the Cashfree boundary — Cashfree's API expects rupees.
 */

import { CashfreeClient } from "./client";
import type {
  CashfreeCreateOrderRequest,
  CashfreeOrderResponse,
  CashfreeOrderStatusResponse,
} from "./types";

export interface CreateTopUpOrderParams {
  brandId: string;
  pack: "free_signup" | "small" | "medium" | "large";
  credits: number;
  amountPaise: number;
  customerEmail: string;
  customerPhone: string;
  /** Override the generated order id (pass from DB row if pre-allocated). */
  orderId?: string;
  /** Override return URL template. Defaults to /brand/credits?order_id={order_id}. */
  returnUrl?: string;
  /** Override webhook notify URL. Defaults to /api/cashfree/webhook. */
  notifyUrl?: string;
}

export interface CreateTopUpOrderResult {
  orderId: string;
  paymentSessionId: string;
}

function resolveAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000"
  );
}

export async function createTopUpOrder(
  params: CreateTopUpOrderParams,
): Promise<CreateTopUpOrderResult> {
  const client = new CashfreeClient();
  const appUrl = resolveAppUrl();
  const orderId = params.orderId ?? `topup_${params.brandId}_${Date.now()}`;

  const body: CashfreeCreateOrderRequest = {
    order_id: orderId,
    order_amount: params.amountPaise / 100,
    order_currency: "INR",
    customer_details: {
      customer_id: params.brandId,
      customer_email: params.customerEmail,
      customer_phone: params.customerPhone,
    },
    order_meta: {
      return_url:
        params.returnUrl ?? `${appUrl}/brand/credits?order_id={order_id}`,
      notify_url: params.notifyUrl ?? `${appUrl}/api/cashfree/webhook`,
    },
    order_tags: {
      pack: params.pack,
      credits: params.credits.toString(),
      brand_id: params.brandId,
    },
  };

  const response = await client.request<CashfreeOrderResponse>({
    method: "POST",
    path: "/pg/orders",
    body: body as unknown as Record<string, unknown>,
  });

  return {
    orderId: response.order_id,
    paymentSessionId: response.payment_session_id,
  };
}

export async function getOrderStatus(
  orderId: string,
): Promise<CashfreeOrderStatusResponse> {
  const client = new CashfreeClient();
  return client.request<CashfreeOrderStatusResponse>({
    method: "GET",
    path: `/pg/orders/${encodeURIComponent(orderId)}`,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// createWalletTopUpOrder — Cashfree order for INR wallet top-up (no pack code)
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateWalletTopUpOrderParams {
  brandId: string;
  walletTopUpId: string;
  amountPaise: number;
  customerEmail: string;
  customerPhone: string;
  returnUrl?: string;
  notifyUrl?: string;
}

export interface CreateWalletTopUpOrderResult {
  orderId: string;
  paymentSessionId: string;
}

/**
 * Create a Cashfree order for a wallet INR top-up.
 * Unlike `createTopUpOrder`, this carries no pack code in order_tags —
 * it links back to `wallet_top_ups.id` so the webhook can find the row.
 */
export async function createWalletTopUpOrder(
  params: CreateWalletTopUpOrderParams,
): Promise<CreateWalletTopUpOrderResult> {
  const client = new CashfreeClient();
  const appUrl = resolveAppUrl();
  const orderId = `walletup_${params.brandId}_${Date.now()}`;

  const body: CashfreeCreateOrderRequest = {
    order_id: orderId,
    order_amount: params.amountPaise / 100,
    order_currency: "INR",
    customer_details: {
      customer_id: params.brandId,
      customer_email: params.customerEmail,
      customer_phone: params.customerPhone,
    },
    order_meta: {
      return_url:
        params.returnUrl ?? `${appUrl}/brand/wallet?order_id={order_id}`,
      notify_url: params.notifyUrl ?? `${appUrl}/api/cashfree/webhook`,
    },
    order_tags: {
      type: "wallet_topup",
      wallet_top_up_id: params.walletTopUpId,
      brand_id: params.brandId,
    },
  };

  const response = await client.request<CashfreeOrderResponse>({
    method: "POST",
    path: "/pg/orders",
    body: body as unknown as Record<string, unknown>,
  });

  return {
    orderId: response.order_id,
    paymentSessionId: response.payment_session_id,
  };
}
