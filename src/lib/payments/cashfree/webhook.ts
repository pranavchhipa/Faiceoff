/**
 * Cashfree webhook parsing + signature verification.
 *
 * Caller is expected to pass the raw request body string (NOT a parsed JSON
 * object) along with the two Cashfree headers:
 *   - `x-webhook-timestamp`
 *   - `x-webhook-signature`
 *
 * Signature is HMAC-SHA256(timestamp + rawBody) using `CASHFREE_WEBHOOK_SECRET`,
 * base64-encoded. If the signature does not match we throw immediately —
 * never parse or act on an untrusted payload.
 */

import { CashfreeClient } from "./client";
import type {
  CashfreeWebhookEvent,
  CashfreeWebhookType,
} from "./types";

export type { CashfreeWebhookEvent, CashfreeWebhookType } from "./types";

export class CashfreeWebhookSignatureError extends Error {
  constructor() {
    super("Cashfree webhook signature verification failed");
    this.name = "CashfreeWebhookSignatureError";
  }
}

export interface CashfreeWebhookHeaders {
  timestamp: string;
  signature: string;
}

/**
 * Verify signature, then JSON-parse the payload.
 *
 * We intentionally don't deep-validate the payload shape — downstream handlers
 * narrow by `event.type` and destructure only the fields they need. Cashfree's
 * `data` envelope varies by event type and still evolves.
 */
export function parseWebhook(
  rawBody: string,
  headers: CashfreeWebhookHeaders,
): CashfreeWebhookEvent {
  const client = new CashfreeClient();
  if (
    !client.verifyWebhookSignature(rawBody, headers.timestamp, headers.signature)
  ) {
    throw new CashfreeWebhookSignatureError();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new Error("Cashfree webhook body is not valid JSON");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Cashfree webhook body is not valid JSON");
  }

  const envelope = parsed as Record<string, unknown>;
  const type = envelope.type as CashfreeWebhookType | undefined;
  const event_time = envelope.event_time as string | undefined;
  const data = envelope.data as Record<string, unknown> | undefined;

  if (!type || !event_time || !data) {
    throw new Error(
      "Cashfree webhook envelope missing type/event_time/data fields",
    );
  }

  return { type, event_time, data };
}
