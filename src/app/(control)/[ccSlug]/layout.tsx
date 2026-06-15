/**
 * Control Centre layout — SINGLE SOURCE OF TRUTH for CC auth.
 *
 *   • Validates the URL slug against env.OWNER_CONTROL_CENTRE_SLUG.
 *     Mismatch → notFound() (404, no signal).
 *   • If no TOTP row exists yet → only /setup is reachable; everything
 *     else redirects to /setup.
 *   • If TOTP exists but no session → only /login is reachable; everything
 *     else redirects to /login.
 *   • If session → renders the full chrome (topbar + sidebar). /login and
 *     /setup redirect back to /ops in that case.
 *
 * IMPORTANT: pages MUST NOT also call ensureCCAuth(). Duplicate calls
 * caused a race where the layout's getSession returned null (idle-expiry
 * soft-revoke ran on one call) while the page's call still saw a valid
 * row — that produced the "sidebar hidden, page content visible" bug.
 */

import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { verifySlug } from "@/lib/cc/guard";
import { getCurrentSession } from "@/lib/cc/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { CC_NAV } from "@/config/cc-nav";
import { getPendingCounts } from "@/lib/cc/overview";
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

/**
 * Derive the segment after `/<slug>/` from the request pathname header.
 * `proxy.ts` injects `x-pathname` on every request. Returns "" for the
 * index `/<slug>` page.
 */
function deriveSegment(pathname: string, ccSlug: string): string {
  const prefix = `/${ccSlug}`;
  if (!pathname.startsWith(prefix)) return "";
  const rest = pathname.slice(prefix.length); // "", "/login", "/ops", "/users/abc"
  if (!rest || rest === "/") return "";
  // Strip leading slash, take first segment only.
  return rest.replace(/^\//, "").split("/")[0];
}

export default async function CCLayout({ children, params }: Props) {
  const { ccSlug } = await params;

  // 1. Slug must match env (else 404 — never leak existence).
  if (!verifySlug(ccSlug)) {
    notFound();
  }

  const pathname = (await headers()).get("x-pathname") ?? `/${ccSlug}`;
  const segment = deriveSegment(pathname, ccSlug);
  const isSetupPage = segment === "setup";
  const isLoginPage = segment === "login";

  const hasTotp = await totpExists();

  // 2. No TOTP configured yet → only /setup is reachable.
  if (!hasTotp) {
    if (!isSetupPage) {
      redirect(`/${ccSlug}/setup`);
    }
    // Render bare chrome (no sidebar) — the setup form supplies its own.
    return (
      <div className="cc-root">
        <header className="cc-topbar">
          <div className="cc-topbar-left">
            <span className="cc-brand">FAICEOFF</span>
            <span className="cc-brand-divider">·</span>
            <span className="cc-brand-tag">CONTROL CENTRE</span>
          </div>
          <div className="cc-topbar-right">
            <span className="cc-session-info">Not configured</span>
          </div>
        </header>
        <div className="cc-shell">
          <main className="cc-main">{children}</main>
        </div>
      </div>
    );
  }

  // 3. TOTP exists. Check session.
  const session = await getCurrentSession();

  // 3a. Authenticated user landed on /login or /setup → punt to /ops.
  if (session && (isLoginPage || isSetupPage)) {
    redirect(`/${ccSlug}/ops`);
  }

  // 3b. Unauthenticated user. Allow only /login. Everything else → /login.
  if (!session) {
    if (!isLoginPage) {
      redirect(`/${ccSlug}/login`);
    }
    // Bare chrome for the login form.
    return (
      <div className="cc-root">
        <header className="cc-topbar">
          <div className="cc-topbar-left">
            <span className="cc-brand">FAICEOFF</span>
            <span className="cc-brand-divider">·</span>
            <span className="cc-brand-tag">CONTROL CENTRE</span>
          </div>
          <div className="cc-topbar-right">
            <span className="cc-session-info">Not signed in</span>
          </div>
        </header>
        <div className="cc-shell">
          <main className="cc-main">{children}</main>
        </div>
      </div>
    );
  }

  // 4. Authenticated — render full chrome with sidebar.
  const pending = await getPendingCounts();
  const everyday = CC_NAV.filter((i) => i.group === "EVERYDAY");
  const advanced = CC_NAV.filter((i) => i.group === "ADVANCED");

  const renderLink = (item: (typeof CC_NAV)[number]) => {
    const Icon = item.icon;
    const badge = item.segment === "inbox" && pending.total > 0 ? pending.total : null;
    return (
      <li key={item.segment}>
        <Link href={`/${ccSlug}/${item.segment}`} className="cc-nav-link" prefetch={false}>
          <Icon size={15} />
          <span>{item.label}</span>
          {badge !== null && <span className="cc-nav-badge">{badge}</span>}
        </Link>
      </li>
    );
  };

  return (
    <div className="cc-root">
      <header className="cc-topbar">
        <div className="cc-topbar-left">
          <span className="cc-brand">FAICEOFF</span>
          <span className="cc-brand-divider">·</span>
          <span className="cc-brand-tag">CONTROL CENTRE</span>
        </div>
        <div className="cc-topbar-right">
          <span className="cc-session-info">
            Session · {session.id.slice(0, 8)}…
          </span>
          <form action={`/${ccSlug}/logout`} method="post">
            <button type="submit" className="cc-logout-btn" title="Sign out">
              <LogOut size={14} />
              <span>Sign out</span>
            </button>
          </form>
        </div>
      </header>

      <div className="cc-shell">
        <aside className="cc-sidebar">
          {/* Everyday — flat, always visible */}
          <ul className="cc-nav-list">{everyday.map(renderLink)}</ul>

          {/* Advanced — collapsed by default (native <details>, no JS) */}
          <details className="cc-nav-advanced">
            <summary className="cc-nav-advanced-summary">
              <span>Advanced</span>
              <span className="cc-nav-advanced-chev">▾</span>
            </summary>
            <ul className="cc-nav-list">{advanced.map(renderLink)}</ul>
          </details>
        </aside>

        <main className="cc-main">{children}</main>
      </div>
    </div>
  );
}
