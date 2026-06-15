// ─────────────────────────────────────────────────────────────────────────────
// Instagram Data Deletion Request callback
//
// Configured in Meta App Dashboard → Instagram → Business login settings →
// "Data deletion request URL". Required before the app can go Live.
//
// Meta POSTs a form-encoded `signed_request`. We verify it, erase every
// IG-derived field on the matching creator(s), and return the JSON shape Meta
// mandates: { url, confirmation_code }. `url` is a page the user can open to
// confirm status; `confirmation_code` is our tracking id for the request.
//
// GET ?id=<code> renders a tiny status confirmation (what `url` points at).
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";
import {
  parseSignedRequest,
  clearInstagramByUserId,
  appBaseUrl,
  redactUserId,
} from "@/lib/instagram/data-requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let signedRequest: string | null = null;
  try {
    const form = await request.formData();
    const v = form.get("signed_request");
    signedRequest = typeof v === "string" ? v : null;
  } catch {
    // Fall through — some senders use JSON or query string.
  }
  if (!signedRequest) {
    signedRequest = request.nextUrl.searchParams.get("signed_request");
  }

  const payload = parseSignedRequest(signedRequest);
  if (!payload) {
    return NextResponse.json(
      { error: "invalid_signed_request" },
      { status: 400 },
    );
  }

  // Confirmation code Meta echoes back to the user. Random + unguessable; we
  // log it so a deletion can be traced in our logs without a dedicated table.
  const confirmationCode = `igdel_${crypto.randomBytes(12).toString("hex")}`;

  try {
    const cleared = await clearInstagramByUserId(payload.user_id, "delete");
    console.log(
      `[ig/data-deletion] code=${confirmationCode} ig_user=${redactUserId(payload.user_id)} rows_cleared=${cleared}`,
    );
  } catch (err) {
    // The deletion failed — surface a 500 so Meta retries rather than marking it
    // done. Never echo the raw error to the caller.
    console.error("[ig/data-deletion] erase failed", err, {
      code: confirmationCode,
      ig_user: redactUserId(payload.user_id),
    });
    return NextResponse.json({ error: "deletion_failed" }, { status: 500 });
  }

  return NextResponse.json({
    url: `${appBaseUrl()}/api/auth/instagram/data-deletion?id=${confirmationCode}`,
    confirmation_code: confirmationCode,
  });
}

// Status page Meta's `url` points at. We don't persist requests, so this just
// confirms the code format + that deletion is processed on receipt. Returns a
// minimal HTML page (human-readable) for any provided code.
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? "";
  const safeId = id.replace(/[^a-z0-9_]/gi, "").slice(0, 64);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Instagram data deletion · Faiceoff</title></head><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:64px auto;padding:0 20px;color:#1a1a1a;line-height:1.6"><h1 style="font-size:22px">Data deletion ${safeId ? "request received" : "status"}</h1><p>Any Instagram profile data Faiceoff pulled for this account has been deleted from our systems. The connection, access token, profile details, and engagement insights are removed on receipt of the request.</p>${safeId ? `<p style="color:#666;font-size:13px">Reference: <code>${safeId}</code></p>` : ""}<p style="color:#666;font-size:13px">Questions? Email <a href="mailto:support@faiceoff.com">support@faiceoff.com</a>.</p></body></html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
