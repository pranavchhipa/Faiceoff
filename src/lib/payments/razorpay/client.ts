/**
 * Razorpay HTTP client.
 * Uses Basic auth (key_id:key_secret, base64).
 * Retries 5xx with exponential backoff.
 */

const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";
const MAX_RETRIES = 3;
const BACKOFF_CAP_MS = 8000;

function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, BACKOFF_CAP_MS);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export class RazorpayApiError extends Error {
  public readonly statusCode: number;
  public readonly response: unknown;
  constructor(statusCode: number, response: unknown) {
    super(`Razorpay API error ${statusCode}`);
    this.name = "RazorpayApiError";
    this.statusCode = statusCode;
    this.response = response;
  }
}

function getAuth(): string {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set");
  return "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
}

export async function razorpayRequest<T>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: Record<string, unknown>,
  retries = MAX_RETRIES,
): Promise<T> {
  let lastErr: Error = new Error("no attempts");

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(backoffMs(attempt - 1));

    const res = await fetch(`${RAZORPAY_API_BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: getAuth(),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (res.ok) return res.json() as Promise<T>;

    const payload = await res.json().catch(() => ({}));
    if (res.status < 500) throw new RazorpayApiError(res.status, payload);

    lastErr = new RazorpayApiError(res.status, payload);
  }

  throw lastErr;
}
