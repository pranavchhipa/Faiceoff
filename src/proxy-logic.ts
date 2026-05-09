import type { Role } from "@/config/routes";
import {
  ROLE_HOME,
  isBrandPath,
  isCreatorPath,
  isAdminPath,
  isPublicPath,
  isAuthPath,
  isLegacyDashboardPath,
} from "@/config/routes";
import { resolveLegacyRedirect } from "@/config/legacy-redirects";

/**
 * Pure routing decision.
 *
 * Returns the pathname (or path+query) to redirect to, or `null` if the
 * request should pass through untouched. Keeps HTTP concerns (NextResponse,
 * cookies) in the thin proxy.ts wrapper.
 *
 * API route short-circuit: /api/* never redirects (handlers manage auth).
 */
export function decideRedirect(pathname: string, role: Role | null, onboardingComplete = true): string | null {
  if (pathname.startsWith("/api/")) return null;
  if (pathname.startsWith("/_next/") || pathname.startsWith("/static/")) return null;

  // Control Centre — has its own TOTP auth at /(control)/[ccSlug]/.
  // Proxy must NOT intercept these or it'll bounce the operator to /login.
  // Match the configured slug (env) AND the segment shape (exactly one
  // top-level segment of length >= 16, our minimum). Both guards together
  // mean a random URL like `/foo` still falls through to the rest of the
  // pipeline and 404s normally.
  const ccSlug = process.env.OWNER_CONTROL_CENTRE_SLUG?.trim();
  if (ccSlug && (pathname === `/${ccSlug}` || pathname.startsWith(`/${ccSlug}/`))) {
    return null;
  }

  // 1. Public pages — no checks
  if (isPublicPath(pathname)) return null;

  // 2. Auth pages — logged-in users bounce to role home
  if (isAuthPath(pathname)) {
    if (role) return ROLE_HOME[role];
    return null;
  }

  // 3. Legacy /dashboard/* — role-aware 308 redirect
  // resolveLegacyRedirect returns null for paths that should pass through unchanged
  // (e.g. /dashboard/onboarding/*). In that case, fall through to further checks
  // rather than bouncing to role home.
  if (isLegacyDashboardPath(pathname)) {
    if (!role) return `/login?redirect=${encodeURIComponent(pathname)}`;
    const legacyTarget = resolveLegacyRedirect(pathname, role);
    if (legacyTarget !== null) return legacyTarget; // explicit redirect
    // null = pass through (e.g. onboarding pages still under /dashboard/)
  }

  // 4. Protected — anon gets sent to login
  if (!role) {
    return `/login?redirect=${encodeURIComponent(pathname)}`;
  }

  // 5. Role boundary enforcement
  if (isBrandPath(pathname) && role !== "brand") return ROLE_HOME[role];
  if (isCreatorPath(pathname) && role !== "creator") return ROLE_HOME[role];
  if (isAdminPath(pathname) && role !== "admin") return ROLE_HOME[role];

  // 6. Onboarding gate — incomplete users get funnelled to their setup flow
  if (!onboardingComplete) {
    const creatorOnboardingPaths = ["/dashboard/onboarding", "/creator/onboarding"];
    const brandOnboardingPath = "/brand/onboarding";
    const onOnboarding =
      creatorOnboardingPaths.some((p) => pathname.startsWith(p)) ||
      pathname.startsWith(brandOnboardingPath);
    if (!onOnboarding) {
      if (role === "creator") return "/dashboard/onboarding";
      if (role === "brand") return brandOnboardingPath;
    }
  }

  return null;
}
