"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { BrandIconRail } from "@/components/dashboard/brand-icon-rail";
import { CreatorPillNav } from "@/components/dashboard/creator-pill-nav";
import { AdminSectionSidebar } from "@/components/dashboard/admin-section-sidebar";
import { TopBar } from "@/components/dashboard/top-bar";
import { MobileBottomNav } from "@/components/dashboard/mobile-bottom-nav";
import { CommandPalette, useCommandPalette } from "@/components/dashboard/command-palette";
import { MobileDrawerNav } from "@/components/dashboard/mobile-drawer-nav";
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

  // While role resolves from DB, render a quiet skeleton so we don't
  // flash the wrong chrome (e.g. creator editorial → brand bento swap).
  if (!role) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)]">
        <div className="flex items-center gap-3 text-[var(--color-muted-foreground)]">
          <span className="flex h-8 w-8 animate-spin items-center justify-center">
            <span className="h-5 w-5 rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-primary)]" />
          </span>
          <span className="text-sm">Loading workspace…</span>
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
    // Desktop: pill nav. Mobile: hamburger + compact wordmark.
    leftSlot = (
      <>
        {hamburger}
        <div className="hidden lg:block">
          <CreatorPillNav />
        </div>
        <span className="flex items-center gap-2 font-display text-base font-800 tracking-tight lg:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-mark.png"
            alt=""
            aria-hidden
            className="h-6 w-6 object-contain"
          />
          Faiceoff<span className="text-[var(--color-primary)]">.</span>
        </span>
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
          <div className="mx-auto w-full max-w-[1400px] px-4 py-6 lg:px-8 lg:py-8 [&>*]:mx-auto">
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
    "/brand/dashboard": "Overview",
    "/brand/discover": "Discover creators",
    "/brand/sessions": "Sessions",
    "/brand/vault": "Vault",
    "/brand/licenses": "Licenses",
    "/brand/credits": "Credits",
    "/brand/wallet": "Wallet",
    "/brand/billing": "Billing",
    "/brand/settings": "Settings",
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
