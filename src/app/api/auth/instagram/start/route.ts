import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { buildAuthorizeUrl } from "@/lib/instagram/oauth";

// GET /api/auth/instagram/start — kicks off the OAuth flow.
// Generates a CSRF state token, stashes it in an HTTP-only cookie, then 302s
// the user to instagram.com/oauth/authorize.
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let authorizeUrl: string;
  let state: string;
  try {
    state = randomBytes(24).toString("hex");
    authorizeUrl = buildAuthorizeUrl(state);
  } catch (err) {
    return NextResponse.json(
      {
        error: "Instagram OAuth not configured",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }

  const res = NextResponse.redirect(authorizeUrl);
  // 10-minute CSRF cookie. HttpOnly + SameSite=Lax so it survives the IG
  // redirect back to our callback. Secure in prod (HTTPS only).
  res.cookies.set("ig_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });
  return res;
}
