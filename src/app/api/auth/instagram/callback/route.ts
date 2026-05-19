import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
} from "@/lib/instagram/oauth";
import { fetchProfile, fetchInsights } from "@/lib/instagram/graph";
import { encryptIgToken } from "@/lib/instagram/crypto";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

// GET /api/auth/instagram/callback — completes the OAuth flow.
// Steps:
//  1. Verify state CSRF cookie matches ?state=
//  2. Exchange ?code= for short-lived token
//  3. Exchange short-lived for long-lived (60d)
//  4. Fetch profile via Graph API
//  5. Reject if account_type === 'PERSONAL' (Meta restriction)
//  6. Save encrypted token + profile snapshot to creators row
//  7. Redirect back to onboarding (success state)
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  // Where to send the user back — onboarding flow by default, settings if
  // they're an existing creator reconnecting.
  const returnTo = url.searchParams.get("return_to") ?? "/dashboard/onboarding/instagram";

  // ── Handle user-rejected / Meta error redirects ─────────────────────────
  if (errorParam) {
    const redirect = new URL(returnTo, url.origin);
    redirect.searchParams.set("ig_error", errorDescription ?? errorParam);
    return NextResponse.redirect(redirect);
  }

  if (!code || !state) {
    const redirect = new URL(returnTo, url.origin);
    redirect.searchParams.set("ig_error", "missing_code_or_state");
    return NextResponse.redirect(redirect);
  }

  // ── Verify state cookie (CSRF) ──────────────────────────────────────────
  const cookieState = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("ig_oauth_state="))
    ?.split("=")[1];

  if (!cookieState || cookieState !== state) {
    const redirect = new URL(returnTo, url.origin);
    redirect.searchParams.set("ig_error", "state_mismatch");
    return NextResponse.redirect(redirect);
  }

  // ── Auth check ───────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient() as Admin;

  // Resolve creator row
  const { data: creator } = await admin
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!creator) {
    return NextResponse.json(
      { error: "Creator profile not found" },
      { status: 404 },
    );
  }

  // ── Exchange code → short-lived → long-lived ─────────────────────────────
  try {
    const short = await exchangeCodeForToken(code);
    const long = await exchangeForLongLivedToken(short.access_token);

    // Fetch profile
    const profile = await fetchProfile(long.access_token);

    // ── Reject Personal accounts (Meta restriction) ───────────────────────
    if (profile.account_type === "PERSONAL") {
      const redirect = new URL(returnTo, url.origin);
      redirect.searchParams.set(
        "ig_error",
        "personal_account_not_supported",
      );
      return NextResponse.redirect(redirect);
    }

    // ── Optionally fetch insights (best-effort) ────────────────────────────
    let insights = null;
    try {
      insights = await fetchInsights(long.access_token, profile.id);
    } catch (err) {
      console.warn("[ig-callback] insights fetch failed (non-fatal)", err);
    }

    const tokenExpiresAt = new Date(Date.now() + long.expires_in * 1000);

    // ── Persist ───────────────────────────────────────────────────────────
    const { error: upErr } = await admin
      .from("creators")
      .update({
        instagram_user_id: profile.id,
        instagram_handle: profile.username,
        instagram_followers: profile.followers_count,
        instagram_access_token: encryptIgToken(long.access_token),
        instagram_token_expires_at: tokenExpiresAt.toISOString(),
        instagram_connected_at: new Date().toISOString(),
        instagram_account_type: profile.account_type,
        instagram_profile_pic_url: profile.profile_picture_url,
        instagram_media_count: profile.media_count,
        instagram_insights: insights,
        instagram_last_synced_at: new Date().toISOString(),
        instagram_verified: true,
        // Mirror bio to existing column if creator hasn't filled their own
        ...(profile.biography ? { bio: profile.biography } : {}),
      })
      .eq("id", creator.id);

    if (upErr) {
      console.error("[ig-callback] DB update failed", upErr);
      const redirect = new URL(returnTo, url.origin);
      redirect.searchParams.set("ig_error", "save_failed");
      return NextResponse.redirect(redirect);
    }

    // Success — redirect back with a flag
    const redirect = new URL(returnTo, url.origin);
    redirect.searchParams.set("ig_connected", "1");
    const res = NextResponse.redirect(redirect);
    // Clear the state cookie
    res.cookies.set("ig_oauth_state", "", { maxAge: 0, path: "/" });
    return res;
  } catch (err) {
    console.error("[ig-callback] OAuth flow failed", err);
    const redirect = new URL(returnTo, url.origin);
    redirect.searchParams.set(
      "ig_error",
      err instanceof Error ? err.message : "oauth_failed",
    );
    return NextResponse.redirect(redirect);
  }
}
