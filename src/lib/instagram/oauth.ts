// ─────────────────────────────────────────────────────────────────────────────
// Instagram OAuth — token exchange + refresh helpers
//
// Uses the new Instagram API with Instagram Login (2024) — NOT Basic Display
// (deprecated Dec 4 2024). Direct OAuth via instagram.com, no Facebook Page
// linking required for Business/Creator accounts.
//
// Flow:
//   1. start → redirect user to instagram.com/oauth/authorize
//   2. callback → exchange code for short-lived token (~1h)
//   3. exchange short-lived → long-lived (60 days, refreshable)
//   4. refresh long-lived periodically (cron, > 24h old & < 60d to expiry)
// ─────────────────────────────────────────────────────────────────────────────

export interface InstagramOAuthConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
}

export function getOAuthConfig(): InstagramOAuthConfig {
  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  const redirectUri =
    process.env.INSTAGRAM_OAUTH_REDIRECT_URI ??
    `${process.env.NEXT_PUBLIC_APP_URL ?? "https://faiceoff.com"}/api/auth/instagram/callback`;

  if (!appId || !appSecret) {
    throw new Error(
      "Instagram OAuth not configured — set INSTAGRAM_APP_ID + INSTAGRAM_APP_SECRET in env",
    );
  }
  return { appId, appSecret, redirectUri };
}

/**
 * Scopes we request. We take ONLY `instagram_business_basic` through App Review
 * for go-live — it covers the verified username, follower count, profile pic +
 * media that the whole onboarding/verification flow depends on. That single
 * permission is enough for normal (non-tester) creators to connect once the app
 * is published.
 *
 * `instagram_business_manage_insights` (reach/impressions/engagement) is
 * DEFERRED: it needs its own Advanced Access review + demo video, and the
 * connect flow already treats insights as best-effort (the callback fetch is
 * wrapped non-fatal → insights just stays null without the scope). Requesting it
 * here before it's approved would only muddy the OAuth grant on Live mode.
 *
 * To re-enable insights later: add "instagram_business_manage_insights" back to
 * this array and submit it for Advanced Access as a separate App Review.
 */
const SCOPES = [
  "instagram_business_basic",
].join(",");

/** Build the OAuth authorize URL. State is a CSRF token we verify on callback. */
export function buildAuthorizeUrl(state: string): string {
  const { appId, redirectUri } = getOAuthConfig();
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    state,
  });
  // New Instagram Login endpoint (NOT api.instagram.com — that's deprecated)
  return `https://www.instagram.com/oauth/authorize?${params.toString()}`;
}

export interface ShortLivedTokenResponse {
  access_token: string;
  user_id: string; // IG-scoped user id (numeric, string-encoded)
  permissions: string;
}

/**
 * Exchange the authorization code for a short-lived (~1h) access token.
 * Endpoint: api.instagram.com/oauth/access_token
 *
 * Throws if Meta returns an error response.
 */
export async function exchangeCodeForToken(
  code: string,
): Promise<ShortLivedTokenResponse> {
  const { appId, appSecret, redirectUri } = getOAuthConfig();

  const body = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });

  const res = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`IG short-token exchange failed (${res.status}): ${text}`);
  }
  return (await res.json()) as ShortLivedTokenResponse;
}

export interface LongLivedTokenResponse {
  access_token: string;
  token_type: "bearer";
  expires_in: number; // seconds (typically 5184000 = 60 days)
}

/**
 * Exchange a short-lived token for a long-lived one (60-day expiry).
 * Endpoint: graph.instagram.com/access_token?grant_type=ig_exchange_token
 */
export async function exchangeForLongLivedToken(
  shortLivedToken: string,
): Promise<LongLivedTokenResponse> {
  const { appSecret } = getOAuthConfig();

  const params = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: appSecret,
    access_token: shortLivedToken,
  });

  const res = await fetch(
    `https://graph.instagram.com/access_token?${params.toString()}`,
    { method: "GET" },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`IG long-token exchange failed (${res.status}): ${text}`);
  }
  return (await res.json()) as LongLivedTokenResponse;
}

/**
 * Refresh an existing long-lived token. Must be called between 24h-after-issue
 * and 60d-before-expiry (Meta rejects refreshes outside that window).
 * Returns a new 60-day token.
 */
export async function refreshLongLivedToken(
  longLivedToken: string,
): Promise<LongLivedTokenResponse> {
  const params = new URLSearchParams({
    grant_type: "ig_refresh_token",
    access_token: longLivedToken,
  });

  const res = await fetch(
    `https://graph.instagram.com/refresh_access_token?${params.toString()}`,
    { method: "GET" },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`IG token refresh failed (${res.status}): ${text}`);
  }
  return (await res.json()) as LongLivedTokenResponse;
}
