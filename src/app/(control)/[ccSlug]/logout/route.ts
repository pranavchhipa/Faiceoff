/**
 * POST /<slug>/logout — revoke the current Control Centre session and
 * clear the cookie. Always 302s back to /<slug>/login.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME, readSessionToken, revokeSession } from "@/lib/cc/session";
import { logAuditFromRequest } from "@/lib/cc/audit";
import { verifySlug } from "@/lib/cc/guard";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ ccSlug: string }> },
) {
  const { ccSlug } = await params;
  if (!verifySlug(ccSlug)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const token = await readSessionToken();
  if (token) {
    await revokeSession(token);
    await logAuditFromRequest(req, token, { action: "auth.logout" });
  }
  const c = await cookies();
  c.delete(COOKIE_NAME);
  return NextResponse.redirect(new URL(`/${ccSlug}/login`, req.url), 302);
}
