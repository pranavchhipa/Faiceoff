/**
 * Transactional email helpers via Resend.
 *
 * All templates are intentionally minimal — plain HTML, no images, single
 * primary CTA. They mirror the platform's tone: factual, India-first,
 * no marketing fluff. Render-time data interpolated server-side; no
 * tracking pixels.
 *
 * Each function is fire-and-forget — never throws, never blocks the
 * request path. Failures are logged + Sentry'd. If RESEND_API_KEY isn't
 * set we silently no-op (dev environments).
 */

import { Resend } from "resend";
import * as Sentry from "@sentry/nextjs";

const FROM_ADDRESS =
  process.env.EMAIL_FROM ?? "Faiceoff <notifications@faiceoff.com>";
const APP_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://faiceoff.com";

let _client: Resend | null = null;
function getClient(): Resend | null {
  if (_client !== null) return _client;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  _client = new Resend(key);
  return _client;
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout
// ─────────────────────────────────────────────────────────────────────────────

function wrap(title: string, body: string, cta?: { label: string; href: string }): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f6f6f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1513;">
  <div style="max-width:560px;margin:32px auto;background:#fdfbf7;border:1px solid #e8e3d8;border-radius:12px;overflow:hidden;">
    <div style="padding:24px 32px;border-bottom:1px solid #e8e3d8;">
      <span style="font-weight:800;font-size:18px;letter-spacing:-0.01em;">Faiceoff</span><span style="color:#c9a96e;">.</span>
    </div>
    <div style="padding:32px;line-height:1.6;font-size:15px;">
      ${body}
      ${cta ? `<p style="margin:32px 0 0;"><a href="${cta.href}" style="display:inline-block;padding:12px 24px;background:#c9a96e;color:#1a1513;text-decoration:none;font-weight:700;border-radius:8px;">${cta.label}</a></p>` : ""}
    </div>
    <div style="padding:16px 32px;border-top:1px solid #e8e3d8;font-size:12px;color:#7a7065;">
      Faiceoff · India's AI face licensing marketplace · Made in India
    </div>
  </div>
</body></html>`;
}

async function send(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  try {
    const client = getClient();
    if (!client) return;
    await client.emails.send({
      from: FROM_ADDRESS,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
  } catch (err) {
    console.error("[email] send failed", err);
    Sentry.captureException(err, {
      tags: { module: "email", subject: opts.subject },
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Templates
// ─────────────────────────────────────────────────────────────────────────────

/** Creator gets a new image to approve. */
export async function sendCreatorApprovalRequest(opts: {
  to: string;
  creatorName: string;
  brandName: string;
  productName: string;
  generationId: string;
  expiresInHours?: number;
}): Promise<void> {
  const hours = opts.expiresInHours ?? 48;
  await send({
    to: opts.to,
    subject: `${opts.brandName} sent you an image to approve`,
    html: wrap(
      "New approval request",
      `<p style="font-size:18px;font-weight:700;margin:0 0 8px;">Hey ${opts.creatorName},</p>
       <p>${opts.brandName} just generated a campaign image of you holding ${opts.productName}.</p>
       <p>Open the approval queue to review and decide. You have <b>${hours}h</b>; after that it auto-approves.</p>`,
      { label: "Review the image", href: `${APP_URL}/creator/approvals` },
    ),
  });
}

/** Brand: image was approved by creator → vault. */
export async function sendBrandApproved(opts: {
  to: string;
  brandName: string;
  creatorName: string;
  productName: string;
  generationId: string;
}): Promise<void> {
  await send({
    to: opts.to,
    subject: `${opts.creatorName} approved your image`,
    html: wrap(
      "Image approved",
      `<p style="font-size:18px;font-weight:700;margin:0 0 8px;">Approved.</p>
       <p>${opts.creatorName} approved your campaign image for ${opts.productName}. The image is in your vault, ready to use across your channels.</p>
       <p>License + GST invoice are auto-generated and attached to the image.</p>`,
      { label: "Open the vault", href: `${APP_URL}/brand/vault` },
    ),
  });
}

/** Brand: image was rejected by creator → wallet refunded. */
export async function sendBrandRejected(opts: {
  to: string;
  brandName: string;
  creatorName: string;
  productName: string;
  feedback?: string | null;
  refundPaise: number;
}): Promise<void> {
  const refundRupees = Math.round(opts.refundPaise / 100);
  await send({
    to: opts.to,
    subject: `${opts.creatorName} declined your image — refund issued`,
    html: wrap(
      "Image declined",
      `<p style="font-size:18px;font-weight:700;margin:0 0 8px;">Declined.</p>
       <p>${opts.creatorName} declined the image for ${opts.productName}. <b>₹${refundRupees}</b> has been returned to your wallet.</p>
       ${opts.feedback ? `<p><b>Their note:</b> ${opts.feedback}</p>` : ""}
       <p>Tweak the brief and try again — credit on your wallet is unchanged.</p>`,
      { label: "Generate again", href: `${APP_URL}/brand/discover` },
    ),
  });
}

/** Creator: payout sent to bank. */
export async function sendCreatorPayoutSent(opts: {
  to: string;
  creatorName: string;
  amountPaise: number;
  utr?: string | null;
}): Promise<void> {
  const rupees = Math.round(opts.amountPaise / 100);
  await send({
    to: opts.to,
    subject: `₹${rupees} paid out to your bank`,
    html: wrap(
      "Payout sent",
      `<p style="font-size:18px;font-weight:700;margin:0 0 8px;">Paid: ₹${rupees}</p>
       <p>Your withdrawal of <b>₹${rupees}</b> has been sent to your linked bank account.</p>
       ${opts.utr ? `<p style="font-family:monospace;font-size:13px;color:#7a7065;">UTR: ${opts.utr}</p>` : ""}
       <p>It usually clears in seconds for IMPS/UPI. NEFT/RTGS take 1-2 business days.</p>`,
      { label: "View earnings", href: `${APP_URL}/creator/earnings` },
    ),
  });
}

/** Brand: low credits warning. */
export async function sendBrandLowCredits(opts: {
  to: string;
  brandName: string;
  creditsRemaining: number;
}): Promise<void> {
  await send({
    to: opts.to,
    subject: `Only ${opts.creditsRemaining} generations left`,
    html: wrap(
      "Low credits",
      `<p style="font-size:18px;font-weight:700;margin:0 0 8px;">Running low.</p>
       <p>You have <b>${opts.creditsRemaining} generation credits</b> remaining. Top up to keep your campaigns flowing.</p>`,
      { label: "Top up credits", href: `${APP_URL}/brand/credits` },
    ),
  });
}
