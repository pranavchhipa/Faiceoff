import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { confirmReceiptInNodal, getSettlementReport } from "../nodal";

type FetchMock = ReturnType<typeof vi.fn>;
type FetchArgs = Parameters<typeof fetch>;

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

describe("Cashfree Nodal helpers (smoke)", () => {
  let fetchMock: FetchMock;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv("CASHFREE_MODE", "test");
    vi.stubEnv("CASHFREE_APP_ID", "app-id");
    vi.stubEnv("CASHFREE_SECRET_KEY", "secret");
    vi.stubEnv("CASHFREE_WEBHOOK_SECRET", "whsec");

    originalFetch = globalThis.fetch;
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("confirmReceiptInNodal returns true when order is PAID + payment SUCCESS", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        order_id: "topup_1",
        order_status: "PAID",
        order_amount: 50,
        order_currency: "INR",
        payments: [
          {
            cf_payment_id: "c1",
            payment_id: "p1",
            payment_status: "SUCCESS",
            payment_amount: 50,
            payment_currency: "INR",
          },
        ],
      }),
    );

    expect(await confirmReceiptInNodal("topup_1")).toBe(true);
  });

  it("confirmReceiptInNodal returns false when order is ACTIVE (still pending)", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        order_id: "topup_2",
        order_status: "ACTIVE",
        order_amount: 50,
        order_currency: "INR",
        payments: [],
      }),
    );

    expect(await confirmReceiptInNodal("topup_2")).toBe(false);
  });

  it("getSettlementReport builds the expected query string", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ settlements: [], cursor: null }),
    );

    const result = await getSettlementReport("2026-04-22");
    expect(result.settlements).toEqual([]);

    const [url] = fetchMock.mock.calls[0] as FetchArgs;
    expect(String(url)).toBe(
      "https://sandbox.cashfree.com/pg/settlements?start_date=2026-04-22&end_date=2026-04-22",
    );
  });
});
