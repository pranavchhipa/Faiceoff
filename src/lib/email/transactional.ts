/**
 * Transactional email helpers via Resend.
 *
 * One canonical layout (`wrap`) used by every template — branded header
 * with the Faiceoff logo, body slot, primary CTA, optional info-table,
 * footer with help link.
 *
 * Each function is fire-and-forget — never throws, never blocks the
 * request path. Failures are logged + Sentry'd. If RESEND_API_KEY isn't
 * set we silently no-op (dev environments).
 */

import { Resend } from "resend";
import * as Sentry from "@sentry/nextjs";
import fs from "node:fs";
import path from "node:path";

const FROM_ADDRESS =
  process.env.EMAIL_FROM ?? "Faiceoff <notifications@faiceoff.com>";
const APP_URL =
  process.env.NEXT_PUBLIC_BASE_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "https://faiceoff.com";
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL ?? "support@faiceoff.com";

let _client: Resend | null = null;
function getClient(): Resend | null {
  if (_client !== null) return _client;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  _client = new Resend(key);
  return _client;
}

/**
 * Logo as a CID-embeddable attachment. Read once at module init so we
 * don't hit disk on every send. If the file isn't readable, fall back
 * silently — the wrap() template's wordmark still shows the brand even
 * without the mark.
 *
 * CID embed (vs an http img src) works in EVERY mail client, even with
 * external images blocked by default (Gmail / Outlook for first-time
 * senders). Same trick Stripe / Razorpay / Notion use.
 */
const LOGO_CID = "faiceoff-logo";
let _logoAttachment: { filename: string; content: string; contentId: string } | null = null;
try {
  const logoPath = path.join(process.cwd(), "public", "logo-mark.png");
  const buf = fs.readFileSync(logoPath);
  _logoAttachment = {
    filename: "logo-mark.png",
    content: buf.toString("base64"),
    contentId: LOGO_CID,
  };
} catch (err) {
  console.warn("[email] could not read logo-mark.png; falling back to wordmark only", err);
}

// ─────────────────────────────────────────────────────────────────────────────
// Branded layout
// ─────────────────────────────────────────────────────────────────────────────

const COLORS = {
  paper: "#fdfbf7",
  card: "#ffffff",
  ink: "#1a1513",
  inkSoft: "#3a322c",
  muted: "#7a7065",
  gold: "#c9a96e",
  goldSoft: "#e5d9c2",
  goldDeep: "#a3854f",
  border: "#e8e3d8",
  ok: "#0f7e60",
  warn: "#a06c1d",
  bad: "#b03020",
  wash: "#f6f2ea",
} as const;

interface InfoRow {
  label: string;
  value: string;
}

interface WrapOpts {
  preheader?: string;
  eyebrow?: string;
  headline: string;
  body: string;
  cta?: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
  info?: InfoRow[];
  footnote?: string;
  signOff?: string; // override "— The Faiceoff team"
}

function wrap(title: string, opts: WrapOpts): string {
  const {
    preheader,
    eyebrow,
    headline,
    body,
    cta,
    secondaryCta,
    info,
    footnote,
    signOff = "— The Faiceoff team",
  } = opts;

  const infoTable =
    info && info.length > 0
      ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0 4px;background:${COLORS.wash};border:1px solid ${COLORS.border};border-radius:10px;border-collapse:separate;">
          <tbody>
            ${info
              .map(
                (r, i) => `<tr>
                  <td style="padding:12px 16px;${i === 0 ? "" : `border-top:1px solid ${COLORS.border};`}font-size:11px;color:${COLORS.muted};font-family:'SF Mono','Monaco','Menlo',monospace;text-transform:uppercase;letter-spacing:0.08em;width:42%;">${escapeHtml(r.label)}</td>
                  <td style="padding:12px 16px;${i === 0 ? "" : `border-top:1px solid ${COLORS.border};`}font-size:14px;color:${COLORS.ink};font-weight:600;text-align:right;">${escapeHtml(r.value)}</td>
                </tr>`,
              )
              .join("")}
          </tbody>
        </table>`
      : "";

  const ctaBlock = cta
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0 0;">
        <tr>
          <td style="border-radius:10px;background:${COLORS.gold};">
            <a href="${cta.href}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:${COLORS.ink};text-decoration:none;border-radius:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${escapeHtml(cta.label)} →</a>
          </td>
        </tr>
      </table>`
    : "";

  const secondaryBlock = secondaryCta
    ? `<p style="margin:14px 0 0;font-size:13px;"><a href="${secondaryCta.href}" style="color:${COLORS.goldDeep};text-decoration:none;border-bottom:1px solid ${COLORS.goldSoft};">${escapeHtml(secondaryCta.label)}</a></p>`
    : "";

  const footnoteBlock = footnote
    ? `<p style="margin:18px 0 0;font-size:12px;color:${COLORS.muted};line-height:1.6;">${footnote}</p>`
    : "";

  const eyebrowBlock = eyebrow
    ? `<p style="margin:0 0 6px;font-size:11px;color:${COLORS.goldDeep};font-family:'SF Mono','Monaco','Menlo',monospace;text-transform:uppercase;letter-spacing:0.18em;font-weight:700;">${escapeHtml(eyebrow)}</p>`
    : "";

  const preheaderBlock = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${COLORS.paper};">${escapeHtml(preheader)}</div>`
    : "";

  // Faiceoff logo: CID inline embed (cid:faiceoff-logo). Resolves out of
  // the attachment we ship with every send — works in every mail client
  // even when external images are blocked. If the attachment didn't load
  // at module init we still render the <img> tag so the alt text + the
  // wordmark next to it keep the header legible.
  const logoSrc = `cid:${LOGO_CID}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.wash};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${COLORS.ink};-webkit-font-smoothing:antialiased;">
  ${preheaderBlock}
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${COLORS.wash};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;width:100%;background:${COLORS.paper};border:1px solid ${COLORS.border};border-radius:14px;overflow:hidden;">
          <!-- HEADER -->
          <tr>
            <td style="padding:20px 28px;border-bottom:1px solid ${COLORS.border};background:linear-gradient(180deg,${COLORS.paper} 0%,${COLORS.wash} 100%);">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="vertical-align:middle;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="vertical-align:middle;padding-right:10px;">
                          <img src="${logoSrc}" width="32" height="32" alt="Faiceoff" style="display:block;border:0;width:32px;height:32px;border-radius:7px;">
                        </td>
                        <td style="vertical-align:middle;">
                          <span style="font-size:17px;font-weight:800;letter-spacing:-0.01em;color:${COLORS.ink};">Faiceoff</span><span style="color:${COLORS.gold};font-weight:800;">.</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td align="right" style="vertical-align:middle;font-size:10.5px;color:${COLORS.muted};font-family:'SF Mono','Monaco','Menlo',monospace;text-transform:uppercase;letter-spacing:0.16em;">
                    AI likeness licensing
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="padding:32px 28px 24px;">
              ${eyebrowBlock}
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:800;letter-spacing:-0.01em;color:${COLORS.ink};line-height:1.25;">${escapeHtml(headline)}</h1>
              <div style="font-size:15px;line-height:1.65;color:${COLORS.inkSoft};">${body}</div>
              ${infoTable}
              ${ctaBlock}
              ${secondaryBlock}
              ${footnoteBlock}
              <p style="margin:32px 0 0;font-size:14px;color:${COLORS.muted};">${escapeHtml(signOff)}</p>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="padding:20px 28px;border-top:1px solid ${COLORS.border};background:${COLORS.wash};">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="font-size:11.5px;color:${COLORS.muted};line-height:1.6;">
                    <strong style="color:${COLORS.inkSoft};">Faiceoff Platform Pvt. Ltd.</strong><br>
                    India's AI face licensing marketplace · Made in India<br>
                    <a href="mailto:${SUPPORT_EMAIL}" style="color:${COLORS.goldDeep};text-decoration:none;">${SUPPORT_EMAIL}</a>
                    &nbsp;·&nbsp;
                    <a href="${APP_URL}" style="color:${COLORS.goldDeep};text-decoration:none;">${APP_URL.replace(/^https?:\/\//, "")}</a>
                  </td>
                  <td align="right" style="font-size:10.5px;color:${COLORS.muted};font-family:'SF Mono','Monaco','Menlo',monospace;text-transform:uppercase;letter-spacing:0.14em;">
                    DPDP · GST · IT Act
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding-top:12px;font-size:10.5px;color:${COLORS.muted};line-height:1.6;">
                    You're receiving this because you have an active Faiceoff account. Need help? Reply to this email — a real person reads it.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtINR(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

async function send(opts: { to: string; subject: string; html: string }): Promise<void> {
  try {
    const client = getClient();
    if (!client) return;
    await client.emails.send({
      from: FROM_ADDRESS,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      // Inline logo: Resend sets disposition=inline automatically when
      // `contentId` is present. cid:faiceoff-logo in the HTML resolves
      // to this attachment. If we couldn't read the file at boot, ship
      // without it — wordmark next to the (broken) image still shows.
      ...(_logoAttachment
        ? {
            attachments: [
              {
                filename: _logoAttachment.filename,
                content: _logoAttachment.content,
                contentId: _logoAttachment.contentId,
              },
            ],
          }
        : {}),
    });
  } catch (err) {
    console.error("[email] send failed", err);
    Sentry.captureException(err, {
      tags: { module: "email", subject: opts.subject },
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Welcome — creator
// ─────────────────────────────────────────────────────────────────────────────
export async function sendCreatorWelcome(opts: {
  to: string;
  creatorName: string;
}): Promise<void> {
  await send({
    to: opts.to,
    subject: `Welcome to Faiceoff, ${opts.creatorName.split(" ")[0]}`,
    html: wrap("Welcome to Faiceoff", {
      preheader: "Your face. Your rules. Earn in INR for every approved image.",
      eyebrow: "Account live",
      headline: `Welcome to Faiceoff, ${opts.creatorName.split(" ")[0]}.`,
      body: `<p style="margin:0 0 12px;">You just joined India's first AI likeness licensing marketplace. Here's how it works:</p>
        <ol style="margin:0 0 4px;padding-left:20px;color:${COLORS.inkSoft};">
          <li style="margin-bottom:8px;"><strong>Upload reference photos</strong> — 30+ varied shots make your face model live for brands.</li>
          <li style="margin-bottom:8px;"><strong>Set your packages</strong> — Frame / Feature / Cover, each at your price.</li>
          <li style="margin-bottom:8px;"><strong>Approve every image</strong> — brands generate, you decide what ships. Nothing goes live without your nod.</li>
          <li><strong>Get paid in INR</strong> — direct bank transfer, GST + TDS handled.</li>
        </ol>`,
      cta: { label: "Finish onboarding", href: `${APP_URL}/creator/likeness` },
      footnote: "Every generation runs through your blocked-categories list and your face stays in your control. DPDP-compliant from day one.",
    }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Welcome — brand
// ─────────────────────────────────────────────────────────────────────────────
export async function sendBrandWelcome(opts: {
  to: string;
  brandName: string;
}): Promise<void> {
  await send({
    to: opts.to,
    subject: `Welcome to Faiceoff, ${opts.brandName}`,
    html: wrap("Welcome to Faiceoff", {
      preheader: "Generate AI campaign images with licensed creator likenesses — fast, legal, India-priced.",
      eyebrow: "Account live",
      headline: `Welcome aboard, ${opts.brandName}.`,
      body: `<p style="margin:0 0 12px;">You can now book real Indian creators and generate AI campaign images using their licensed likeness. The flow:</p>
        <ol style="margin:0 0 4px;padding-left:20px;color:${COLORS.inkSoft};">
          <li style="margin-bottom:8px;"><strong>Discover creators</strong> by niche, audience, vibe.</li>
          <li style="margin-bottom:8px;"><strong>Send a collab request</strong> — pick a Frame / Feature / Cover package.</li>
          <li style="margin-bottom:8px;"><strong>Pay after acceptance</strong> — funds held in escrow until you approve outputs.</li>
          <li><strong>Generate in Studio</strong> — Gemini 3 Pro renders your brief on the creator's face. Every image gets a signed license PDF.</li>
        </ol>`,
      cta: { label: "Discover creators", href: `${APP_URL}/brand/discover` },
      secondaryCta: { label: "Or top up wallet first →", href: `${APP_URL}/brand/wallet` },
      footnote: "GST-invoiced. India-payable in INR via Razorpay. Full DPDP & IT Act compliance baked in.",
    }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Creator — new approval request
// ─────────────────────────────────────────────────────────────────────────────
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
    html: wrap("New approval request", {
      preheader: `${opts.brandName} just generated a campaign image. Review within ${hours}h.`,
      eyebrow: "Action needed",
      headline: `Hey ${opts.creatorName.split(" ")[0]}, you have an image to review.`,
      body: `<p style="margin:0 0 12px;"><strong>${escapeHtml(opts.brandName)}</strong> generated a campaign image of you with <strong>${escapeHtml(opts.productName)}</strong>.</p>
        <p style="margin:0;">Open the approval queue to review and decide. After ${hours} hours of silence the image auto-approves — so check soon.</p>`,
      info: [
        { label: "Brand", value: opts.brandName },
        { label: "Product", value: opts.productName },
        { label: "Decision window", value: `${hours} hours` },
      ],
      cta: { label: "Review image", href: `${APP_URL}/creator/approvals` },
      footnote: "Approve / reject is final. Rejecting refunds the brand and burns a credit on their side — use it when something is genuinely off.",
    }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Brand — image approved
// ─────────────────────────────────────────────────────────────────────────────
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
    html: wrap("Image approved", {
      preheader: `${opts.creatorName} approved your ${opts.productName} image. Licensed and in your library.`,
      eyebrow: "Approved",
      headline: `${opts.creatorName} approved your image.`,
      body: `<p style="margin:0 0 12px;">Your campaign image for <strong>${escapeHtml(opts.productName)}</strong> just cleared creator review. It's licensed and in your Library, ready to deploy across paid + organic channels.</p>
        <p style="margin:0;">A signed licence certificate has been issued and a GST invoice will follow within an hour.</p>`,
      cta: { label: "Open Library", href: `${APP_URL}/brand/vault` },
      secondaryCta: { label: "Download licence pack →", href: `${APP_URL}/brand/vault` },
    }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Brand — image rejected
// ─────────────────────────────────────────────────────────────────────────────
export async function sendBrandRejected(opts: {
  to: string;
  brandName: string;
  creatorName: string;
  productName: string;
  feedback?: string | null;
  refundPaise: number;
}): Promise<void> {
  await send({
    to: opts.to,
    subject: `${opts.creatorName} declined your image — refund issued`,
    html: wrap("Image declined", {
      preheader: `${fmtINR(opts.refundPaise)} returned to your wallet. ${opts.feedback ? "See note inside." : "Try again with a tweaked brief."}`,
      eyebrow: "Refunded",
      headline: `${opts.creatorName} declined this image.`,
      body: `<p style="margin:0 0 12px;"><strong>${escapeHtml(opts.creatorName)}</strong> wasn't comfortable with the generated image for <strong>${escapeHtml(opts.productName)}</strong>. <strong>${fmtINR(opts.refundPaise)}</strong> has been returned to your wallet.</p>
        ${opts.feedback ? `<p style="margin:0 0 12px;padding:12px 14px;border-left:3px solid ${COLORS.gold};background:${COLORS.wash};border-radius:0 6px 6px 0;font-style:italic;">"${escapeHtml(opts.feedback)}"</p>` : ""}
        <p style="margin:0;">Tweak the brief and try again — your wallet credit is unchanged.</p>`,
      cta: { label: "Generate again", href: `${APP_URL}/brand/discover` },
    }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Creator — collab request received
// ─────────────────────────────────────────────────────────────────────────────
export async function sendCreatorCollabRequest(opts: {
  to: string;
  creatorName: string;
  brandName: string;
  productName: string;
  packageTier: string;
  pricePaise: number;
  requestId: string;
}): Promise<void> {
  const tierLabel = opts.packageTier.charAt(0).toUpperCase() + opts.packageTier.slice(1);
  await send({
    to: opts.to,
    subject: `${opts.brandName} wants to collab — ${fmtINR(opts.pricePaise)}`,
    html: wrap("New collab request", {
      preheader: `${opts.brandName} · ${tierLabel} · ${fmtINR(opts.pricePaise)} · 72h to decide`,
      eyebrow: "New request",
      headline: `New collab from ${opts.brandName}.`,
      body: `<p style="margin:0 0 12px;"><strong>${escapeHtml(opts.brandName)}</strong> wants to use your likeness in a campaign for <strong>${escapeHtml(opts.productName)}</strong>.</p>
        <p style="margin:0;">Review the brief and decide whether to accept. Request expires in <strong>72 hours</strong>.</p>`,
      info: [
        { label: "Brand", value: opts.brandName },
        { label: "Product", value: opts.productName },
        { label: "Package", value: tierLabel },
        { label: "Price", value: fmtINR(opts.pricePaise) },
        { label: "Your share (70%)", value: fmtINR(Math.round(opts.pricePaise * 0.7)) },
      ],
      cta: { label: "Review request", href: `${APP_URL}/creator/requests` },
    }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Brand — request accepted
// ─────────────────────────────────────────────────────────────────────────────
export async function sendBrandRequestAccepted(opts: {
  to: string;
  brandName: string;
  creatorName: string;
  productName: string;
  pricePaise: number;
  requestId: string;
}): Promise<void> {
  await send({
    to: opts.to,
    subject: `${opts.creatorName} accepted — pay to start`,
    html: wrap("Request accepted", {
      preheader: `Complete payment of ${fmtINR(opts.pricePaise)} to unlock the AI Studio.`,
      eyebrow: "You're in",
      headline: `${opts.creatorName} accepted your collab.`,
      body: `<p style="margin:0 0 12px;">Great news — <strong>${escapeHtml(opts.creatorName)}</strong> is on board for your <strong>${escapeHtml(opts.productName)}</strong> campaign.</p>
        <p style="margin:0;">Complete payment of <strong>${fmtINR(opts.pricePaise)}</strong> to unlock the AI Studio and start generating images. Funds stay in escrow until each image is approved.</p>`,
      info: [
        { label: "Creator", value: opts.creatorName },
        { label: "Product", value: opts.productName },
        { label: "Amount due", value: fmtINR(opts.pricePaise) },
      ],
      cta: { label: "Pay & open Studio", href: `${APP_URL}/brand/collabs/${opts.requestId}/payment` },
      footnote: "Razorpay-backed. UPI / cards / netbanking accepted. GST invoice auto-generated on settlement.",
    }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Brand — request declined
// ─────────────────────────────────────────────────────────────────────────────
export async function sendBrandRequestDeclined(opts: {
  to: string;
  brandName: string;
  creatorName: string;
  productName: string;
  reason?: string | null;
}): Promise<void> {
  await send({
    to: opts.to,
    subject: `${opts.creatorName} declined your collab request`,
    html: wrap("Request declined", {
      preheader: "No payment was processed. Plenty of other creators are ready to work with you.",
      eyebrow: "Declined",
      headline: `${opts.creatorName} can't take this one.`,
      body: `<p style="margin:0 0 12px;"><strong>${escapeHtml(opts.creatorName)}</strong> declined the request for <strong>${escapeHtml(opts.productName)}</strong>. No payment was processed.</p>
        ${opts.reason ? `<p style="margin:0 0 12px;padding:12px 14px;border-left:3px solid ${COLORS.gold};background:${COLORS.wash};border-radius:0 6px 6px 0;font-style:italic;">"${escapeHtml(opts.reason)}"</p>` : ""}
        <p style="margin:0;">There are plenty of other creators with the right vibe.</p>`,
      cta: { label: "Discover creators", href: `${APP_URL}/brand/discover` },
    }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Creator — payment received, studio live
// ─────────────────────────────────────────────────────────────────────────────
export async function sendCreatorPaymentReceived(opts: {
  to: string;
  creatorName: string;
  brandName: string;
  productName: string;
  pricePaise: number;
  collabSessionId: string;
}): Promise<void> {
  await send({
    to: opts.to,
    subject: `${opts.brandName} paid — Studio is live`,
    html: wrap("Payment received", {
      preheader: "Your earnings are held in escrow and released as you approve each image.",
      eyebrow: "Funds in escrow",
      headline: `Studio unlocked.`,
      body: `<p style="margin:0 0 12px;"><strong>${escapeHtml(opts.brandName)}</strong> just completed payment of <strong>${fmtINR(opts.pricePaise)}</strong> for the <strong>${escapeHtml(opts.productName)}</strong> collab.</p>
        <p style="margin:0;">The AI Studio is now active for them. Once images are generated and sent for your review, they'll land in your approval queue — you'll get a fresh notification each time.</p>`,
      info: [
        { label: "Brand", value: opts.brandName },
        { label: "Project", value: opts.productName },
        { label: "Total funded", value: fmtINR(opts.pricePaise) },
        { label: "Your share (70%)", value: fmtINR(Math.round(opts.pricePaise * 0.7)) },
      ],
      cta: { label: "Open inbox", href: `${APP_URL}/creator/collabs` },
      footnote: "Earnings move from escrow → available 7 days after approval. Withdraw any time after that to your linked bank.",
    }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. Brand — top-up receipt (Razorpay webhook → success)
// ─────────────────────────────────────────────────────────────────────────────
export async function sendBrandTopupReceipt(opts: {
  to: string;
  brandName: string;
  amountPaise: number;
  creditsAdded: number;
  paymentRef?: string | null;
}): Promise<void> {
  // GST 18% reverse-calc for display (amount is already inclusive).
  const gstPaise = Math.round(opts.amountPaise * (18 / 118));
  const basePaise = opts.amountPaise - gstPaise;
  await send({
    to: opts.to,
    subject: `Receipt — ${fmtINR(opts.amountPaise)} top-up`,
    html: wrap("Wallet top-up receipt", {
      preheader: `${opts.creditsAdded} credits added. Tax invoice attached.`,
      eyebrow: "Payment success",
      headline: `Top-up confirmed.`,
      body: `<p style="margin:0;">We've received your wallet top-up of <strong>${fmtINR(opts.amountPaise)}</strong>. Credits have been added and you're ready to keep generating.</p>`,
      info: [
        { label: "Amount paid", value: fmtINR(opts.amountPaise) },
        { label: "Base", value: fmtINR(basePaise) },
        { label: "GST (18%)", value: fmtINR(gstPaise) },
        { label: "Credits added", value: String(opts.creditsAdded) },
        ...(opts.paymentRef ? [{ label: "Payment ref", value: opts.paymentRef }] : []),
      ],
      cta: { label: "Open wallet", href: `${APP_URL}/brand/wallet` },
      footnote: "A full GST tax invoice (Form 6) will arrive in a separate email shortly. Keep both for accounting.",
    }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. Creator — withdrawal request received
// ─────────────────────────────────────────────────────────────────────────────
export async function sendCreatorWithdrawalRequested(opts: {
  to: string;
  creatorName: string;
  amountPaise: number;
  netPaise: number;
  bankLast4?: string | null;
  payoutId: string;
}): Promise<void> {
  await send({
    to: opts.to,
    subject: `Withdrawal request received — ${fmtINR(opts.amountPaise)}`,
    html: wrap("Withdrawal queued", {
      preheader: `Net to bank: ${fmtINR(opts.netPaise)}. We'll notify when transfer completes.`,
      eyebrow: "Queued",
      headline: `Withdrawal request received.`,
      body: `<p style="margin:0;">Your withdrawal of <strong>${fmtINR(opts.amountPaise)}</strong> is queued. We'll initiate the bank transfer within one business day; you'll get a confirmation with a UTR once funds leave our account.</p>`,
      info: [
        { label: "Gross amount", value: fmtINR(opts.amountPaise) },
        { label: "TDS (1%)", value: fmtINR(opts.amountPaise - opts.netPaise) },
        { label: "Net to bank", value: fmtINR(opts.netPaise) },
        ...(opts.bankLast4 ? [{ label: "Bank a/c", value: `••• ${opts.bankLast4}` }] : []),
        { label: "Reference", value: opts.payoutId.slice(0, 8) + "…" },
      ],
      cta: { label: "Track in earnings", href: `${APP_URL}/creator/earnings` },
      footnote: "TDS is deducted at 1% per Section 194-O of the Income Tax Act. Form 16A available quarterly.",
    }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. Creator — payout sent (UTR)
// ─────────────────────────────────────────────────────────────────────────────
export async function sendCreatorPayoutSent(opts: {
  to: string;
  creatorName: string;
  amountPaise: number;
  utr?: string | null;
}): Promise<void> {
  await send({
    to: opts.to,
    subject: `${fmtINR(opts.amountPaise)} sent to your bank`,
    html: wrap("Payout sent", {
      preheader: `Transfer initiated. IMPS clears in seconds; NEFT/RTGS within 1-2 business days.`,
      eyebrow: "Sent",
      headline: `${fmtINR(opts.amountPaise)} on its way.`,
      body: `<p style="margin:0;">Your withdrawal has left our books and is heading to your linked bank account. Expect IMPS to settle in seconds; NEFT/RTGS typically 1-2 business days.</p>`,
      info: [
        { label: "Amount", value: fmtINR(opts.amountPaise) },
        ...(opts.utr ? [{ label: "UTR", value: opts.utr }] : []),
      ],
      cta: { label: "View earnings", href: `${APP_URL}/creator/earnings` },
    }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. Both sides — collab completed
// ─────────────────────────────────────────────────────────────────────────────
export async function sendCollabCompletedCreator(opts: {
  to: string;
  creatorName: string;
  brandName: string;
  collabName: string;
  totalCreatorSharePaise: number;
  imagesApproved: number;
}): Promise<void> {
  await send({
    to: opts.to,
    subject: `Collab complete — ${opts.collabName}`,
    html: wrap("Collab wrapped", {
      preheader: `${opts.imagesApproved} images approved. Earnings unlock from holding to available over the next 7 days.`,
      eyebrow: "Wrapped",
      headline: `Nicely done — collab complete.`,
      body: `<p style="margin:0 0 12px;">All images for the <strong>${escapeHtml(opts.collabName)}</strong> collab with <strong>${escapeHtml(opts.brandName)}</strong> are approved. The brand has their licensed pack and you've earned your share.</p>
        <p style="margin:0;">Funds move from holding to available 7 days after each approval — withdraw anytime once they land.</p>`,
      info: [
        { label: "Brand", value: opts.brandName },
        { label: "Images approved", value: String(opts.imagesApproved) },
        { label: "Your earnings", value: fmtINR(opts.totalCreatorSharePaise) },
      ],
      cta: { label: "View earnings", href: `${APP_URL}/creator/earnings` },
    }),
  });
}

export async function sendCollabCompletedBrand(opts: {
  to: string;
  brandName: string;
  creatorName: string;
  collabName: string;
  imagesApproved: number;
}): Promise<void> {
  await send({
    to: opts.to,
    subject: `Collab complete — ${opts.collabName}`,
    html: wrap("Collab wrapped", {
      preheader: `${opts.imagesApproved} images licensed. Library + certificates ready.`,
      eyebrow: "Wrapped",
      headline: `Your collab with ${opts.creatorName} is complete.`,
      body: `<p style="margin:0 0 12px;">All <strong>${opts.imagesApproved} images</strong> for the <strong>${escapeHtml(opts.collabName)}</strong> collab are approved and licensed.</p>
        <p style="margin:0;">Each image carries a signed licence certificate. Download the full pack (image + cert PDF + readme) from your Library to hand off to your editor or agency.</p>`,
      info: [
        { label: "Creator", value: opts.creatorName },
        { label: "Images licensed", value: String(opts.imagesApproved) },
        { label: "Licence type", value: "Non-exclusive · 12 months · auto-renew" },
      ],
      cta: { label: "Open Library", href: `${APP_URL}/brand/vault` },
      secondaryCta: { label: "Bulk-download all assets →", href: `${APP_URL}/brand/vault` },
    }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 14. Both sides — licence issued (per image)
// ─────────────────────────────────────────────────────────────────────────────
export async function sendCreatorLicenseIssued(opts: {
  to: string;
  creatorName: string;
  brandName: string;
  productName: string;
  licenseId: string;
  certUrl?: string | null;
  creatorSharePaise: number;
}): Promise<void> {
  await send({
    to: opts.to,
    subject: `Licence issued — ${opts.productName}`,
    html: wrap("Licence issued", {
      preheader: `Your share: ${fmtINR(opts.creatorSharePaise)} (in 7-day holding).`,
      eyebrow: "Licence active",
      headline: `Licence issued for ${opts.productName}.`,
      body: `<p style="margin:0;">A signed licence certificate has been issued for the image you just approved. <strong>${escapeHtml(opts.brandName)}</strong> can now use it under the digital + print scope you agreed to.</p>`,
      info: [
        { label: "Brand", value: opts.brandName },
        { label: "Licence ID", value: opts.licenseId.slice(0, 12) + "…" },
        { label: "Your share", value: fmtINR(opts.creatorSharePaise) },
        { label: "Holding period", value: "7 days" },
      ],
      cta: { label: "View earnings", href: `${APP_URL}/creator/earnings` },
      ...(opts.certUrl ? { secondaryCta: { label: "Download certificate →", href: opts.certUrl } } : {}),
    }),
  });
}

export async function sendBrandLicenseIssued(opts: {
  to: string;
  brandName: string;
  creatorName: string;
  productName: string;
  licenseId: string;
  certUrl?: string | null;
}): Promise<void> {
  await send({
    to: opts.to,
    subject: `Licence ready — ${opts.productName}`,
    html: wrap("Licence ready", {
      preheader: "Image, certificate PDF, and readme are bundled in your Library.",
      eyebrow: "Licence active",
      headline: `Your ${opts.productName} licence is live.`,
      body: `<p style="margin:0 0 12px;"><strong>${escapeHtml(opts.creatorName)}</strong> approved your image and a signed licence certificate is now attached to it. You're cleared to deploy across digital + print channels per the agreed scope.</p>
        <p style="margin:0;">Every download from your Library packs the image, the certificate PDF, and a readme — perfect to hand to your editor or agency.</p>`,
      info: [
        { label: "Creator", value: opts.creatorName },
        { label: "Licence ID", value: opts.licenseId.slice(0, 12) + "…" },
        { label: "Term", value: "12 months · auto-renew" },
        { label: "Verify URL", value: `${APP_URL.replace(/^https?:\/\//, "")}/verify/${opts.licenseId.slice(0, 8)}` },
      ],
      cta: { label: "Open Library", href: `${APP_URL}/brand/vault` },
      ...(opts.certUrl ? { secondaryCta: { label: "Download certificate →", href: opts.certUrl } } : {}),
    }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 15. Brand — low credits warning
// ─────────────────────────────────────────────────────────────────────────────
export async function sendBrandLowCredits(opts: {
  to: string;
  brandName: string;
  creditsRemaining: number;
}): Promise<void> {
  await send({
    to: opts.to,
    subject: `Only ${opts.creditsRemaining} generations left`,
    html: wrap("Low credits", {
      preheader: "Top up to keep your campaigns flowing — popular packs ship instantly.",
      eyebrow: "Heads-up",
      headline: `You have ${opts.creditsRemaining} credits left.`,
      body: `<p style="margin:0;">Each generation costs 1 credit. Top up now so you don't get blocked mid-campaign — popular packs unlock instantly via Razorpay (UPI / cards / netbanking).</p>`,
      cta: { label: "Top up wallet", href: `${APP_URL}/brand/wallet` },
    }),
  });
}
