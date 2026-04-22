import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { parseWebhook, CashfreeWebhookSignatureError } from "../webhook";

function sign(body: string, timestamp: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(timestamp + body)
    .digest("base64");
}

describe("parseWebhook", () => {
  const SECRET = "whsec-test-xyz";

  beforeEach(() => {
    vi.stubEnv("CASHFREE_MODE", "test");
    vi.stubEnv("CASHFREE_APP_ID", "app-id");
    vi.stubEnv("CASHFREE_SECRET_KEY", "secret-key");
    vi.stubEnv("CASHFREE_WEBHOOK_SECRET", SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("parses a payment success event when signature is valid", () => {
    const rawBody = JSON.stringify({
      type: "PAYMENT_SUCCESS_WEBHOOK",
      event_time: "2026-04-22T10:00:00Z",
      data: {
        order: { order_id: "topup_abc_123" },
        payment: { cf_payment_id: "cfp_1", payment_status: "SUCCESS" },
      },
    });
    const timestamp = "1713780000";
    const signature = sign(rawBody, timestamp, SECRET);

    const event = parseWebhook(rawBody, { timestamp, signature });

    expect(event.type).toBe("PAYMENT_SUCCESS_WEBHOOK");
    expect(event.event_time).toBe("2026-04-22T10:00:00Z");
    expect(event.data).toMatchObject({
      order: { order_id: "topup_abc_123" },
    });
  });

  it("parses a transfer failed event", () => {
    const rawBody = JSON.stringify({
      type: "TRANSFER_FAILED",
      event_time: "2026-04-22T11:00:00Z",
      data: {
        transfer: { transfer_id: "wd_xxx", status: "FAILED" },
      },
    });
    const timestamp = "1713783600";
    const signature = sign(rawBody, timestamp, SECRET);

    const event = parseWebhook(rawBody, { timestamp, signature });
    expect(event.type).toBe("TRANSFER_FAILED");
  });

  it("throws CashfreeWebhookSignatureError on bad signature", () => {
    const rawBody = JSON.stringify({
      type: "PAYMENT_SUCCESS_WEBHOOK",
      event_time: "x",
      data: {},
    });

    expect(() =>
      parseWebhook(rawBody, {
        timestamp: "123",
        signature: "clearly-not-the-real-sig",
      }),
    ).toThrow(CashfreeWebhookSignatureError);
  });

  it("throws when body is not valid JSON even if signature is correct", () => {
    const rawBody = "not-json-at-all";
    const timestamp = "1";
    const signature = sign(rawBody, timestamp, SECRET);

    expect(() =>
      parseWebhook(rawBody, { timestamp, signature }),
    ).toThrow(/Cashfree webhook body is not valid JSON/);
  });
});
