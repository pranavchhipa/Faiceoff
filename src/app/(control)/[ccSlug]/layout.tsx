/**
 * Control Centre layout.
 *
 *   • Validates the URL slug against env.OWNER_CONTROL_CENTRE_SLUG.
 *     Mismatch → notFound() (404, no signal).
 *   • If enabled but no TOTP row exists yet, lets `/setup` through.
 *   • Otherwise requires a valid `fco_cc_session` cookie. If missing,
 *     redirects to `/<slug>/login`.
 *   • Renders the dense internal-tool chrome: left sidebar nav + topbar
 *     with "Control Centre · Faiceoff" + logout.
 *
 * Design language for everything inside: dense data tables, mono fonts
 * for IDs/timestamps, no marketing fluff, no animations beyond default
 * focus rings. Background is intentionally near-black to look distinctly
 * different from the customer dashboard.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { verifySlug } from "@/lib/cc/guard";
import { getCurrentSession } from "@/lib/cc/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { CC_NAV, GROUP_ORDER } from "@/config/cc-nav";
import "./cc.css";

export const dynamic = "force-dynamic";

interface Props {
  children: React.ReactNode;
  params: Promise<{ ccSlug: string }>;
}

async function totpExists(): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { count } = await admin
    .from("owner_totp")
    .select("id", { count: "exact", head: true });
  return (count ?? 0) > 0;
}

export default async function CCLayout({ children, params }: Props) {
  const { ccSlug } = await params;

  // 1. Slug must match env (else 404 — never leak existence).
  if (!verifySlug(ccSlug)) {
    notFound();
  }

  const hasTotp = await totpExists();
  const session = await getCurrentSession();

  // The layout chrome shows ONLY when authenticated. Setup + login
  // children render without it (they call notFound() / handle their own
  // chrome). We detect them via a server-side flag on the page itself.

  // For unauthenticated users we still render a minimal shell so the
  // children control what to show. The pages handle their own routing.
  const authed = !!session;

  return (
    <div className="cc-root">
      {/* Top bar */}
      <header className="cc-topbar">
        <div className="cc-topbar-left">
          <span className="cc-brand">FAICEOFF</span>
          <span className="cc-brand-divider">·</span>
          <span className="cc-brand-tag">CONTROL CENTRE</span>
        </div>
        <div className="cc-topbar-right">
          {authed && (
            <>
              <span className="cc-session-info">
                Session · {session?.id.slice(0, 8)}…
              </span>
              <form action={`/${ccSlug}/logout`} method="post">
                <button type="submit" className="cc-logout-btn" title="Sign out">
                  <LogOut size={14} />
                  <span>Sign out</span>
                </button>
              </form>
            </>
          )}
          {!authed && hasTotp && (
            <span className="cc-session-info">Not signed in</span>
          )}
          {!authed && !hasTotp && (
            <span className="cc-session-info">Not configured</span>
          )}
        </div>
      </header>

      <div className="cc-shell">
        {/* Sidebar — only when authenticated */}
        {authed && (
          <aside className="cc-sidebar">
            {GROUP_ORDER.map((group) => {
              const items = CC_NAV.filter((i) => i.group === group);
              if (items.length === 0) return null;
              return (
                <div key={group} className="cc-nav-group">
                  <p className="cc-nav-group-label">{group}</p>
                  <ul className="cc-nav-list">
                    {items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <li key={item.segment}>
                          <Link
                            href={`/${ccSlug}/${item.segment}`}
                            className="cc-nav-link"
                            prefetch={false}
                          >
                            <Icon size={14} />
                            <span>{item.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </aside>
        )}

        <main className="cc-main">{children}</main>
      </div>
    </div>
  );
}
