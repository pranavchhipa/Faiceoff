export type Role = "brand" | "creator" | "admin";

export const ROLE_HOME: Record<Role, string> = {
  brand: "/brand/dashboard",
  creator: "/creator/dashboard",
  admin: "/admin",
} as const;

export function getRoleHome(role: Role | null | undefined): string {
  if (!role) return "/login";
  return ROLE_HOME[role];
}

const MARKETING_PATHS = [
  "/",
  "/for-brands",
  "/for-creators",
  "/pricing",
  "/about",
  "/contact",
  "/terms",
  "/privacy",
  "/dpdp",
];

const AUTH_PREFIXES = ["/login", "/signup", "/auth/", "/forgot-password", "/reset-password"];

function startsWith(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

export function isBrandPath(pathname: string): boolean {
  return startsWith(pathname, "/brand");
}

export function isCreatorPath(pathname: string): boolean {
  return startsWith(pathname, "/creator");
}

export function isAdminPath(pathname: string): boolean {
  return startsWith(pathname, "/admin");
}

export function isPublicPath(pathname: string): boolean {
  if (MARKETING_PATHS.includes(pathname)) return true;
  if (pathname === "/u" || pathname.startsWith("/u/")) return true;
  return false;
}

export function isAuthPath(pathname: string): boolean {
  return AUTH_PREFIXES.some((prefix) =>
    pathname === prefix.replace(/\/$/, "") || pathname.startsWith(prefix)
  );
}

export function isLegacyDashboardPath(pathname: string): boolean {
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
}
