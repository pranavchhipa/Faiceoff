import type { Role } from "./routes";

interface Rule {
  /** regex matching the legacy pathname */
  match: RegExp;
  /** builder → returns new pathname for given role, or null if role not applicable */
  resolve: (m: RegExpMatchArray, role: Role) => string | null;
}

// All targets in this map MUST point to a page that actually exists in
// `src/app/(dashboard)/{brand|creator|admin}/`. If the target doesn't exist,
// the user gets a 404 — fall back to `/${r}/dashboard` instead.
//
// Existing pages snapshot (keep in sync when adding/removing pages):
//   brand:   billing, credits, dashboard, discover, discover/[id], licenses,
//            licenses/[id], sessions, sessions/[id], settings, vault, wallet
//   creator: analytics, approvals, blocked-categories, collaborations,
//            dashboard, earnings, licenses, likeness, payouts, settings, withdraw
//   admin:   dashboard (alias), packs, safety, stuck-gens, plus / (overview)
//
// Several creator/brand pages (approvals, likeness, settings, analytics,
// collaborations) are thin re-export wrappers around role-aware pages that
// still live under /dashboard/*. The redirects below send legacy URLs to
// those wrappers so old bookmarks keep working.

const RULES: Rule[] = [
  // /dashboard root → role home (admin gets /admin, others get /${r}/dashboard)
  {
    match: /^\/dashboard\/?$/,
    resolve: (_m, r) => (r === "admin" ? "/admin" : `/${r}/dashboard`),
  },

  // Campaigns → brand: /brand/sessions, creator: /creator/collaborations
  {
    match: /^\/dashboard\/campaigns(?:\/(.+))?$/,
    resolve: (m, r) => {
      if (r === "brand") return m[1] ? `/brand/sessions/${m[1]}` : "/brand/sessions";
      if (r === "creator") return "/creator/collaborations";
      return `/${r}/dashboard`;
    },
  },
  {
    match: /^\/dashboard\/generations\/(.+)$/,
    resolve: (m, r) => (r === "brand" ? `/brand/sessions/${m[1]}` : `/${r}/dashboard`),
  },

  // Discover creators (brand only) — page lives at /brand/discover, NOT /brand/creators
  {
    match: /^\/dashboard\/creators(?:\/(.+))?$/,
    resolve: (m, r) => {
      if (r !== "brand") return `/${r}/dashboard`;
      return m[1] ? `/brand/discover/${m[1]}` : "/brand/discover";
    },
  },

  // Approvals → /creator/approvals (wrapper around dashboard/approvals)
  {
    match: /^\/dashboard\/approvals(?:\/(.+))?$/,
    resolve: (_m, r) => (r === "creator" ? "/creator/approvals" : `/${r}/dashboard`),
  },

  // Wallet → brand has /brand/wallet, creator has /creator/earnings
  {
    match: /^\/dashboard\/wallet\/?$/,
    resolve: (_m, r) => {
      if (r === "brand") return "/brand/wallet";
      if (r === "creator") return "/creator/earnings";
      return "/admin";
    },
  },

  // Onboarding pages still live under /dashboard/onboarding/* (not migrated yet)
  // — pass through unchanged.
  {
    match: /^\/dashboard\/onboarding(?:\/.*)?$/,
    resolve: () => null,
  },
  {
    match: /^\/dashboard\/brand-setup\/?$/,
    resolve: () => null,
  },

  // Likeness → /creator/likeness wrapper (creator-only page; the underlying
  // page renders a "this is for creators" notice for non-creators, so we
  // bounce brand/admin to their dashboards instead of mounting it there).
  {
    match: /^\/dashboard\/likeness\/?$/,
    resolve: (_m, r) => (r === "creator" ? "/creator/likeness" : r === "admin" ? "/admin" : "/brand/dashboard"),
  },

  // Settings → role-prefixed wrapper around the same role-aware page.
  {
    match: /^\/dashboard\/settings(?:\/.*)?$/,
    resolve: (_m, r) => {
      if (r === "creator") return "/creator/settings";
      if (r === "brand") return "/brand/settings";
      return "/admin";
    },
  },

  // Analytics → /creator/analytics (page is creator-focused; brand
  // analytics is a separate, future page).
  {
    match: /^\/dashboard\/analytics\/?$/,
    resolve: (_m, r) => (r === "creator" ? "/creator/analytics" : r === "admin" ? "/admin" : "/brand/dashboard"),
  },

  // Wildcard fallback — any other /dashboard/* goes to role home
  {
    match: /^\/dashboard\/.+$/,
    resolve: (_m, r) => (r === "admin" ? "/admin" : `/${r}/dashboard`),
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
