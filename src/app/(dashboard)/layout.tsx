"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { BrandIconRail } from "@/components/dashboard/brand-icon-rail";
import { CreatorIconRail } from "@/components/dashboard/creator-icon-rail";
import { AdminSectionSidebar } from "@/components/dashboard/admin-section-sidebar";
import { TopBar } from "@/components/dashboard/top-bar";
import { MobileBottomNav } from "@/components/dashboard/mobile-bottom-nav";
import { CommandPalette, useCommandPalette } from "@/components/dashboard/command-palette";
import { MobileDrawerNav } from "@/components/dashboard/mobile-drawer-nav";
import { Logo } from "@/components/brand/logo";
import { Menu } from "lucide-react";

/**
 * DashboardLayout — the single entry point for all internal pages.
 *
 * Three chrome variants keyed off the DB-backed role:
 *  - creator  → editorial: top pill nav, no sidebar
 *  - brand    → linear-bento: 56px icon rail + top bar
 *  - admin    → split-stage: 220px grouped sidebar + top bar
 *
 * Mobile collapses all three into a single top bar + bottom tab nav
 * with a hamburger drawer for full nav access.
 *
 * The command palette (⌘K) is globally mounted for all roles.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, role } = useAuth();
  const { open: paletteOpen, setOpen: setPaletteOpen } = useCommandPalette();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const displayName =
    user?.user_metadata?.display_name ??
    user?.email?.split("@")[0] ??
    "";
  const email = user?.email ?? null;
  const avatarUrl = (user?.user_metadata as { avatar_url?: string } | undefined)?.avatar_url ?? null;

  // While role resolves from DB, render a chrome-shaped skeleton so the
  // app appears instantly and the layout doesn't flash. Uses the Faiceoff
  // logo mark with a subtle pulse — feels intentional, not a generic
  // browser spinner.
  if (!role) {
    return (
      <div className="flex min-h-screen flex-col bg-[var(--color-background)]">
        <style>{`
          @keyframes faiceoff-shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
          @keyframes faiceoff-mark-pulse { 0%,100%{opacity:.55;transform:scale(1)} 50%{opacity:1;transform:scale(1.06)} }
          .fco-shimmer{background:linear-gradient(90deg,var(--color-secondary) 0%,var(--color-card) 50%,var(--color-secondary) 100%);background-size:200% 100%;animation:faiceoff-shimmer 1.6s ease-in-out infinite;border-radius:8px}
          .fco-mark{animation:faiceoff-mark-pulse 1.6s ease-in-out infinite}
        `}</style>

        {/* Topbar skeleton */}
        <div className="flex h-14 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-card)] px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <div className="fco-mark h-7 w-7 rounded-md bg-[var(--color-primary)]/15" />
            <div className="fco-shimmer h-3 w-24" />
          </div>
          <div className="flex items-center gap-2">
            <div className="fco-shimmer h-8 w-32 rounded-full" />
            <div className="fco-shimmer h-8 w-8 rounded-full" />
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Sidebar skeleton (desktop) */}
          <div className="hidden w-[220px] flex-col gap-2 border-r border-[var(--color-border)] bg-[var(--color-card)] p-4 lg:flex">
            <div className="fco-shimmer h-3 w-16 rounded" />
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="fco-shimmer h-7 w-full rounded-md" style={{ opacity: 0.85 - i * 0.08 }} />
            ))}
            <div className="mt-3 fco-shimmer h-3 w-12 rounded" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="fco-shimmer h-7 w-full rounded-md" style={{ opacity: 0.7 - i * 0.1 }} />
            ))}
          </div>

          {/* Main content skeleton */}
          <div className="flex flex-1 flex-col gap-4 p-6 lg:p-8">
            <div className="fco-shimmer h-8 w-48 rounded-md" />
            <div className="fco-shimmer h-4 w-80 rounded" />

            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="fco-shimmer h-20 rounded-xl" style={{ opacity: 0.9 - i * 0.1 }} />
              ))}
            </div>

            <div className="mt-2 fco-shimmer h-64 w-full rounded-xl" />

            <div className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="fco-shimmer h-40 rounded-xl" />
              <div className="fco-shimmer h-40 rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const hamburger = (
    <button
      type="button"
      onClick={() => setDrawerOpen(true)}
      aria-label="Open menu"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-foreground)] lg:hidden"
    >
      <Menu className="h-4 w-4" />
    </button>
  );

  // Compose the top bar's left slot per role
  let leftSlot: ReactNode = null;
  if (role === "creator") {
    // Desktop: CreatorIconRail handles nav — show page title in topbar.
    // Mobile: hamburger + compact wordmark.
    leftSlot = (
      <>
        {hamburger}
        <span className="hidden font-display text-[15px] font-700 tracking-tight text-[var(--color-foreground)] lg:inline">
          <PageTitle />
        </span>
        <Logo variant="full" adaptive className="h-6 w-auto lg:hidden" />
      </>
    );
  } else if (role === "brand") {
    // Desktop: hairline breadcrumb (BrandIconRail handles nav). Mobile: hamburger.
    leftSlot = (
      <>
        {hamburger}
        <BrandBreadcrumb />
      </>
    );
  } else if (role === "admin") {
    // Desktop: page title (sidebar handles nav). Mobile: hamburger.
    leftSlot = (
      <>
        {hamburger}
        <AdminPageTitle />
      </>
    );
  }

  return (
    <div className="flex min-h-screen bg-[var(--color-background)] text-[var(--color-foreground)]">
      {/* Desktop role-specific sidebar/rail (hidden on mobile) */}
      {role === "brand" && <BrandIconRail />}
      {role === "creator" && <CreatorIconRail />}
      {role === "admin" && <AdminSectionSidebar />}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          role={role}
          displayName={displayName}
          email={email}
          avatarUrl={avatarUrl}
          onOpenCommandPalette={() => setPaletteOpen(true)}
          leftSlot={leftSlot}
        />

        {/* Page content. Bottom padding leaves room for mobile bottom nav.

            Layout-level centering fix (2026-04-25):
            Many pages use `<div className="max-w-5xl">` without `mx-auto`,
            which left-aligned their content against the sidebar. Rather
            than touch every page, we force every direct child of <main>
            to be horizontally centered via the `[&>*]:mx-auto` arbitrary
            variant, and cap them at 1400px so the layout breathes on
            ultra-wide displays. Pages with their own (smaller) max-w
            still win because their max-w is more restrictive. */}
        <main className="flex-1 overflow-x-hidden pb-20 lg:pb-0">
          {/* Top padding intentionally removed (2026-05-08): pages own their
              vertical spacing. Previously `py-6 lg:py-8` here stacked with
              page-level `py-6/8/10`, producing ~70px ghost gaps below the
              top bar across the entire site. Bare pages without their own
              `py-` add it inline. */}
          <div className="mx-auto w-full max-w-[1400px] px-4 pb-6 lg:px-8 lg:pb-8 [&>*]:mx-auto">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom tabs */}
      <MobileBottomNav role={role} />

      {/* Mobile drawer — full nav accessible via hamburger */}
      <MobileDrawerNav
        role={role}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />

      {/* Global ⌘K palette */}
      <CommandPalette
        role={role}
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
      />
    </div>
  );
}

/* ───────── Left-slot helpers ───────── */

function BrandBreadcrumb() {
  return (
    <span className="hidden font-display text-[15px] font-700 tracking-tight text-[var(--color-foreground)] lg:inline">
      <PageTitle />
    </span>
  );
}

function AdminPageTitle() {
  return (
    <span className="font-display text-[15px] font-700 tracking-tight text-[var(--color-foreground)]">
      <PageTitle />
    </span>
  );
}

function PageTitle() {
  const path = usePathname();
  const map: Record<string, string> = {
    // Brand
    "/brand/dashboard": "Overview",
    "/brand/discover": "Discover creators",
    "/brand/collabs": "Collabs",
    "/brand/requests": "Requests",
    "/brand/vault": "Library",
    "/brand/licenses": "Licenses",
    "/brand/credits": "Credits",
    "/brand/wallet": "Wallet",
    "/brand/settings": "Settings",
    "/brand/inbox": "Inbox",
    // Creator
    "/creator/dashboard": "Overview",
    "/creator/requests": "Requests",
    "/creator/collabs": "Collabs",
    "/creator/packages": "My Packages",
    "/creator/earnings": "Earnings",
    "/creator/withdraw": "Withdraw",
    "/creator/likeness": "Likeness",
    "/creator/approvals": "Approvals",
    "/creator/licenses": "Licenses",
    "/creator/analytics": "Analytics",
    "/creator/blocked-categories": "Blocked categories",
    "/creator/settings": "Settings",
    "/creator/inbox": "Inbox",
    // Admin
    "/admin": "Triage overview",
    "/admin/safety": "Safety review",
    "/admin/stuck-gens": "Stuck generations",
    "/admin/packs": "Credit packs",
  };
  // Longest-prefix match so nested routes inherit their parent label
  const match = Object.keys(map)
    .sort((a, b) => b.length - a.length)
    .find((key) => path === key || path.startsWith(key + "/"));
  return <>{match ? map[match] : "Workspace"}</>;
}
