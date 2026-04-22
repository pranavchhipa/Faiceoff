/**
 * Cashfree Nodal / Settlement helpers.
 *
 * Cashfree does not expose a standalone "split" or "escrow" API on Nodal —
 * funds arrive via Collect (tagged to brand) and leave via Payouts. The "lock"
 * between those events is purely a logical state in our DB (`escrow_ledger`).
 *
 * These helpers are thin read-side utilities for:
 *   - confirming a brand's Collect payment actually settled into our nodal
 *     account before we let ledger writes commit (defence in depth — our
 *     webhook already did the same check, this is for reconciliation)
 *   - pulling the daily settlement report for the accounting team
 *
 * @verifyAgainstDocs `/pg/settlements` pagination/cursor shape — Cashfree has
 * iterated on this endpoint. Treat the returned shape as loosely typed and
 * re-test against sandbox before relying on the cursor field in production.
 */

import { CashfreeClient } from "./client";
import { getOrderStatus } from "./collect";
import type { CashfreeSettlementReport } from "./types";

/**
 * Confirm that a Collect order actually paid in. Used as a sanity gate
 * before we commit a credit top-up to the ledger from a webhook — the webhook
 * signature being valid doesn't guarantee the Cashfree-side state flipped.
 */
export async function confirmReceiptInNodal(
  orderId: string,
): Promise<boolean> {
  const order = await getOrderStatus(orderId);
  if (order.order_status !== "PAID") return false;
  return order.payments.some((p) => p.payment_status === "SUCCESS");
}

/**
 * Fetch the settlement report for a single calendar date (YYYY-MM-DD).
 * The nightly reconciliation cron uses this to compare Cashfree's books
 * against our `escrow_ledger` + `platform_revenue_ledger` totals.
 */
export async function getSettlementReport(
  date: string,
): Promise<CashfreeSettlementReport> {
  const client = new CashfreeClient();
  const qs = new URLSearchParams({
    start_date: date,
    end_date: date,
  }).toString();
  return client.request<CashfreeSettlementReport>({
    method: "GET",
    path: `/pg/settlements?${qs}`,
  });
}
