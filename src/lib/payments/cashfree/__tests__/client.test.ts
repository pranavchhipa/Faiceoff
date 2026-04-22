import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createHmac } from "node:crypto";
import { CashfreeApiError, CashfreeClient } from "../client";

type FetchArgs = Parameters<typeof fetch>;
type FetchMock = ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

describe("CashfreeClient", () => {
  let fetchMock: FetchMock;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv("CASHFREE_MODE", "test");
    vi.stubEnv("CASHFREE_APP_ID", "app-id-123");
    vi.stubEnv("CASHFREE_SECRET_KEY", "secret-key-456");
    vi.stubEnv("CASHFREE_WEBHOOK_SECRET", "webhook-secret-789");
    vi.stubEnv("CASHFREE_NODAL_ACCOUNT_ID", "nodal-acc-1");

    originalFetch = globalThis.fetch;
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sends required signing headers + sandbox base URL in test mode", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    const client = new CashfreeClient();

    await client.request<{ ok: true }>({
      method: "POST",
      path: "/pg/orders",
      body: { foo: "bar" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as FetchArgs;
    expect(url).toBe("https://sandbox.cashfree.com/pg/orders");
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers["x-client-id"]).toBe("app-id-123");
    expect(headers["x-client-secret"]).toBe("secret-key-456");
    expect(headers["x-api-version"]).toBe("2025-01-01");
    expect(headers["content-type"]).toBe("application/json");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ foo: "bar" }));
  });

  it("uses production base URL when CASHFREE_MODE=prod", async () => {
    vi.stubEnv("CASHFREE_MODE", "prod");
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    const client = new CashfreeClient();

    await client.request({ method: "GET", path: "/pg/orders/abc" });

    const [url] = fetchMock.mock.calls[0] as FetchArgs;
    expect(url).toBe("https://api.cashfree.com/pg/orders/abc");
  });

  it("retries on 5xx up to 3 times then succeeds", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ err: "upstream" }, { status: 502 }))
      .mockResolvedValueOnce(jsonResponse({ err: "upstream" }, { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }, { status: 200 }));

    const client = new CashfreeClient();

    const promise = client.request<{ ok: true }>({
      method: "GET",
      path: "/pg/orders/abc",
    });
    // Advance past all possible backoffs (1s + 2s + 4s = 7s)
    await vi.advanceTimersByTimeAsync(10_000);

    const result = await promise;
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it("throws CashfreeApiError on 4xx without retrying", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ message: "Invalid order" }, { status: 400 }),
    );

    const client = new CashfreeClient();

    await expect(
      client.request({ method: "POST", path: "/pg/orders", body: {} }),
    ).rejects.toMatchObject({
      name: "CashfreeApiError",
      statusCode: 400,
      response: { message: "Invalid order" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws CashfreeApiError after exhausting retries on persistent 5xx", async () => {
    vi.useFakeTimers();
    // Each call must produce a fresh Response — the body stream can only be
    // consumed once. Use mockImplementation so each retry gets a new instance.
    fetchMock.mockImplementation(async () =>
      jsonResponse({ err: "boom" }, { status: 500 }),
    );

    const client = new CashfreeClient();
    const promise = client.request({ method: "GET", path: "/x" });
    // Attach rejection handler eagerly so unhandled-rejection warnings don't
    // trip the test runner while we advance timers.
    const assertion = expect(promise).rejects.toBeInstanceOf(CashfreeApiError);
    await vi.advanceTimersByTimeAsync(20_000);
    await assertion;

    // 1 initial + 3 retries = 4 total
    expect(fetchMock).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
  });

  it("omits body on GET requests", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    const client = new CashfreeClient();

    await client.request({ method: "GET", path: "/pg/orders/xyz" });

    const [, init] = fetchMock.mock.calls[0] as FetchArgs;
    expect(init?.body).toBeUndefined();
  });

  describe("verifyWebhookSignature", () => {
    it("returns true when signature matches", () => {
      const client = new CashfreeClient();
      const timestamp = "1700000000";
      const rawBody = '{"type":"PAYMENT_SUCCESS_WEBHOOK"}';
      const valid = createHmac("sha256", "webhook-secret-789")
        .update(timestamp + rawBody)
        .digest("base64");

      expect(
        client.verifyWebhookSignature(rawBody, timestamp, valid),
      ).toBe(true);
    });

    it("returns false when signature does not match", () => {
      const client = new CashfreeClient();
      expect(
        client.verifyWebhookSignature("body", "123", "definitely-wrong"),
      ).toBe(false);
    });
  });
});
