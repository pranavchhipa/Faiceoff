import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTopUpOrder, getOrderStatus } from "../collect";

type FetchMock = ReturnType<typeof vi.fn>;
type FetchArgs = Parameters<typeof fetch>;

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

describe("Cashfree Collect", () => {
  let fetchMock: FetchMock;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv("CASHFREE_MODE", "test");
    vi.stubEnv("CASHFREE_APP_ID", "app-id");
    vi.stubEnv("CASHFREE_SECRET_KEY", "secret-key");
    vi.stubEnv("CASHFREE_WEBHOOK_SECRET", "webhook-secret");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://faiceoff.test");

    originalFetch = globalThis.fetch;
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("createTopUpOrder", () => {
    it("posts the expected payload and returns order_id + payment_session_id", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          order_id: "topup_brand-1_1700000000",
          order_status: "ACTIVE",
          order_amount: 50,
          order_currency: "INR",
          payment_session_id: "session_abc_xyz",
          cf_order_id: "cf-100",
        }),
      );

      const result = await createTopUpOrder({
        brandId: "brand-1",
        pack: "medium",
        credits: 200,
        amountPaise: 800000, // ₹8000 → 8000.00 rupees
        customerEmail: "brand@example.com",
        customerPhone: "9999999999",
        orderId: "topup_brand-1_1700000000",
      });

      expect(result.orderId).toBe("topup_brand-1_1700000000");
      expect(result.paymentSessionId).toBe("session_abc_xyz");

      const [url, init] = fetchMock.mock.calls[0] as FetchArgs;
      expect(url).toBe("https://sandbox.cashfree.com/pg/orders");
      expect(init?.method).toBe("POST");

      const body = JSON.parse(init?.body as string);
      expect(body.order_id).toBe("topup_brand-1_1700000000");
      // Cashfree expects rupees, not paise
      expect(body.order_amount).toBe(8000);
      expect(body.order_currency).toBe("INR");
      expect(body.customer_details).toMatchObject({
        customer_id: "brand-1",
        customer_email: "brand@example.com",
        customer_phone: "9999999999",
      });
      expect(body.order_tags).toMatchObject({
        pack: "medium",
        credits: "200",
      });
      expect(body.order_meta.notify_url).toBe(
        "https://faiceoff.test/api/cashfree/webhook",
      );
      expect(body.order_meta.return_url).toContain("order_id={order_id}");
    });

    it("auto-generates an order_id when caller does not provide one", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          order_id: "topup_brand-2_1700001111",
          order_status: "ACTIVE",
          order_amount: 25,
          order_currency: "INR",
          payment_session_id: "sess_1",
        }),
      );

      const result = await createTopUpOrder({
        brandId: "brand-2",
        pack: "small",
        credits: 50,
        amountPaise: 250000,
        customerEmail: "a@b.com",
        customerPhone: "9000000000",
      });

      const body = JSON.parse(
        (fetchMock.mock.calls[0] as FetchArgs)[1]?.body as string,
      );
      expect(body.order_id).toMatch(/^topup_brand-2_\d+$/);
      expect(result.orderId).toBe("topup_brand-2_1700001111");
    });
  });

  describe("getOrderStatus", () => {
    it("GETs /pg/orders/{order_id} and returns status + payments", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          order_id: "topup_abc_1",
          order_status: "PAID",
          order_amount: 80,
          order_currency: "INR",
          payments: [
            {
              cf_payment_id: "cfp1",
              payment_id: "pi_1",
              payment_status: "SUCCESS",
              payment_amount: 80,
              payment_currency: "INR",
            },
          ],
        }),
      );

      const result = await getOrderStatus("topup_abc_1");
      expect(result.order_status).toBe("PAID");
      expect(result.payments).toHaveLength(1);
      expect(result.payments[0].payment_status).toBe("SUCCESS");

      const [url, init] = fetchMock.mock.calls[0] as FetchArgs;
      expect(url).toBe("https://sandbox.cashfree.com/pg/orders/topup_abc_1");
      expect(init?.method).toBe("GET");
    });
  });
});
