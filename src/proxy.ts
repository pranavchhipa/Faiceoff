import { NextResponse, type NextRequest } from "next/server";
import { getSessionRole } from "@/lib/auth/get-session-role";
import { decideRedirect } from "@/proxy-logic";
import { isLegacyDashboardPath } from "@/config/routes";

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Inject pathname as a request header so server components/layouts can
  // read the current URL path via `headers().get('x-pathname')`. Next.js
  // doesn't expose this directly to server components. Used by the
  // Control Centre layout to know whether to enforce auth (skipped on
  // /<slug>/login and /<slug>/setup).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  const { role, userId, onboardingComplete, refreshedResponse } = await getSessionRole(request, response);

  const target = decideRedirect(pathname, role, onboardingComplete);

  // Debug logging — temporary, remove once login flow is stable.
  // Skip noisy paths to keep Vercel logs readable.
  const isNoisy =
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/health") ||
    pathname.endsWith(".ico") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".svg");
  if (!isNoisy) {
    const sbCookieNames = request.cookies
      .getAll()
      .filter((c) => c.name.startsWith("sb-"))
      .map((c) => c.name);
    console.log(
      `[proxy] ${pathname} userId=${userId ?? "null"} role=${role ?? "null"} target=${target ?? "passthrough"} sbCookies=[${sbCookieNames.join(",")}]`,
    );
  }

  if (!target) return refreshedResponse ?? response;

  const redirectUrl = request.nextUrl.clone();
  const [path, query] = target.split("?");
  redirectUrl.pathname = path;
  redirectUrl.search = query ? `?${query}` : "";

  // Legacy dashboard redirects use 308 (permanent); everything else 307 (temp)
  const statusCode = isLegacyDashboardPath(pathname) ? 308 : 307;

  const redirect = NextResponse.redirect(redirectUrl, statusCode);
  // Propagate refreshed cookies onto the redirect response
  if (refreshedResponse) {
    for (const cookie of refreshedResponse.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
  }
  return redirect;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
