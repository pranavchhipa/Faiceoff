# Chunk B — Route Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the single `/dashboard/*` space into role-specific `/brand/*`, `/creator/*`, `/admin/*`, `/u/*` trees with role-aware middleware, themed shells, mobile bottom nav, and 308 redirects from legacy paths.

**Architecture:** Next 16 App Router directory segments per role (no nested `(dashboard)` group). Role is derived once from DB in middleware (via `public.users.role`) and passed through request headers so every shell renders the correct theme without flicker. Side nav (240↔64px collapse) on desktop, 5-tab fixed bottom nav on mobile. Legacy `/dashboard/*` paths read a typed redirect map and 308 to the new location.

**Tech Stack:** Next.js 16, React 19, Framer Motion 12, Tailwind v4, shadcn/ui primitives (Radix under the hood), lucide-react, Supabase SSR client for middleware auth, Vitest for unit tests, Playwright for e2e.

---

## File Structure

### Create

```
src/config/
  legacy-redirects.ts                             # Typed 308-redirect map
  nav-items.brand.ts                              # Brand side nav + bottom nav configs
  nav-items.creator.ts                            # Creator nav configs
  nav-items.admin.ts                              # Admin nav config
  routes.ts                                       # Route constants + role-home helper

src/lib/auth/
  get-session-role.ts                             # Middleware helper: resolve role from Supabase + DB

src/components/layouts/
  brand-shell.tsx
  creator-shell.tsx
  admin-shell.tsx
  onboarding-shell.tsx

src/components/layouts/nav/
  side-nav.tsx                                    # Desktop 240↔64 collapse
  side-nav-item.tsx                               # Single nav row atom
  mobile-bottom-nav.tsx                           # 5-tab fixed bottom (layoutId indicator)
  mobile-nav-drawer.tsx                           # Hamburger overlay (role-themed)
  top-bar.tsx                                     # 56px sticky header
  user-menu.tsx                                   # Avatar dropdown
  notifications-popover.tsx                       # Bell + empty list placeholder
  command-palette.tsx                             # ⌘K search (desktop only, keyboard-activated)
  skip-to-content.tsx                             # A11y skip link

src/components/layouts/brand-kit/
  role-theme-provider.tsx                         # Injects --role-accent CSS vars
  balance-chip.tsx                                # Animated ₹ counter
  page-title.tsx                                  # h1 with entrance animation

src/components/ui/                                # shadcn primitives to add
  dropdown-menu.tsx
  dialog.tsx
  sheet.tsx
  tooltip.tsx
  command.tsx
  popover.tsx

src/app/brand/
  layout.tsx
  dashboard/page.tsx
  onboarding/layout.tsx
  onboarding/page.tsx
  onboarding/[step]/page.tsx
  credits/page.tsx
  credits/top-up/page.tsx
  creators/page.tsx
  creators/[id]/page.tsx
  licenses/page.tsx
  licenses/new/page.tsx
  licenses/[id]/page.tsx
  sessions/page.tsx
  sessions/[id]/page.tsx
  settings/page.tsx
  settings/billing/page.tsx
  settings/team/page.tsx
  settings/api-keys/page.tsx

src/app/creator/
  layout.tsx
  dashboard/page.tsx
  onboarding/layout.tsx
  onboarding/page.tsx
  onboarding/[step]/page.tsx
  listings/page.tsx
  listings/new/page.tsx
  listings/[id]/page.tsx
  requests/page.tsx
  requests/[id]/page.tsx
  sessions/page.tsx
  sessions/[id]/page.tsx
  approvals/page.tsx
  approvals/[id]/page.tsx
  earnings/page.tsx
  earnings/withdraw/page.tsx
  kyc/page.tsx
  reference-photos/page.tsx
  settings/page.tsx
  settings/notifications/page.tsx

src/app/admin/
  layout.tsx
  page.tsx
  disputes/page.tsx
  disputes/[id]/page.tsx
  ledgers/page.tsx
  reconcile/page.tsx
  users/page.tsx
  users/[id]/page.tsx
  contracts/page.tsx
  audit-log/page.tsx

src/app/u/
  layout.tsx
  generations/[id]/page.tsx
  profile/[creator_id]/page.tsx

tests/unit/proxy/                                 # Vitest
  role-routing.test.ts
  legacy-redirects.test.ts

tests/e2e/                                        # Playwright
  role-redirects.spec.ts
  legacy-308.spec.ts
  mobile-nav.spec.ts

src/app/globals.css                               # Add safe-area + reduced-motion utilities
```

### Modify

```
src/proxy.ts                                     # Role-aware routing + legacy 308 handling
src/app/layout.tsx                               # Add viewport-fit=cover meta
src/config/site.ts                               # Add route constants
src/config/navigation.ts                         # Delete (split into nav-items.{role}.ts)
```

### Do NOT delete (soft cutover — keep for 90 days)

```
src/app/(dashboard)/                             # Legacy tree stays; middleware redirects away from it
```

---

## Phase 1 — Config foundation

### Task 1: Route constants + role-home helper

**Files:**
- Create: `src/config/routes.ts`
- Modify: `src/config/site.ts`

- [ ] **Step 1: Write the failing test**

Create `src/config/__tests__/routes.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { ROLE_HOME, getRoleHome, isBrandPath, isCreatorPath, isAdminPath, isPublicPath, isAuthPath } from "../routes";

describe("routes", () => {
  describe("ROLE_HOME", () => {
    it("maps every role to its home path", () => {
      expect(ROLE_HOME.brand).toBe("/brand/dashboard");
      expect(ROLE_HOME.creator).toBe("/creator/dashboard");
      expect(ROLE_HOME.admin).toBe("/admin");
    });
  });

  describe("getRoleHome", () => {
    it("returns role home for known roles", () => {
      expect(getRoleHome("brand")).toBe("/brand/dashboard");
      expect(getRoleHome("creator")).toBe("/creator/dashboard");
      expect(getRoleHome("admin")).toBe("/admin");
    });
    it("falls back to /login for unknown role", () => {
      expect(getRoleHome(null)).toBe("/login");
    });
  });

  describe("path matchers", () => {
    it("isBrandPath matches /brand and children", () => {
      expect(isBrandPath("/brand")).toBe(true);
      expect(isBrandPath("/brand/dashboard")).toBe(true);
      expect(isBrandPath("/brands")).toBe(false);
      expect(isBrandPath("/creator/brand")).toBe(false);
    });
    it("isCreatorPath matches /creator and children", () => {
      expect(isCreatorPath("/creator")).toBe(true);
      expect(isCreatorPath("/creator/listings")).toBe(true);
      expect(isCreatorPath("/creators")).toBe(false);
    });
    it("isAdminPath matches /admin and children", () => {
      expect(isAdminPath("/admin")).toBe(true);
      expect(isAdminPath("/admin/ledgers")).toBe(true);
      expect(isAdminPath("/administrator")).toBe(false);
    });
    it("isPublicPath includes /, marketing pages, /u/*", () => {
      expect(isPublicPath("/")).toBe(true);
      expect(isPublicPath("/for-brands")).toBe(true);
      expect(isPublicPath("/pricing")).toBe(true);
      expect(isPublicPath("/terms")).toBe(true);
      expect(isPublicPath("/u/generations/abc")).toBe(true);
      expect(isPublicPath("/brand/dashboard")).toBe(false);
    });
    it("isAuthPath matches /login, /signup, /auth/*", () => {
      expect(isAuthPath("/login")).toBe(true);
      expect(isAuthPath("/signup")).toBe(true);
      expect(isAuthPath("/signup/brand")).toBe(true);
      expect(isAuthPath("/auth/verify")).toBe(true);
      expect(isAuthPath("/brand/dashboard")).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/config/__tests__/routes.test.ts`
Expected: FAIL with "Cannot find module '../routes'"

- [ ] **Step 3: Write the minimal implementation**

Create `src/config/routes.ts`:

```typescript
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
```

Modify `src/config/site.ts` to re-export useful constants:

```typescript
export { ROLE_HOME, getRoleHome } from "./routes";
export type { Role } from "./routes";

export const siteConfig = {
  name: "Faiceoff",
  description: "India's first consent-first AI likeness licensing marketplace",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
} as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/config/__tests__/routes.test.ts`
Expected: PASS (6/6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/config/routes.ts src/config/site.ts src/config/__tests__/routes.test.ts
git commit -m "feat(routes): role-home helpers + path matchers"
```

---

### Task 2: Legacy redirect map

**Files:**
- Create: `src/config/legacy-redirects.ts`
- Test: `src/config/__tests__/legacy-redirects.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { resolveLegacyRedirect } from "../legacy-redirects";

describe("resolveLegacyRedirect", () => {
  it("maps /dashboard to role home", () => {
    expect(resolveLegacyRedirect("/dashboard", "brand")).toBe("/brand/dashboard");
    expect(resolveLegacyRedirect("/dashboard", "creator")).toBe("/creator/dashboard");
  });

  it("maps /dashboard/campaigns to role-specific sessions", () => {
    expect(resolveLegacyRedirect("/dashboard/campaigns", "brand")).toBe("/brand/sessions");
    expect(resolveLegacyRedirect("/dashboard/campaigns", "creator")).toBe("/creator/sessions");
  });

  it("maps /dashboard/campaigns/<id> preserving id to role sessions", () => {
    expect(resolveLegacyRedirect("/dashboard/campaigns/abc-123", "brand"))
      .toBe("/brand/sessions/abc-123");
    expect(resolveLegacyRedirect("/dashboard/campaigns/abc-123", "creator"))
      .toBe("/creator/sessions/abc-123");
  });

  it("maps /dashboard/creators for brand only", () => {
    expect(resolveLegacyRedirect("/dashboard/creators", "brand")).toBe("/brand/creators");
    expect(resolveLegacyRedirect("/dashboard/creators/xyz", "brand")).toBe("/brand/creators/xyz");
  });

  it("creator visiting /dashboard/creators gets sent to their dashboard", () => {
    expect(resolveLegacyRedirect("/dashboard/creators", "creator")).toBe("/creator/dashboard");
  });

  it("maps /dashboard/approvals to /creator/approvals", () => {
    expect(resolveLegacyRedirect("/dashboard/approvals", "creator")).toBe("/creator/approvals");
    expect(resolveLegacyRedirect("/dashboard/approvals/xyz", "creator"))
      .toBe("/creator/approvals/xyz");
  });

  it("brand visiting /dashboard/approvals gets sent to their dashboard", () => {
    expect(resolveLegacyRedirect("/dashboard/approvals", "brand")).toBe("/brand/dashboard");
  });

  it("maps /dashboard/wallet per role", () => {
    expect(resolveLegacyRedirect("/dashboard/wallet", "brand")).toBe("/brand/credits");
    expect(resolveLegacyRedirect("/dashboard/wallet", "creator")).toBe("/creator/earnings");
  });

  it("maps /dashboard/onboarding and /dashboard/brand-setup", () => {
    expect(resolveLegacyRedirect("/dashboard/onboarding", "brand")).toBe("/brand/onboarding");
    expect(resolveLegacyRedirect("/dashboard/onboarding", "creator")).toBe("/creator/onboarding");
    expect(resolveLegacyRedirect("/dashboard/brand-setup", "brand")).toBe("/brand/onboarding");
  });

  it("maps /dashboard/likeness to /creator/reference-photos", () => {
    expect(resolveLegacyRedirect("/dashboard/likeness", "creator"))
      .toBe("/creator/reference-photos");
  });

  it("maps /dashboard/settings to role settings", () => {
    expect(resolveLegacyRedirect("/dashboard/settings", "brand")).toBe("/brand/settings");
    expect(resolveLegacyRedirect("/dashboard/settings", "creator")).toBe("/creator/settings");
  });

  it("maps /dashboard/analytics to role dashboard", () => {
    expect(resolveLegacyRedirect("/dashboard/analytics", "brand")).toBe("/brand/dashboard");
    expect(resolveLegacyRedirect("/dashboard/analytics", "creator")).toBe("/creator/dashboard");
  });

  it("unknown /dashboard/* path falls back to role home", () => {
    expect(resolveLegacyRedirect("/dashboard/mystery", "brand")).toBe("/brand/dashboard");
    expect(resolveLegacyRedirect("/dashboard/mystery", "creator")).toBe("/creator/dashboard");
  });

  it("returns null if not a legacy path", () => {
    expect(resolveLegacyRedirect("/brand/dashboard", "brand")).toBeNull();
    expect(resolveLegacyRedirect("/login", null)).toBeNull();
  });

  it("unknown role can't resolve, returns null", () => {
    expect(resolveLegacyRedirect("/dashboard", null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/config/__tests__/legacy-redirects.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the minimal implementation**

```typescript
import type { Role } from "./routes";

interface Rule {
  /** regex matching the legacy pathname */
  match: RegExp;
  /** builder → returns new pathname for given role, or null if role not applicable */
  resolve: (m: RegExpMatchArray, role: Role) => string | null;
}

const RULES: Rule[] = [
  { match: /^\/dashboard\/?$/, resolve: (_m, r) => `/${r}/dashboard` },

  {
    match: /^\/dashboard\/campaigns(?:\/(.+))?$/,
    resolve: (m, r) => (m[1] ? `/${r}/sessions/${m[1]}` : `/${r}/sessions`),
  },
  {
    match: /^\/dashboard\/generations\/(.+)$/,
    resolve: (m, r) => `/${r}/sessions/${m[1]}`,
  },

  {
    match: /^\/dashboard\/creators(?:\/(.+))?$/,
    resolve: (m, r) => {
      if (r !== "brand") return `/${r}/dashboard`;
      return m[1] ? `/brand/creators/${m[1]}` : "/brand/creators";
    },
  },

  {
    match: /^\/dashboard\/approvals(?:\/(.+))?$/,
    resolve: (m, r) => {
      if (r !== "creator") return `/${r}/dashboard`;
      return m[1] ? `/creator/approvals/${m[1]}` : "/creator/approvals";
    },
  },

  {
    match: /^\/dashboard\/wallet\/?$/,
    resolve: (_m, r) => (r === "brand" ? "/brand/credits" : "/creator/earnings"),
  },

  {
    match: /^\/dashboard\/onboarding\/?$/,
    resolve: (_m, r) => `/${r}/onboarding`,
  },
  {
    match: /^\/dashboard\/brand-setup\/?$/,
    resolve: () => "/brand/onboarding",
  },

  {
    match: /^\/dashboard\/likeness\/?$/,
    resolve: (_m, r) => (r === "creator" ? "/creator/reference-photos" : `/${r}/dashboard`),
  },

  {
    match: /^\/dashboard\/settings(?:\/(.+))?$/,
    resolve: (m, r) => (m[1] ? `/${r}/settings/${m[1]}` : `/${r}/settings`),
  },

  {
    match: /^\/dashboard\/analytics\/?$/,
    resolve: (_m, r) => `/${r}/dashboard`,
  },

  // Wildcard fallback — any other /dashboard/* goes to role home
  {
    match: /^\/dashboard\/.+$/,
    resolve: (_m, r) => `/${r}/dashboard`,
  },
];

export function resolveLegacyRedirect(pathname: string, role: Role | null): string | null {
  if (!role) return null;
  for (const rule of RULES) {
    const m = pathname.match(rule.match);
    if (m) return rule.resolve(m, role);
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/config/__tests__/legacy-redirects.test.ts`
Expected: PASS (all ~15 assertions)

- [ ] **Step 5: Commit**

```bash
git add src/config/legacy-redirects.ts src/config/__tests__/legacy-redirects.test.ts
git commit -m "feat(routes): legacy /dashboard/* redirect map"
```

---

### Task 3: Per-role nav configs

**Files:**
- Create: `src/config/nav-items.brand.ts`
- Create: `src/config/nav-items.creator.ts`
- Create: `src/config/nav-items.admin.ts`
- Modify/Delete: `src/config/navigation.ts` (replace with re-exports for back-compat during cutover)

- [ ] **Step 1: Write the nav configs**

Create `src/config/nav-items.brand.ts`:

```typescript
import type { ComponentType, SVGProps } from "react";
import {
  LayoutDashboard,
  Users,
  FileSignature,
  Megaphone,
  Wallet,
  Settings as SettingsIcon,
  User as UserIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Hide from desktop side nav? (e.g. only on mobile bottom tab) */
  desktopOnly?: boolean;
  mobileOnly?: boolean;
}

/** Full desktop side nav — 6 primary items */
export const BRAND_SIDE_NAV: NavItem[] = [
  { label: "Dashboard", href: "/brand/dashboard", icon: LayoutDashboard },
  { label: "Creators", href: "/brand/creators", icon: Users },
  { label: "Licenses", href: "/brand/licenses", icon: FileSignature },
  { label: "Sessions", href: "/brand/sessions", icon: Megaphone },
  { label: "Credits", href: "/brand/credits", icon: Wallet },
  { label: "Settings", href: "/brand/settings", icon: SettingsIcon },
];

/** Mobile bottom nav — 5 items (Home, Creators, Licenses, Credits, Profile) */
export const BRAND_MOBILE_NAV: NavItem[] = [
  { label: "Home", href: "/brand/dashboard", icon: LayoutDashboard },
  { label: "Creators", href: "/brand/creators", icon: Users },
  { label: "Licenses", href: "/brand/licenses", icon: FileSignature },
  { label: "Credits", href: "/brand/credits", icon: Wallet },
  { label: "Profile", href: "/brand/settings", icon: UserIcon },
];
```

Create `src/config/nav-items.creator.ts`:

```typescript
import type { ComponentType, SVGProps } from "react";
import {
  LayoutDashboard,
  Inbox,
  ClipboardCheck,
  Megaphone,
  IndianRupee,
  FileStack,
  User as UserIcon,
  Settings as SettingsIcon,
} from "lucide-react";
import type { NavItem } from "./nav-items.brand";

export type { NavItem };

export const CREATOR_SIDE_NAV: NavItem[] = [
  { label: "Dashboard", href: "/creator/dashboard", icon: LayoutDashboard },
  { label: "Requests", href: "/creator/requests", icon: Inbox },
  { label: "Approvals", href: "/creator/approvals", icon: ClipboardCheck },
  { label: "Sessions", href: "/creator/sessions", icon: Megaphone },
  { label: "Earnings", href: "/creator/earnings", icon: IndianRupee },
  { label: "Listings", href: "/creator/listings", icon: FileStack },
  { label: "Settings", href: "/creator/settings", icon: SettingsIcon },
];

export const CREATOR_MOBILE_NAV: NavItem[] = [
  { label: "Home", href: "/creator/dashboard", icon: LayoutDashboard },
  { label: "Requests", href: "/creator/requests", icon: Inbox },
  { label: "Approvals", href: "/creator/approvals", icon: ClipboardCheck },
  { label: "Earnings", href: "/creator/earnings", icon: IndianRupee },
  { label: "Profile", href: "/creator/settings", icon: UserIcon },
];
```

Create `src/config/nav-items.admin.ts`:

```typescript
import type { ComponentType, SVGProps } from "react";
import {
  LayoutDashboard,
  AlertTriangle,
  ReceiptText,
  RefreshCw,
  Users,
  ScrollText,
  FileText,
} from "lucide-react";
import type { NavItem } from "./nav-items.brand";

export type { NavItem };

export const ADMIN_SIDE_NAV: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Disputes", href: "/admin/disputes", icon: AlertTriangle },
  { label: "Ledgers", href: "/admin/ledgers", icon: ReceiptText },
  { label: "Reconcile", href: "/admin/reconcile", icon: RefreshCw },
  { label: "Users", href: "/admin/users", icon: Users },
  { label: "Contracts", href: "/admin/contracts", icon: FileText },
  { label: "Audit log", href: "/admin/audit-log", icon: ScrollText },
];
```

Replace `src/config/navigation.ts` with:

```typescript
/**
 * DEPRECATED shim: the legacy /dashboard/* tree (soft-cutover for 90 days)
 * still imports from here. New code should import from nav-items.<role>.ts
 * directly.
 */
export { BRAND_SIDE_NAV as brandNav } from "./nav-items.brand";
export { CREATOR_SIDE_NAV as creatorNav } from "./nav-items.creator";
export { ADMIN_SIDE_NAV as adminNav } from "./nav-items.admin";
export type { NavItem } from "./nav-items.brand";
```

- [ ] **Step 2: Run typecheck to verify**

Run: `pnpm tsc --noEmit`
Expected: PASS (no new errors introduced). If lucide-react is missing any of the icons listed (e.g. `FileSignature`), substitute with the closest available (`FileCheck`, `FileText`, etc.) and update accordingly.

- [ ] **Step 3: Commit**

```bash
git add src/config/nav-items.brand.ts src/config/nav-items.creator.ts src/config/nav-items.admin.ts src/config/navigation.ts
git commit -m "feat(routes): per-role nav configs (side + mobile bottom)"
```

---

## Phase 2 — Role-aware middleware

### Task 4: get-session-role helper

**Files:**
- Create: `src/lib/auth/get-session-role.ts`
- Test: `src/lib/auth/__tests__/get-session-role.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveRoleFromUserRow } from "../get-session-role";

describe("resolveRoleFromUserRow", () => {
  it("returns role from users.role column", () => {
    expect(resolveRoleFromUserRow({ role: "brand" })).toBe("brand");
    expect(resolveRoleFromUserRow({ role: "creator" })).toBe("creator");
    expect(resolveRoleFromUserRow({ role: "admin" })).toBe("admin");
  });
  it("returns null for unknown role value", () => {
    expect(resolveRoleFromUserRow({ role: "guest" })).toBeNull();
    expect(resolveRoleFromUserRow({ role: null })).toBeNull();
    expect(resolveRoleFromUserRow(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/auth/__tests__/get-session-role.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the implementation**

```typescript
import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import type { Role } from "@/config/routes";

export interface SessionRoleResult {
  userId: string | null;
  role: Role | null;
  /** true when we issued a NEW response to attach refreshed cookies */
  refreshedResponse: NextResponse | null;
}

export function resolveRoleFromUserRow(
  row: { role?: string | null } | null,
): Role | null {
  const role = row?.role;
  if (role === "brand" || role === "creator" || role === "admin") return role;
  return null;
}

function anonKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    ""
  );
}

/**
 * Middleware-safe role resolver.
 *
 * 1. Calls Supabase auth.getUser() to refresh the token cookie
 * 2. If logged in, fetches users.role via the anon client (relies on RLS
 *    policy allowing users to read their own row — already in place)
 * 3. Returns a response with the refreshed cookies attached so the caller
 *    can pass it through to NextResponse.next()
 */
export async function getSessionRole(
  request: NextRequest,
  mutableResponse: NextResponse,
): Promise<SessionRoleResult> {
  let response = mutableResponse;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey(),
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          // Rebuild response with refreshed cookies
          // Caller gets `refreshedResponse` with these set
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { userId: null, role: null, refreshedResponse: response };

  const { data: row } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return {
    userId: user.id,
    role: resolveRoleFromUserRow(row as { role?: string | null } | null),
    refreshedResponse: response,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/auth/__tests__/get-session-role.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/get-session-role.ts src/lib/auth/__tests__/get-session-role.test.ts
git commit -m "feat(auth): getSessionRole helper for middleware"
```

---

### Task 5: Rewrite proxy.ts with role-aware routing

**Files:**
- Modify: `src/proxy.ts`
- Test: `src/__tests__/proxy.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/proxy.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { decideRedirect } from "../proxy-logic";
import type { Role } from "@/config/routes";

describe("decideRedirect — proxy routing matrix", () => {
  const cases: Array<[string, Role | null, string, string | null]> = [
    // [pathname, role, description, expectedRedirect | null(=pass through)]
    ["/",                   null,      "public, anon",               null],
    ["/for-brands",         null,      "marketing, anon",            null],
    ["/login",              null,      "auth page, anon",            null],
    ["/login",              "brand",   "logged-in brand hits login", "/brand/dashboard"],
    ["/login",              "creator", "logged-in creator hits login", "/creator/dashboard"],
    ["/auth/verify",        "brand",   "logged-in hits verify",      "/brand/dashboard"],
    ["/brand/dashboard",    null,      "protected, anon",            "/login?redirect=%2Fbrand%2Fdashboard"],
    ["/brand/dashboard",    "brand",   "brand in /brand",            null],
    ["/brand/dashboard",    "creator", "creator in /brand",          "/creator/dashboard"],
    ["/creator/dashboard",  "brand",   "brand in /creator",          "/brand/dashboard"],
    ["/admin",              "brand",   "non-admin in /admin",        "/brand/dashboard"],
    ["/admin",              "admin",   "admin in /admin",            null],
    ["/dashboard",          "brand",   "legacy root as brand",       "/brand/dashboard"],
    ["/dashboard/campaigns","brand",   "legacy campaigns as brand",  "/brand/sessions"],
    ["/dashboard/approvals","creator", "legacy approvals as creator","/creator/approvals"],
    ["/dashboard/wallet",   "brand",   "legacy wallet as brand",     "/brand/credits"],
    ["/dashboard/wallet",   "creator", "legacy wallet as creator",   "/creator/earnings"],
    ["/u/generations/abc",  null,      "public utility, anon",       null],
    ["/api/health",         null,      "api route anon",             null],
  ];

  for (const [pathname, role, description, expected] of cases) {
    it(`${description}: ${pathname} [role=${role ?? "anon"}]`, () => {
      const result = decideRedirect(pathname, role);
      expect(result).toBe(expected);
    });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/__tests__/proxy.test.ts`
Expected: FAIL with "Cannot find module '../proxy-logic'"

- [ ] **Step 3: Write the pure routing-decision function**

Create `src/proxy-logic.ts` (pure, testable — the HTTP side stays in `proxy.ts`):

```typescript
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
 * Returns the pathname to redirect to, or `null` if the request should pass
 * through untouched. Keeps HTTP concerns (NextResponse, cookies) in the
 * thin proxy.ts wrapper.
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/__tests__/proxy.test.ts`
Expected: PASS (all 18 cases)

- [ ] **Step 5: Rewrite `src/proxy.ts` as the thin HTTP adapter**

```typescript
import { NextResponse, type NextRequest } from "next/server";
import { getSessionRole } from "@/lib/auth/get-session-role";
import { decideRedirect } from "@/proxy-logic";
import { isLegacyDashboardPath } from "@/config/routes";

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });
  const { role, refreshedResponse } = await getSessionRole(request, response);
  const pathname = request.nextUrl.pathname;

  const target = decideRedirect(pathname, role);
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
```

- [ ] **Step 6: Run both unit tests + build to verify no regressions**

Run: `pnpm vitest run && pnpm tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/proxy.ts src/proxy-logic.ts src/__tests__/proxy.test.ts
git commit -m "feat(proxy): role-aware middleware + legacy 308 redirects"
```

---

## Phase 3 — Shared brand-kit primitives

### Task 6: role-theme-provider

**Files:**
- Create: `src/components/layouts/brand-kit/role-theme-provider.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import type { CSSProperties, ReactNode } from "react";
import type { Role } from "@/config/routes";

interface Props {
  role: Role;
  children: ReactNode;
}

const THEME: Record<Role, CSSProperties> = {
  brand: {
    "--role-accent": "var(--color-ocean)",
    "--role-accent-strong": "#8aabc8",
    "--role-accent-fg": "var(--color-ink)",
  } as CSSProperties,
  creator: {
    "--role-accent": "var(--color-blush)",
    "--role-accent-strong": "#d4949a",
    "--role-accent-fg": "var(--color-ink)",
  } as CSSProperties,
  admin: {
    "--role-accent": "#e6e6e6",
    "--role-accent-strong": "#999999",
    "--role-accent-fg": "var(--color-ink)",
  } as CSSProperties,
};

/**
 * Scope role-aware CSS variables to a subtree. All child components reading
 * `var(--role-accent)` pick up the right tint without prop drilling.
 */
export function RoleThemeProvider({ role, children }: Props) {
  return (
    <div data-role={role} style={THEME[role]}>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/layouts/brand-kit/role-theme-provider.tsx
git commit -m "feat(ui): role theme provider (ocean/blush/neutral CSS vars)"
```

---

### Task 7: balance-chip (animated ₹ counter)

**Files:**
- Create: `src/components/layouts/brand-kit/balance-chip.tsx`
- Test: `src/components/layouts/brand-kit/__tests__/balance-chip.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { BalanceChip } from "../balance-chip";

describe("BalanceChip", () => {
  it("renders rupee value with ₹ prefix", () => {
    render(<BalanceChip paise={1234500} />);
    expect(screen.getByText(/12,345/)).toBeInTheDocument();
  });
  it("rounds sub-rupee paise", () => {
    render(<BalanceChip paise={99} />);
    // 99 paise → ₹0.99
    expect(screen.getByText(/0\.99/)).toBeInTheDocument();
  });
  it("exposes aria-label with formatted value", () => {
    render(<BalanceChip paise={250000} ariaLabel="Credits balance" />);
    const chip = screen.getByRole("status");
    expect(chip).toHaveAttribute("aria-label", expect.stringContaining("Credits balance"));
    expect(chip).toHaveAttribute("aria-label", expect.stringContaining("₹2,500"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/layouts/brand-kit/__tests__/balance-chip.test.tsx`
Expected: FAIL

- [ ] **Step 3: Write the component**

```tsx
"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

interface Props {
  paise: number;
  label?: string;
  ariaLabel?: string;
}

function formatRupees(paise: number): string {
  const rupees = paise / 100;
  return rupees.toLocaleString("en-IN", {
    minimumFractionDigits: rupees % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Animated rupee counter chip. On mount or value change it tweens from the
 * previous value to `paise` over 800ms (reduced-motion respects).
 */
export function BalanceChip({ paise, label, ariaLabel }: Props) {
  const reduceMotion = useReducedMotion();
  const prev = useRef(paise);
  const [displayed, setDisplayed] = useState(paise);

  useEffect(() => {
    if (reduceMotion) {
      setDisplayed(paise);
      prev.current = paise;
      return;
    }
    const start = prev.current;
    const delta = paise - start;
    if (delta === 0) return;
    const duration = 800;
    const startedAt = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - startedAt) / duration);
      // easeOutExpo
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setDisplayed(Math.round(start + delta * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else prev.current = paise;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paise, reduceMotion]);

  const formatted = formatRupees(displayed);
  const a11y = ariaLabel ? `${ariaLabel}: ₹${formatted}` : `₹${formatted}`;

  return (
    <motion.span
      role="status"
      aria-label={a11y}
      aria-live="polite"
      className="inline-flex items-center gap-1 rounded-full border border-[var(--role-accent-strong)]/30 bg-[var(--role-accent)]/40 px-3 py-1 text-sm font-600 text-[var(--color-ink)]"
    >
      {label ? <span className="text-xs opacity-70">{label}</span> : null}
      <span className="font-mono tabular-nums">₹{formatted}</span>
    </motion.span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/components/layouts/brand-kit/__tests__/balance-chip.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/layouts/brand-kit/balance-chip.tsx src/components/layouts/brand-kit/__tests__/balance-chip.test.tsx
git commit -m "feat(ui): animated balance chip (₹ counter with easeOutExpo)"
```

---

### Task 8: page-title

**Files:**
- Create: `src/components/layouts/brand-kit/page-title.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}

export function PageTitle({ children, subtitle, action }: Props) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] as const }}
      >
        <h1 className="font-outfit text-3xl font-700 tracking-[-0.02em] text-[var(--color-ink)]">
          {children}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-[var(--color-ink)]/60">{subtitle}</p>
        ) : null}
      </motion.div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/layouts/brand-kit/page-title.tsx
git commit -m "feat(ui): page-title with entrance animation"
```

---

## Phase 4 — Navigation atoms

### Task 9: shadcn primitives (dropdown, dialog, sheet, tooltip, command, popover)

**Files:**
- Create: `src/components/ui/dropdown-menu.tsx`
- Create: `src/components/ui/dialog.tsx`
- Create: `src/components/ui/sheet.tsx`
- Create: `src/components/ui/tooltip.tsx`
- Create: `src/components/ui/popover.tsx`
- Create: `src/components/ui/command.tsx`

- [ ] **Step 1: Install any missing Radix deps**

```bash
pnpm add cmdk @radix-ui/react-dropdown-menu @radix-ui/react-dialog @radix-ui/react-tooltip @radix-ui/react-popover
```

Expected: installs without error (the `radix-ui` meta-package is already present but the individual packages may need explicit pins).

- [ ] **Step 2: Add shadcn primitive files**

Copy the canonical shadcn/ui primitives for Next 16 + Tailwind v4 into the paths above. Keep every className consistent with existing `src/components/ui/button.tsx` conventions. If shadcn CLI is present use:

```bash
pnpm dlx shadcn@latest add dropdown-menu dialog sheet tooltip command popover
```

If CLI fails, paste the components directly from https://ui.shadcn.com (MIT-licensed). Required exports per file:
- `dropdown-menu.tsx` — DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel
- `dialog.tsx` — Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger
- `sheet.tsx` — Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger (side: left|right|top|bottom)
- `tooltip.tsx` — Tooltip, TooltipProvider, TooltipTrigger, TooltipContent
- `popover.tsx` — Popover, PopoverTrigger, PopoverContent
- `command.tsx` — Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator

Map colors to existing CSS vars (`var(--color-paper)`, `var(--color-ink)`, `var(--role-accent)`).

- [ ] **Step 3: Run build to verify**

Run: `pnpm tsc --noEmit && pnpm build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/dropdown-menu.tsx src/components/ui/dialog.tsx src/components/ui/sheet.tsx src/components/ui/tooltip.tsx src/components/ui/popover.tsx src/components/ui/command.tsx package.json pnpm-lock.yaml
git commit -m "feat(ui): shadcn primitives (dropdown, dialog, sheet, tooltip, popover, command)"
```

---

### Task 10: side-nav-item

**Files:**
- Create: `src/components/layouts/nav/side-nav-item.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { ComponentType, SVGProps } from "react";
import { cn } from "@/lib/utils/cn";

interface Props {
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  active: boolean;
  collapsed: boolean;
  onClick?: () => void;
}

export function SideNavItem({ label, href, icon: Icon, active, collapsed, onClick }: Props) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-600 transition-colors",
        active
          ? "bg-[var(--role-accent)] text-[var(--color-ink)]"
          : "text-[var(--color-ink)]/70 hover:bg-[var(--role-accent)]/40 hover:text-[var(--color-ink)]",
      )}
    >
      {active ? (
        <motion.span
          layoutId="side-nav-active"
          className="absolute inset-0 rounded-xl bg-[var(--role-accent)]"
          transition={{ type: "spring", stiffness: 400, damping: 34 }}
        />
      ) : null}
      <Icon className="relative z-10 size-5 shrink-0" strokeWidth={1.75} />
      <motion.span
        initial={false}
        animate={{ opacity: collapsed ? 0 : 1, x: collapsed ? -4 : 0 }}
        transition={{ duration: 0.18 }}
        className={cn(
          "relative z-10 truncate",
          collapsed && "pointer-events-none",
        )}
      >
        {label}
      </motion.span>
    </Link>
  );
}
```

- [ ] **Step 2: Verify utils/cn exists**

Run: `grep -l "export.*cn" src/lib/utils/` — if missing, create `src/lib/utils/cn.ts`:

```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/layouts/nav/side-nav-item.tsx src/lib/utils/cn.ts
git commit -m "feat(ui): side-nav-item with layoutId spring indicator"
```

---

### Task 11: side-nav (desktop 240↔64 collapse)

**Files:**
- Create: `src/components/layouts/nav/side-nav.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useState } from "react";
import type { NavItem } from "@/config/nav-items.brand";
import { SideNavItem } from "./side-nav-item";

interface Props {
  items: NavItem[];
  homeHref: string;
  bottomSlot?: React.ReactNode;
}

const EXPANDED = 240;
const COLLAPSED = 64;

function isItemActive(pathname: string, href: string): boolean {
  if (href === pathname) return true;
  // Exact prefix match with boundary (avoid /brand matching /brands)
  return pathname === href || pathname.startsWith(href + "/");
}

export function SideNav({ items, homeHref, bottomSlot }: Props) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? COLLAPSED : EXPANDED }}
      transition={{ type: "spring", stiffness: 320, damping: 32 }}
      className="sticky top-0 hidden h-screen shrink-0 flex-col border-r border-[var(--color-ink)]/8 bg-[var(--color-paper)] lg:flex"
      aria-label="Primary navigation"
    >
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-[var(--color-ink)]/8 px-4">
        <Link href={homeHref} className="flex items-center gap-2">
          <Image
            src="/images/logo-dark.png"
            alt="Faiceoff"
            width={140}
            height={40}
            priority
            className="h-6 w-auto"
          />
        </Link>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="ml-auto flex size-9 items-center justify-center rounded-lg text-[var(--color-ink)]/60 hover:bg-[var(--color-ink)]/5 hover:text-[var(--color-ink)]"
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
        {items.map((item) => (
          <SideNavItem
            key={item.href}
            label={item.label}
            href={item.href}
            icon={item.icon}
            active={isItemActive(pathname, item.href)}
            collapsed={collapsed}
          />
        ))}
      </nav>

      {bottomSlot ? (
        <div className="shrink-0 border-t border-[var(--color-ink)]/8 p-3">{bottomSlot}</div>
      ) : null}
    </motion.aside>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/layouts/nav/side-nav.tsx
git commit -m "feat(ui): side-nav with spring collapse (240↔64px)"
```

---

### Task 12: mobile-bottom-nav

**Files:**
- Create: `src/components/layouts/nav/mobile-bottom-nav.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import type { NavItem } from "@/config/nav-items.brand";
import { cn } from "@/lib/utils/cn";

interface Props {
  items: NavItem[];
}

function isItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

export function MobileBottomNav({ items }: Props) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main navigation"
      role="navigation"
      className="sticky bottom-0 z-30 grid grid-flow-col auto-cols-fr gap-0 border-t border-[var(--color-ink)]/10 bg-[var(--color-paper)]/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md lg:hidden"
    >
      {items.map((item) => {
        const active = isItemActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-lg py-1 text-[10px] font-600 tracking-wide transition-colors",
              active ? "text-[var(--color-ink)]" : "text-[var(--color-ink)]/50",
            )}
          >
            {active ? (
              <motion.span
                layoutId="mobile-nav-indicator"
                className="absolute inset-1 rounded-lg bg-[var(--role-accent)]"
                transition={{ type: "spring", stiffness: 420, damping: 36 }}
              />
            ) : null}
            <Icon className="relative z-10 size-5" strokeWidth={1.75} />
            <span className="relative z-10">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/layouts/nav/mobile-bottom-nav.tsx
git commit -m "feat(ui): mobile bottom nav with layoutId indicator + safe-area"
```

---

### Task 13: mobile-nav-drawer

**Files:**
- Create: `src/components/layouts/nav/mobile-nav-drawer.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import type { NavItem } from "@/config/nav-items.brand";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils/cn";
import { useState } from "react";

interface Props {
  items: NavItem[];
  homeHref: string;
  roleLabel: string;
}

function isItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

export function MobileNavDrawer({ items, homeHref, roleLabel }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Open navigation"
          className="flex size-11 items-center justify-center rounded-lg text-[var(--color-ink)]/70 hover:bg-[var(--color-ink)]/5 hover:text-[var(--color-ink)] lg:hidden"
        >
          <Menu className="size-5" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-80 bg-[var(--color-paper)]">
        <SheetHeader>
          <SheetTitle className="font-outfit text-lg font-700">{roleLabel}</SheetTitle>
        </SheetHeader>
        <nav className="mt-4 flex flex-col gap-1" aria-label="Main navigation">
          {items.map((item) => {
            const active = isItemActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-12 items-center gap-3 rounded-xl px-3 text-sm font-600",
                  active
                    ? "bg-[var(--role-accent)] text-[var(--color-ink)]"
                    : "text-[var(--color-ink)]/70 hover:bg-[var(--role-accent)]/40",
                )}
              >
                <Icon className="size-5" strokeWidth={1.75} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/layouts/nav/mobile-nav-drawer.tsx
git commit -m "feat(ui): mobile nav drawer (Sheet-based, role-themed)"
```

---

## Phase 5 — Top bar + overlays

### Task 14: top-bar

**Files:**
- Create: `src/components/layouts/nav/top-bar.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { MobileNavDrawer } from "./mobile-nav-drawer";
import type { NavItem } from "@/config/nav-items.brand";

interface Props {
  items: NavItem[];
  homeHref: string;
  roleLabel: string;
  startSlot?: ReactNode;
  endSlot?: ReactNode;
}

export function TopBar({ items, homeHref, roleLabel, startSlot, endSlot }: Props) {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-[var(--color-ink)]/8 bg-[var(--color-paper)]/90 px-3 backdrop-blur-md lg:px-6">
      <MobileNavDrawer items={items} homeHref={homeHref} roleLabel={roleLabel} />

      <Link href={homeHref} className="flex items-center lg:hidden">
        <Image
          src="/images/logo-dark.png"
          alt="Faiceoff"
          width={120}
          height={36}
          priority
          className="h-5 w-auto"
        />
      </Link>

      <div className="flex flex-1 items-center gap-2">{startSlot}</div>
      <div className="flex items-center gap-1">{endSlot}</div>
    </header>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/layouts/nav/top-bar.tsx
git commit -m "feat(ui): top-bar (56px sticky header w/ mobile drawer trigger)"
```

---

### Task 15: user-menu

**Files:**
- Create: `src/components/layouts/nav/user-menu.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { LogOut, Settings, LifeBuoy, User as UserIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/components/providers/auth-provider";
import { useState } from "react";

interface Props {
  role: "brand" | "creator" | "admin";
}

export function UserMenu({ role }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const displayName =
    user?.user_metadata?.display_name ?? user?.email?.split("@")[0] ?? "";
  const initial = displayName ? displayName.charAt(0).toUpperCase() : "·";

  const settingsHref =
    role === "admin" ? "/admin" : role === "brand" ? "/brand/settings" : "/creator/settings";
  const profileHref = role === "brand" ? "/brand/settings" : "/creator/settings";

  async function handleSignOut() {
    setSigningOut(true);
    await fetch("/api/auth/sign-out", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Open user menu"
          className="flex size-9 items-center justify-center rounded-full bg-[var(--role-accent)] text-sm font-700 uppercase text-[var(--color-ink)] hover:bg-[var(--role-accent-strong)]/60"
        >
          {initial}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="text-sm font-600 text-[var(--color-ink)]">{displayName || "Account"}</span>
            <span className="text-xs text-[var(--color-ink)]/60 capitalize">{role}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={profileHref}>
            <UserIcon className="mr-2 size-4" />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={settingsHref}>
            <Settings className="mr-2 size-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/contact">
            <LifeBuoy className="mr-2 size-4" />
            Help
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleSignOut} disabled={signingOut}>
          <LogOut className="mr-2 size-4" />
          {signingOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/layouts/nav/user-menu.tsx
git commit -m "feat(ui): user-menu dropdown with role-aware links"
```

---

### Task 16: notifications-popover (stub)

**Files:**
- Create: `src/components/layouts/nav/notifications-popover.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { Bell } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

export function NotificationsPopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Notifications"
          className="relative flex size-9 items-center justify-center rounded-lg text-[var(--color-ink)]/70 hover:bg-[var(--color-ink)]/5 hover:text-[var(--color-ink)]"
        >
          <Bell className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <p className="text-sm font-600 text-[var(--color-ink)]">Notifications</p>
        <p className="mt-4 text-center text-sm text-[var(--color-ink)]/60">
          You're all caught up.
        </p>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/layouts/nav/notifications-popover.tsx
git commit -m "feat(ui): notifications-popover stub (populated in Chunk D)"
```

---

### Task 17: command-palette (⌘K)

**Files:**
- Create: `src/components/layouts/nav/command-palette.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { NavItem } from "@/config/nav-items.brand";

interface Props {
  items: NavItem[];
}

export function CommandPalette({ items }: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function handleSelect(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <>
      <button
        type="button"
        aria-label="Search (⌘K)"
        onClick={() => setOpen(true)}
        className="hidden h-9 items-center gap-2 rounded-lg border border-[var(--color-ink)]/10 bg-[var(--color-paper)] px-3 text-sm text-[var(--color-ink)]/50 hover:border-[var(--color-ink)]/20 lg:flex"
      >
        <Search className="size-4" />
        Search
        <kbd className="ml-4 rounded border border-[var(--color-ink)]/15 bg-[var(--color-ink)]/5 px-1.5 py-0.5 text-[10px] font-mono">
          ⌘K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0">
          <Command>
            <CommandInput placeholder="Search pages, creators, licenses…" />
            <CommandList>
              <CommandEmpty>No results.</CommandEmpty>
              <CommandGroup heading="Navigate">
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <CommandItem
                      key={item.href}
                      onSelect={() => handleSelect(item.href)}
                    >
                      <Icon className="mr-2 size-4" />
                      {item.label}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/layouts/nav/command-palette.tsx
git commit -m "feat(ui): command palette (⌘K toggle, nav shortcuts)"
```

---

### Task 18: skip-to-content

**Files:**
- Create: `src/components/layouts/nav/skip-to-content.tsx`

- [ ] **Step 1: Write the component**

```tsx
export function SkipToContent() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-[var(--color-ink)] focus:px-4 focus:py-2 focus:text-sm focus:font-600 focus:text-[var(--color-paper)]"
    >
      Skip to content
    </a>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/layouts/nav/skip-to-content.tsx
git commit -m "feat(a11y): skip-to-content link"
```

---

## Phase 6 — Shell layouts

### Task 19: brand-shell

**Files:**
- Create: `src/components/layouts/brand-shell.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { RoleThemeProvider } from "./brand-kit/role-theme-provider";
import { SideNav } from "./nav/side-nav";
import { MobileBottomNav } from "./nav/mobile-bottom-nav";
import { TopBar } from "./nav/top-bar";
import { UserMenu } from "./nav/user-menu";
import { NotificationsPopover } from "./nav/notifications-popover";
import { CommandPalette } from "./nav/command-palette";
import { SkipToContent } from "./nav/skip-to-content";
import { BRAND_SIDE_NAV, BRAND_MOBILE_NAV } from "@/config/nav-items.brand";

interface Props {
  children: ReactNode;
}

export function BrandShell({ children }: Props) {
  const pathname = usePathname();

  return (
    <RoleThemeProvider role="brand">
      <SkipToContent />
      <div className="flex min-h-screen bg-[var(--color-paper)]">
        <SideNav items={BRAND_SIDE_NAV} homeHref="/brand/dashboard" />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            items={BRAND_MOBILE_NAV}
            homeHref="/brand/dashboard"
            roleLabel="Brand"
            startSlot={<CommandPalette items={BRAND_SIDE_NAV} />}
            endSlot={
              <>
                <NotificationsPopover />
                <UserMenu role="brand" />
              </>
            }
          />
          <main
            id="main-content"
            className="flex-1 overflow-x-hidden px-4 pb-20 pt-6 lg:px-8 lg:pb-8"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={pathname}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] as const }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </main>
          <MobileBottomNav items={BRAND_MOBILE_NAV} />
        </div>
      </div>
    </RoleThemeProvider>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/layouts/brand-shell.tsx
git commit -m "feat(layout): brand-shell (ocean, side nav + bottom nav + AnimatePresence)"
```

---

### Task 20: creator-shell

**Files:**
- Create: `src/components/layouts/creator-shell.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { RoleThemeProvider } from "./brand-kit/role-theme-provider";
import { SideNav } from "./nav/side-nav";
import { MobileBottomNav } from "./nav/mobile-bottom-nav";
import { TopBar } from "./nav/top-bar";
import { UserMenu } from "./nav/user-menu";
import { NotificationsPopover } from "./nav/notifications-popover";
import { CommandPalette } from "./nav/command-palette";
import { SkipToContent } from "./nav/skip-to-content";
import { CREATOR_SIDE_NAV, CREATOR_MOBILE_NAV } from "@/config/nav-items.creator";

interface Props {
  children: ReactNode;
}

export function CreatorShell({ children }: Props) {
  const pathname = usePathname();

  return (
    <RoleThemeProvider role="creator">
      <SkipToContent />
      <div className="flex min-h-screen bg-[var(--color-paper)]">
        <SideNav items={CREATOR_SIDE_NAV} homeHref="/creator/dashboard" />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            items={CREATOR_MOBILE_NAV}
            homeHref="/creator/dashboard"
            roleLabel="Creator"
            startSlot={<CommandPalette items={CREATOR_SIDE_NAV} />}
            endSlot={
              <>
                <NotificationsPopover />
                <UserMenu role="creator" />
              </>
            }
          />
          <main
            id="main-content"
            className="flex-1 overflow-x-hidden px-4 pb-20 pt-6 lg:px-8 lg:pb-8"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={pathname}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] as const }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </main>
          <MobileBottomNav items={CREATOR_MOBILE_NAV} />
        </div>
      </div>
    </RoleThemeProvider>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/layouts/creator-shell.tsx
git commit -m "feat(layout): creator-shell (blush theme variant)"
```

---

### Task 21: admin-shell

**Files:**
- Create: `src/components/layouts/admin-shell.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import type { ReactNode } from "react";
import { RoleThemeProvider } from "./brand-kit/role-theme-provider";
import { SideNav } from "./nav/side-nav";
import { TopBar } from "./nav/top-bar";
import { UserMenu } from "./nav/user-menu";
import { NotificationsPopover } from "./nav/notifications-popover";
import { CommandPalette } from "./nav/command-palette";
import { SkipToContent } from "./nav/skip-to-content";
import { ADMIN_SIDE_NAV } from "@/config/nav-items.admin";

interface Props {
  children: ReactNode;
}

export function AdminShell({ children }: Props) {
  return (
    <RoleThemeProvider role="admin">
      <SkipToContent />
      <div className="flex min-h-screen bg-[var(--color-paper)]">
        <SideNav items={ADMIN_SIDE_NAV} homeHref="/admin" />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            items={ADMIN_SIDE_NAV}
            homeHref="/admin"
            roleLabel="Admin"
            startSlot={<CommandPalette items={ADMIN_SIDE_NAV} />}
            endSlot={
              <>
                <NotificationsPopover />
                <UserMenu role="admin" />
              </>
            }
          />
          <main id="main-content" className="flex-1 overflow-x-hidden px-4 py-6 lg:px-8">
            {children}
          </main>
        </div>
      </div>
    </RoleThemeProvider>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/layouts/admin-shell.tsx
git commit -m "feat(layout): admin-shell (neutral theme, no bottom nav)"
```

---

### Task 22: onboarding-shell

**Files:**
- Create: `src/components/layouts/onboarding-shell.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { RoleThemeProvider } from "./brand-kit/role-theme-provider";
import type { Role } from "@/config/routes";

interface Props {
  role: Exclude<Role, "admin">;
  step: number;
  totalSteps: number;
  onSaveExit?: () => void;
  children: ReactNode;
}

export function OnboardingShell({ role, step, totalSteps, onSaveExit, children }: Props) {
  const pct = Math.max(0, Math.min(100, (step / totalSteps) * 100));
  return (
    <RoleThemeProvider role={role}>
      <div className="flex min-h-screen flex-col bg-[var(--color-paper)]">
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-4 border-b border-[var(--color-ink)]/8 bg-[var(--color-paper)]/90 px-4 backdrop-blur-md lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/images/logo-dark.png" alt="Faiceoff" width={120} height={36} priority className="h-5 w-auto" />
          </Link>
          <div className="flex flex-1 items-center gap-3">
            <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-ink)]/8">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] as const }}
                className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-gold,#c9a96e)]"
              />
            </div>
            <span className="shrink-0 text-xs font-600 tabular-nums text-[var(--color-ink)]/60">
              {step} of {totalSteps}
            </span>
          </div>
          {onSaveExit ? (
            <button
              type="button"
              onClick={onSaveExit}
              className="text-xs font-600 text-[var(--color-ink)]/60 hover:text-[var(--color-ink)]"
            >
              Save & exit
            </button>
          ) : null}
        </header>

        <main className="flex flex-1 flex-col items-center px-4 py-8 lg:py-14">
          <div className="w-full max-w-[720px]">{children}</div>
        </main>
      </div>
    </RoleThemeProvider>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/layouts/onboarding-shell.tsx
git commit -m "feat(layout): onboarding-shell (progress bar, centered 720px card)"
```

---

## Phase 7 — Brand route tree

### Task 23: Brand layout + route stubs

**Files:**
- Create: all files under `src/app/brand/` (layout + 18 page stubs listed in File Structure)

- [ ] **Step 1: Create `src/app/brand/layout.tsx`**

```tsx
import type { ReactNode } from "react";
import { BrandShell } from "@/components/layouts/brand-shell";

export default function BrandLayout({ children }: { children: ReactNode }) {
  return <BrandShell>{children}</BrandShell>;
}
```

- [ ] **Step 2: Create a stub helper component**

Create `src/components/layouts/stub-page.tsx`:

```tsx
import type { ReactNode } from "react";
import { PageTitle } from "./brand-kit/page-title";

interface Props {
  title: string;
  description: string;
  children?: ReactNode;
}

export function StubPage({ title, description, children }: Props) {
  return (
    <div>
      <PageTitle subtitle={description}>{title}</PageTitle>
      <div className="rounded-2xl border border-dashed border-[var(--color-ink)]/15 bg-[var(--color-paper)] p-10 text-center">
        <p className="text-sm font-600 text-[var(--color-ink)]/60">
          This page is scaffolded in Chunk B. Feature content ships in Chunk D.
        </p>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create all brand pages as stubs**

Each page file follows this pattern. Create every path listed in the File Structure for `src/app/brand/`:

Example `src/app/brand/dashboard/page.tsx`:

```tsx
import { StubPage } from "@/components/layouts/stub-page";

export default function BrandDashboardPage() {
  return (
    <StubPage
      title="Dashboard"
      description="Your marketplace at a glance — credits, active licenses, and recent activity."
    />
  );
}
```

Titles/descriptions for each path (use exactly these — consistent copy):

| Path | Title | Description |
|---|---|---|
| `/brand/dashboard` | Dashboard | Your marketplace at a glance — credits, active licenses, and recent activity. |
| `/brand/onboarding` | Set up your brand | Five quick steps to get your account ready. |
| `/brand/onboarding/[step]` | Set up your brand | Step details load here. |
| `/brand/credits` | Credits | Balance, top-ups, and transaction history. |
| `/brand/credits/top-up` | Top up credits | Choose a pack and pay via Cashfree. |
| `/brand/creators` | Creators | Discover AI-likeness creators you can collaborate with. |
| `/brand/creators/[id]` | Creator profile | Samples, offerings, and stats. |
| `/brand/licenses` | Licenses | Active, pending, and past license requests. |
| `/brand/licenses/new` | Request a license | Pick a creator and a template to begin. |
| `/brand/licenses/[id]` | License | Chat, contract, and image gallery for this license. |
| `/brand/sessions` | Sessions | Collaboration sessions bundling licenses. |
| `/brand/sessions/[id]` | Session | Licenses and generations under this session. |
| `/brand/settings` | Settings | Company, billing, team, and API keys. |
| `/brand/settings/billing` | Billing | Invoices, GSTIN, tax documents. |
| `/brand/settings/team` | Team | Add teammates. (Coming soon) |
| `/brand/settings/api-keys` | API keys | Developer access tokens. (Coming soon) |

For onboarding wrap with OnboardingShell:

`src/app/brand/onboarding/layout.tsx`:

```tsx
import type { ReactNode } from "react";

// OnboardingShell is a client component; a thin server wrapper keeps the
// layout file itself a Server Component so metadata can be set if needed.
export default function BrandOnboardingLayout({ children }: { children: ReactNode }) {
  return children;
}
```

`src/app/brand/onboarding/page.tsx`:

```tsx
"use client";

import { OnboardingShell } from "@/components/layouts/onboarding-shell";

export default function BrandOnboardingPage() {
  return (
    <OnboardingShell role="brand" step={1} totalSteps={5}>
      <h1 className="font-outfit text-2xl font-700">Welcome to Faiceoff</h1>
      <p className="mt-2 text-sm text-[var(--color-ink)]/60">
        Five quick steps to set up your brand account. Detailed flow ships in Chunk D.
      </p>
    </OnboardingShell>
  );
}
```

`src/app/brand/onboarding/[step]/page.tsx` uses the same pattern with `params.step` converted to a number.

- [ ] **Step 4: Run build**

Run: `pnpm build`
Expected: PASS — all 18 brand routes build without error.

- [ ] **Step 5: Commit**

```bash
git add src/app/brand/ src/components/layouts/stub-page.tsx
git commit -m "feat(brand): /brand/* route tree with stubs + BrandShell"
```

---

## Phase 8 — Creator route tree

### Task 24: Creator layout + route stubs

**Files:**
- Create: all files under `src/app/creator/` (layout + 21 page stubs)

- [ ] **Step 1: Create `src/app/creator/layout.tsx`**

```tsx
import type { ReactNode } from "react";
import { CreatorShell } from "@/components/layouts/creator-shell";

export default function CreatorLayout({ children }: { children: ReactNode }) {
  return <CreatorShell>{children}</CreatorShell>;
}
```

- [ ] **Step 2: Create all creator pages as stubs**

Same StubPage pattern. Titles/descriptions:

| Path | Title | Description |
|---|---|---|
| `/creator/dashboard` | Dashboard | Earnings, pending requests, and upcoming approvals. |
| `/creator/onboarding` | Set up your profile | Seven steps — likeness, consent, categories, listings, KYC. |
| `/creator/onboarding/[step]` | Set up your profile | Step details load here. |
| `/creator/listings` | Listings | Your licensing offers (Creation / Promotion). |
| `/creator/listings/new` | New listing | Set your price and terms. |
| `/creator/listings/[id]` | Edit listing | Adjust price, quota, or validity. |
| `/creator/requests` | Requests | Incoming license requests from brands. |
| `/creator/requests/[id]` | Request | Review terms and sign the contract. |
| `/creator/sessions` | Sessions | Active collabs with brands. |
| `/creator/sessions/[id]` | Session | Licenses, generations, and history. |
| `/creator/approvals` | Approvals | Review generated images before they go live. |
| `/creator/approvals/[id]` | Approval | Single image review. |
| `/creator/earnings` | Earnings | Balance, pending, and withdrawal history. |
| `/creator/earnings/withdraw` | Withdraw | Move your balance to your bank. |
| `/creator/kyc` | KYC | PAN, Aadhaar, and bank account verification. |
| `/creator/reference-photos` | Reference photos | Manage your likeness gallery. |
| `/creator/settings` | Settings | Profile, bio, availability. |
| `/creator/settings/notifications` | Notifications | Email and push preferences. |

Onboarding wraps with `OnboardingShell role="creator" step={1} totalSteps={7}`.

- [ ] **Step 3: Run build**

Run: `pnpm build`
Expected: PASS — all creator routes build.

- [ ] **Step 4: Commit**

```bash
git add src/app/creator/
git commit -m "feat(creator): /creator/* route tree with stubs + CreatorShell"
```

---

## Phase 9 — Admin + public utility tree

### Task 25: Admin layout + stubs

**Files:**
- Create: all files under `src/app/admin/`

- [ ] **Step 1: Create `src/app/admin/layout.tsx`**

```tsx
import type { ReactNode } from "react";
import { AdminShell } from "@/components/layouts/admin-shell";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
```

- [ ] **Step 2: Create all admin pages as stubs**

Same `StubPage` pattern with these titles:

| Path | Title | Description |
|---|---|---|
| `/admin` | Admin | Ops metrics, queues, and ledger health. |
| `/admin/disputes` | Disputes | All open disputes. |
| `/admin/disputes/[id]` | Dispute | Full context with ledger linkage. |
| `/admin/ledgers` | Ledgers | Drill-down into credit / escrow / tax entries. |
| `/admin/reconcile` | Reconcile | Cashfree reconciliation queue status. |
| `/admin/users` | Users | Brand / creator / admin accounts. |
| `/admin/users/[id]` | User | Role, KYC, and impersonation controls. |
| `/admin/contracts` | Contracts | Contract template management. |
| `/admin/audit-log` | Audit log | Event history. |

- [ ] **Step 3: Run build**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/
git commit -m "feat(admin): /admin/* route tree with stubs + AdminShell"
```

---

### Task 26: Public utility tree (`/u/*`)

**Files:**
- Create: `src/app/u/layout.tsx`, `src/app/u/generations/[id]/page.tsx`, `src/app/u/profile/[creator_id]/page.tsx`

- [ ] **Step 1: Create `src/app/u/layout.tsx`**

```tsx
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export default function UtilityLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-paper)]">
      <header className="flex h-14 shrink-0 items-center border-b border-[var(--color-ink)]/8 bg-[var(--color-paper)] px-4 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/images/logo-dark.png" alt="Faiceoff" width={120} height={36} priority className="h-5 w-auto" />
        </Link>
      </header>
      <main id="main-content" className="flex-1 px-4 py-8 lg:px-8">{children}</main>
      <footer className="border-t border-[var(--color-ink)]/8 px-4 py-5 text-xs text-[var(--color-ink)]/50 lg:px-8">
        © Faiceoff — a house for licensed likeness.
      </footer>
    </div>
  );
}
```

- [ ] **Step 2: Create stubs**

`src/app/u/generations/[id]/page.tsx`:

```tsx
export default async function PublicGenerationPreview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-outfit text-2xl font-700">Generation preview</h1>
      <p className="mt-2 text-sm text-[var(--color-ink)]/60">Public, watermarked preview ships in Chunk D. ID: <code>{id}</code></p>
    </div>
  );
}
```

`src/app/u/profile/[creator_id]/page.tsx`:

```tsx
export default async function PublicCreatorProfile({ params }: { params: Promise<{ creator_id: string }> }) {
  const { creator_id } = await params;
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-outfit text-2xl font-700">Creator profile</h1>
      <p className="mt-2 text-sm text-[var(--color-ink)]/60">Public profile page ships in Chunk D. Creator: <code>{creator_id}</code></p>
    </div>
  );
}
```

- [ ] **Step 3: Run build**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/u/
git commit -m "feat(public): /u/* utility routes (generation preview, creator profile)"
```

---

## Phase 10 — A11y + motion CSS tweaks

### Task 27: globals.css reduced-motion + safe-area utilities

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Add reduced-motion + safe-area utilities**

Append to `src/app/globals.css` (check first — skip sections already present):

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 150ms !important;
    scroll-behavior: auto !important;
  }
}

/* Plain utility classes — Tailwind v4 consumes them at the top level */
.safe-bottom {
  padding-bottom: max(1rem, env(safe-area-inset-bottom));
}
.safe-top {
  padding-top: max(0px, env(safe-area-inset-top));
}
```

- [ ] **Step 2: Add viewport-fit=cover to root layout**

In `src/app/layout.tsx`, add inside `<head>` via Next's `viewport` export:

```typescript
import type { Metadata, Viewport } from "next";

// …existing metadata…

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};
```

Place the `Viewport` export right after `metadata`. Do not remove anything.

- [ ] **Step 3: Run build**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "feat(a11y): reduced-motion + safe-area utilities + viewport-fit"
```

---

## Phase 11 — Playwright end-to-end

### Task 28: Playwright role redirect tests

**Files:**
- Create: `tests/e2e/role-redirects.spec.ts`
- Create: `tests/e2e/legacy-308.spec.ts`
- Create: `tests/e2e/mobile-nav.spec.ts`

- [ ] **Step 1: Verify Playwright config present**

Run: `ls playwright.config.ts 2>&1 || ls tests/` — confirm Playwright is already configured. If missing, create a minimal `playwright.config.ts`:

```typescript
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  use: {
    baseURL: "http://localhost:3000",
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "iphone-se", use: { ...devices["iPhone SE (3rd gen)"] } },
  ],
});
```

- [ ] **Step 2: Write `tests/e2e/role-redirects.spec.ts`**

```typescript
import { test, expect } from "@playwright/test";

// NOTE: these tests assume a seeded brand user + creator user exist with
// known credentials supplied via env. If the project uses OTP-only auth,
// bypass via the /api/auth/test-login endpoint (add a short seed script or
// skip with test.skip() if the endpoint is not available in dev).

test.describe("role-aware redirects", () => {
  test("anon visiting /brand/dashboard redirects to /login", async ({ page }) => {
    await page.goto("/brand/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("anon visiting /creator/dashboard redirects to /login", async ({ page }) => {
    await page.goto("/creator/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("anon visiting /admin redirects to /login", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
  });

  test("anon visiting / does not redirect", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL("http://localhost:3000/");
  });

  test("anon visiting /u/generations/abc does not redirect", async ({ page }) => {
    await page.goto("/u/generations/abc");
    await expect(page).toHaveURL(/\/u\/generations\/abc/);
  });
});
```

- [ ] **Step 3: Write `tests/e2e/legacy-308.spec.ts`**

```typescript
import { test, expect } from "@playwright/test";

test.describe("legacy /dashboard/* redirects (anon)", () => {
  test("/dashboard redirects to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("/dashboard/campaigns redirects to /login", async ({ page }) => {
    await page.goto("/dashboard/campaigns");
    await expect(page).toHaveURL(/\/login/);
  });

  // Response-level assertion via request context
  test("308 status on legacy path (via request)", async ({ request }) => {
    const res = await request.get("/dashboard/wallet", { maxRedirects: 0 });
    // anon case: proxy sends to /login with 307; seeded user would get 308.
    expect([307, 308]).toContain(res.status());
  });
});
```

- [ ] **Step 4: Write `tests/e2e/mobile-nav.spec.ts`**

```typescript
import { test, expect, devices } from "@playwright/test";

test.use({ ...devices["iPhone SE (3rd gen)"] });

test.describe("mobile viewport — anon entry points", () => {
  test("landing page renders without horizontal scroll", async ({ page }) => {
    await page.goto("/");
    const docWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(docWidth).toBeLessThanOrEqual(clientWidth + 1); // allow 1px rounding
  });

  test("login page has viewport-fit cover and 44px tap targets", async ({ page }) => {
    await page.goto("/login");
    // viewport meta
    const viewportMeta = await page.locator('meta[name="viewport"]').getAttribute("content");
    expect(viewportMeta).toContain("viewport-fit=cover");
    // any visible button ≥ 44px tall
    const buttons = page.locator("button:visible");
    const count = await buttons.count();
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        const box = await buttons.nth(i).boundingBox();
        if (box) expect(box.height).toBeGreaterThanOrEqual(40); // allow small margin
      }
    }
  });
});
```

- [ ] **Step 5: Run Playwright**

Run: `pnpm playwright test`
Expected: PASS on chromium-desktop + iphone-se projects. Tests needing auth will skip cleanly if test credentials aren't wired.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/ playwright.config.ts
git commit -m "test(e2e): Playwright role redirects + legacy 308 + mobile viewport"
```

---

## Phase 12 — Soft cutover & cleanup

### Task 29: Update internal links

**Files:**
- Modify: `src/app/(marketing)/page.tsx` and any file containing `/dashboard/` as a string literal

- [ ] **Step 1: Find every literal `/dashboard/` reference**

Run: Grep tool with pattern `"/dashboard"` (content mode) across `src/` and list files. Report count.

Expected: a handful of files — marketing CTAs, the `(dashboard)/layout.tsx` mobile topbar logo link, auth-provider `/dashboard` post-login redirect, etc.

- [ ] **Step 2: Replace context-appropriate references**

For each hit:
- If the code knows the role (has access to `useAuth().role`), change to `/${role}/dashboard` — or use `getRoleHome(role)` from `@/config/routes`.
- If it's a static "go to dashboard" link without role context (e.g., marketing page footer), change to `/login` (middleware bounces to role home automatically once logged in).
- The legacy `src/app/(dashboard)/*` tree — DO NOT edit. It stays for the 90-day soft cutover (middleware 308-redirects anyone who hits it).

- [ ] **Step 3: Run build + typecheck**

Run: `pnpm tsc --noEmit && pnpm build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(routes): swap internal /dashboard/* links for role-aware paths"
```

---

### Task 30: Deprecate legacy dashboard layout (soft — no deletion)

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Add banner at top of legacy layout**

At the top of the legacy `SidebarContent` component, insert a small dismissable banner that tells users the site has moved:

```tsx
// Banner shown above the legacy sidebar during soft cutover
<div className="mx-3 mb-3 rounded-lg border border-[var(--color-gold,#c9a96e)]/40 bg-[var(--color-gold,#c9a96e)]/10 p-2.5 text-xs text-white/80">
  We've moved — new URLs at <code>/brand/*</code> and <code>/creator/*</code>. This view will retire in 90 days.
</div>
```

Keep the rest of the legacy layout untouched so the middleware-driven 308 redirects are the primary path.

- [ ] **Step 2: Run build**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/layout.tsx
git commit -m "chore(legacy): banner in (dashboard) shell during soft cutover"
```

---

## Phase 13 — Final verification

### Task 31: Full suite + manual smoke

- [ ] **Step 1: Run everything**

Run:
```bash
pnpm tsc --noEmit
pnpm vitest run
pnpm playwright test
pnpm build
```

Expected: all green.

- [ ] **Step 2: Manual smoke (document the test matrix)**

Create `docs/superpowers/runbooks/chunk-b-verification.md` with a checklist the next operator can follow:

```markdown
# Chunk B verification checklist

Run after deploy, before enabling for real users.

## Anonymous
- [ ] `/` loads, logo links to `/`
- [ ] `/login` renders, no redirect loop
- [ ] `/brand/dashboard` → 307 to `/login?redirect=%2Fbrand%2Fdashboard`
- [ ] `/creator/dashboard` → 307 to `/login?redirect=%2Fcreator%2Fdashboard`
- [ ] `/dashboard` → 307 to `/login` (legacy → auth)
- [ ] `/u/generations/abc` loads without auth

## Brand user (seeded)
- [ ] After login, lands on `/brand/dashboard`
- [ ] Visits `/creator/dashboard` → silently redirects to `/brand/dashboard`
- [ ] Visits `/admin` → silently redirects to `/brand/dashboard`
- [ ] Visits `/dashboard/campaigns` → 308 to `/brand/sessions`
- [ ] Visits `/dashboard/wallet` → 308 to `/brand/credits`

## Creator user (seeded)
- [ ] After login, lands on `/creator/dashboard`
- [ ] Visits `/brand/dashboard` → silently redirects to `/creator/dashboard`
- [ ] Visits `/dashboard/approvals` → 308 to `/creator/approvals`
- [ ] Visits `/dashboard/wallet` → 308 to `/creator/earnings`

## Mobile (iPhone SE viewport, DevTools throttle 4G)
- [ ] No horizontal scroll on `/brand/dashboard`
- [ ] Bottom nav visible, 5 tabs, safe-area respected
- [ ] Hamburger opens drawer, ESC closes it
- [ ] All tap targets ≥ 44px

## Accessibility
- [ ] Tab through side nav — focus ring visible
- [ ] Activate `⌘K` — command palette opens
- [ ] Skip-to-content link appears on first Tab
- [ ] `prefers-reduced-motion: reduce` — transitions collapse to fade
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/runbooks/chunk-b-verification.md
git commit -m "docs(runbook): Chunk B verification checklist"
```

---

## Done when

1. All 31 tasks complete and committed
2. `pnpm tsc --noEmit`, `pnpm vitest run`, `pnpm playwright test`, `pnpm build` all green
3. Seeded brand user lands on `/brand/dashboard` after login; seeded creator lands on `/creator/dashboard`
4. Legacy `/dashboard/*` paths 308-redirect correctly for both roles
5. Mobile viewport (iPhone SE) has no horizontal scroll and the bottom nav is tappable
6. Verification checklist ticked by the next operator

> **After Chunk B:** page content is still stubs. Chunk D will populate every `StubPage` with real UI and data fetches. The route scaffolding, theming, and navigation delivered here are the foundation those features build on.
