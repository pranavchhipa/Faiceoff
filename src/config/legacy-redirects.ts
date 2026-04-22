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
