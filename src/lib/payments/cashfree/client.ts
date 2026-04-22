/**
 * Cashfree HTTP client.
 *
 * - Reads `CASHFREE_MODE` / `CASHFREE_APP_ID` / `CASHFREE_SECRET_KEY` on every
 *   instance construction. Instantiate lazily at callsite so env stubbing in
 *   tests works.
 * - Signs every request with `x-client-id` / `x-client-secret` /
 *   `x-api-version: 2025-01-01`.
 * - Retries 5xx responses with exponential backoff (1s → 2s → 4s, capped 8s).
 * - Surfaces 4xx responses immediately as `CashfreeApiError`.
 *
 * Do NOT hold a singleton — the client has to re-read env at call time so
 * Vercel cold starts pick up rotated secrets without redeploy.
 */

import { createHmac } from "node:crypto";

export const CASHFREE_API_VERSION = "2025-01-01";
export const CASHFREE_MAX_RETRIES = 3;
export const CASHFREE_BACKOFF_CAP_MS = 8000;

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export interface CashfreeRequest {
  method: HttpMethod;
  path: string;
  body?: Record<string, unknown>;
  /** Override retry count (tests only). Default 3. */
  retries?: number;
}

export class CashfreeApiError extends Error {
  public readonly statusCode: number;
  public readonly response: unknown;

  constructor(statusCode: number, response: unknown) {
    super(`Cashfree API error ${statusCode}`);
    this.name = "CashfreeApiError";
    this.statusCode = statusCode;
    this.response = response;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  // attempt 0 → 1s, 1 → 2s, 2 → 4s, 3 → 8s, then cap
  return Math.min(1000 * 2 ** attempt, CASHFREE_BACKOFF_CAP_MS);
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

export class CashfreeClient {
  private readonly baseUrl: string;
  private readonly appId: string;
  private readonly secretKey: string;

  constructor() {
    const mode = process.env.CASHFREE_MODE ?? "test";
    this.baseUrl =
      mode === "prod"
        ? "https://api.cashfree.com"
        : "https://sandbox.cashfree.com";
    this.appId = requireEnv("CASHFREE_APP_ID");
    this.secretKey = requireEnv("CASHFREE_SECRET_KEY");
  }

  async request<T>(opts: CashfreeRequest): Promise<T> {
    const { method, path, body, retries = CASHFREE_MAX_RETRIES } = opts;
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "x-client-id": this.appId,
      "x-client-secret": this.secretKey,
      "x-api-version": CASHFREE_API_VERSION,
      "content-type": "application/json",
    };

    let lastError: unknown = new CashfreeApiError(500, {
      message: "Cashfree request made no attempts",
    });

    for (let attempt = 0; attempt <= retries; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
      } catch (networkErr) {
        lastError = networkErr;
        if (attempt < retries) {
          await sleep(backoffMs(attempt));
          continue;
        }
        throw networkErr;
      }

      // Always drain the body; Cashfree returns JSON even on errors.
      const raw = await response.text();
      const parsed = raw.length > 0 ? safeJson(raw) : undefined;

      if (response.ok) {
        return parsed as T;
      }

      if (response.status >= 500 && attempt < retries) {
        lastError = new CashfreeApiError(response.status, parsed);
        await sleep(backoffMs(attempt));
        continue;
      }

      // 4xx → immediate throw. 5xx at retry exhaustion → throw.
      throw new CashfreeApiError(response.status, parsed);
    }

    // If we exit the loop cleanly it was because all retries exhausted without
    // returning — surface whichever error we saw last.
    throw lastError;
  }

  /**
   * Verify a Cashfree webhook signature.
   *
   * Cashfree signs `timestamp + rawBody` with HMAC-SHA256 using the webhook
   * secret and base64-encodes the digest. Caller supplies the raw headers
   * (`x-webhook-timestamp`, `x-webhook-signature`).
   */
  verifyWebhookSignature(
    rawBody: string,
    timestamp: string,
    signature: string,
  ): boolean {
    const secret = requireEnv("CASHFREE_WEBHOOK_SECRET");
    const payload = `${timestamp}${rawBody}`;
    const expected = createHmac("sha256", secret)
      .update(payload)
      .digest("base64");
    return timingSafeEqual(expected, signature);
  }
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * Constant-time-ish string compare. We avoid `crypto.timingSafeEqual` because
 * it requires equal-length buffers and throws otherwise — we want a clean
 * boolean that still avoids early termination.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
