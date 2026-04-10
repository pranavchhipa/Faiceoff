import { createHmac } from 'node:crypto';

function getEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Verify Razorpay webhook signature using HMAC SHA-256.
 * Returns true if the signature is valid, false otherwise.
 */
export function verifyWebhookSignature(
  body: string,
  signature: string,
): boolean {
  const secret = getEnvVar('RAZORPAY_WEBHOOK_SECRET');
  const expectedSignature = createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  return expectedSignature === signature;
}
