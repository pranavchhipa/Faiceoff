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
//            licenses/[id], sessions, sessions/[id], vault, wallet
//   creator: blocked-categories, dashboard, earnings, licenses, payouts, withdraw
//   admin:   dashboard, packs, safety, stuck-gens, plus / (overview)

const RULES: Rule[] = [
  // /dashboard root → role home (admin gets /admin, others get /${r}/dashboard)
  {
    match: /^\/dashboard\/?$/,
    resolve: (_m, r) => (r === "admin" ? "/admin" : `/${r}/dashboard`),
  },

  // Campaigns → sessions (only brand has /brand/sessions; creator has none yet)
  {
    match: /^\/dashboard\/campaigns(?:\/(.+))?$/,
    resolve: (m, r) => {
      if (r === "brand") return m[1] ? `/brand/sessions/${m[1]}` : "/brand/sessions";
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

  // Approvals page doesn't exist for creator yet → bounce to dashboard
  {
    match: /^\/dashboard\/approvals(?:\/(.+))?$/,
    resolve: (_m, r) => (r === "creator" ? "/creator/dashboard" : `/${r}/dashboard`),
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

  // Likeness → no /creator/reference-photos page yet, bounce to dashboard
  {
    match: /^\/dashboard\/likeness\/?$/,
    resolve: (_m, r) => `/${r === "admin" ? "admin" : r === "creator" ? "creator/dashboard" : "brand/dashboard"}`,
  },

  // Settings page doesn't exist for either brand or creator yet
  {
    match: /^\/dashboard\/settings(?:\/.*)?$/,
    resolve: (_m, r) => `/${r === "admin" ? "admin" : `${r}/dashboard`}`,
  },

  // Analytics → no dedicated page, fall through to dashboard
  {
    match: /^\/dashboard\/analytics\/?$/,
    resolve: (_m, r) => `/${r === "admin" ? "admin" : `${r}/dashboard`}`,
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
