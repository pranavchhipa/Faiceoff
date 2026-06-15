// ─────────────────────────────────────────────────────────────────────────────
// Instagram Deauthorize callback
//
// Configured in Meta App Dashboard → Instagram → Business login settings →
// "Deauthorize callback URL". Meta POSTs a form-encoded `signed_request` when a
// user removes Faiceoff from their Instagram account. We verify it and stop
// referencing their token (keeps a manually-entered handle, like /disconnect).
//
// Meta only needs a 200 here — no response body is inspected.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import {
  parseSignedRequest,
  clearInstagramByUserId,
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
    // Fall through to query-string fallback.
  }
  if (!signedRequest) {
    signedRequest = request.nextUrl.searchParams.get("signed_request");
  }

  const payload = parseSignedRequest(signedRequest);
  if (!payload) {
    return NextResponse.json({ error: "invalid_signed_request" }, { status: 400 });
  }

  try {
    const cleared = await clearInstagramByUserId(payload.user_id, "revoke");
    console.log(
      `[ig/deauthorize] ig_user=${redactUserId(payload.user_id)} rows_cleared=${cleared}`,
    );
  } catch (err) {
    console.error("[ig/deauthorize] revoke failed", err, { ig_user: redactUserId(payload.user_id) });
    return NextResponse.json({ error: "revoke_failed" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
