import { createHmac, timingSafeEqual } from "node:crypto";

export class RazorpayWebhookSignatureError extends Error {
  constructor(msg = "invalid signature") {
    super(msg);
    this.name = "RazorpayWebhookSignatureError";
  }
}

/**
 * Verify Razorpay webhook signature.
 * Razorpay signs the raw body with HMAC-SHA256 using the webhook secret.
 * Header: x-razorpay-signature
 */
export function verifyRazorpayWebhook(rawBody: string, signature: string): void {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw new RazorpayWebhookSignatureError("RAZORPAY_WEBHOOK_SECRET not set");

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");

  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(signature, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new RazorpayWebhookSignatureError();
    }
  } catch (err) {
    if (err instanceof RazorpayWebhookSignatureError) throw err;
    throw new RazorpayWebhookSignatureError();
  }
}

/**
 * Verify Razorpay payment signature (from checkout handler response).
 * Used to validate payment_id + order_id before confirming a payment on the server.
 */
export function verifyRazorpayPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string,
): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  const body = `${orderId}|${paymentId}`;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(signature, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
