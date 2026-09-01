import { NextResponse, type NextRequest } from "next/server";
import {
  getSessionRole,
  buildMwCacheValue,
  MW_CACHE_COOKIE,
} from "@/lib/auth/get-session-role";
import { decideRedirect, needsSession } from "@/proxy-logic";
import { isLegacyDashboardPath } from "@/config/routes";

/**
 * Proxy (middleware). Perf-critical — runs on every matched request.
 *
 * Request classes and their network cost:
 *  - /api/*, public marketing pages, Control Centre, assets → ZERO Supabase
 *    calls (decideRedirect provably ignores the session for these paths;
 *    API handlers do their own auth).
 *  - No sb-* auth cookie (anonymous) → ZERO Supabase calls; protected paths
 *    redirect straight to /login.
 *  - Authenticated, cached role → 1 call (getUser, refreshes token).
 *  - Authenticated, cache miss → getUser + one parallel role/onboarding batch.
 */
export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Pass-through response builder. Snapshots request headers at call time so
  // any token refresh applied to `request.cookies` by getSessionRole is
  // carried INTO the forwarded request (downstream handlers see the new
  // token instead of re-refreshing the old one).
  // x-pathname: read by the Control Centre layout (and available to any
  // server component) since Next.js doesn't expose the URL path directly.
  const buildNext = (extra?: { userId?: string; role?: string }) => {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-pathname", pathname);
    if (extra?.userId) requestHeaders.set("x-user-id", extra.userId);
    if (extra?.role) requestHeaders.set("x-user-role", extra.role);
    return NextResponse.next({ request: { headers: requestHeaders } });
  };

  // 1. Paths whose routing decision never needs the session → no auth work.
  if (!needsSession(pathname)) return buildNext();

  // 2. Anonymous fast path — no Supabase auth cookie at all.
  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
  if (!hasAuthCookie) {
    const target = decideRedirect(pathname, null, true);
    if (!target) return buildNext();
    return redirectTo(request, pathname, target);
  }

  // 3. Authenticated flow.
  const { role, userId, onboardingComplete, pendingCookies, cacheHit } =
    await getSessionRole(request);

  const target = decideRedirect(pathname, role, onboardingComplete);

  let response: NextResponse;
  if (!target) {
    response = buildNext({ userId: userId ?? undefined, role: role ?? undefined });
  } else {
    response = redirectTo(request, pathname, target);
  }

  // Propagate refreshed auth cookies to the browser.
  for (const c of pendingCookies) {
    response.cookies.set(c.name, c.value, c.options);
  }

  // Refresh the role cache cookie (steady-state users only — onboarding
  // completion must never be masked by a stale cached value).
  if (userId && role && onboardingComplete && !cacheHit) {
    response.cookies.set(MW_CACHE_COOKIE, buildMwCacheValue(userId, role), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
    // Client-readable role hint (`uid:role`) — lets AuthProvider paint the
    // correct dashboard chrome synchronously instead of blocking on
    // /api/whoami. Purely a UI hint: every API re-derives role server-side.
    response.cookies.set("fo_role", `${userId}:${role}`, {
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }
  // Signed-out remnants: clear lingering cache cookies once.
  if (!userId && request.cookies.has(MW_CACHE_COOKIE)) {
    response.cookies.delete(MW_CACHE_COOKIE);
    response.cookies.delete("fo_role");
  }

  return response;
}

function redirectTo(
  request: NextRequest,
  pathname: string,
  target: string,
): NextResponse {
  const redirectUrl = request.nextUrl.clone();
  const [path, query] = target.split("?");
  redirectUrl.pathname = path;
  redirectUrl.search = query ? `?${query}` : "";

  // Legacy dashboard redirects use 308 (permanent); everything else 307 (temp)
  const statusCode = isLegacyDashboardPath(pathname) ? 308 : 307;

  // Refreshed auth cookies (if any) are attached by the caller.
  return NextResponse.redirect(redirectUrl, statusCode);
}

export const config = {
  matcher: [
    // Exclude crawler + asset routes so middleware never redirects them to
    // /login. sitemap.xml / robots.txt MUST be publicly fetchable or Google
    // Search Console reports "Couldn't fetch".
    "/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
