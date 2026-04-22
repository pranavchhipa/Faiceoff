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
export function decideRedirect(pathname: string, role: Role | null): string | null {
  if (pathname.startsWith("/api/")) return null;
  if (pathname.startsWith("/_next/") || pathname.startsWith("/static/")) return null;

  // 1. Public pages — no checks
  if (isPublicPath(pathname)) return null;

  // 2. Auth pages — logged-in users bounce to role home
  if (isAuthPath(pathname)) {
    if (role) return ROLE_HOME[role];
    return null;
  }

  // 3. Legacy /dashboard/* — role-aware 308 redirect
  if (isLegacyDashboardPath(pathname)) {
    if (!role) return `/login?redirect=${encodeURIComponent(pathname)}`;
    return resolveLegacyRedirect(pathname, role) ?? ROLE_HOME[role];
  }

  // 4. Protected — anon gets sent to login
  if (!role) {
    return `/login?redirect=${encodeURIComponent(pathname)}`;
  }

  // 5. Role boundary enforcement
  if (isBrandPath(pathname) && role !== "brand") return ROLE_HOME[role];
  if (isCreatorPath(pathname) && role !== "creator") return ROLE_HOME[role];
  if (isAdminPath(pathname) && role !== "admin") return ROLE_HOME[role];

  // 6. TODO(Chunk D): onboarding gate
  // When onboarding state is wired (creators.onboarding_step, brands.is_verified),
  // redirect to `/${role}/onboarding` if the user hasn't completed setup AND they
  // are not already on /{role}/onboarding/*. Intentionally deferred — Chunk B is
  // scaffolding only.

  return null;
}
