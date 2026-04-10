"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Megaphone,
  Wallet,
  ClipboardCheck,
  Settings,
  Menu,
  X,
} from "lucide-react";
import type { ReactNode } from "react";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/creators", label: "Discover Creators", icon: Users },
  { href: "/dashboard/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/dashboard/approvals", label: "Approvals", icon: ClipboardCheck },
  { href: "/dashboard/wallet", label: "Wallet", icon: Wallet },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname.startsWith(href);
}

function SidebarContent({
  pathname,
  onLinkClick,
}: {
  pathname: string;
  onLinkClick?: () => void;
}) {
  return (
    <>
      {/* Sidebar header */}
      <div className="flex h-16 items-center border-b border-[var(--color-neutral-200)] px-6">
        <Link
          href="/dashboard"
          onClick={onLinkClick}
          className="font-[family-name:var(--font-display)] text-lg font-700 tracking-tight text-[var(--color-ink)] no-underline hover:text-[var(--color-ink)]"
        >
          faiceoff
        </Link>
      </div>

      {/* Sidebar navigation */}
      <nav className="flex flex-1 flex-col gap-1 p-4">
        <p className="px-3 py-2 text-xs font-500 uppercase tracking-wider text-[var(--color-neutral-400)]">
          Navigation
        </p>
        {NAV_LINKS.map((link) => {
          const Icon = link.icon;
          const active = isActive(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onLinkClick}
              className={`flex items-center gap-3 rounded-[var(--radius-input)] px-3 py-2 text-sm font-500 transition-colors ${
                active
                  ? "bg-[var(--color-gold)]/10 text-[var(--color-gold)] font-600"
                  : "text-[var(--color-neutral-600)] hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-ink)]"
              }`}
            >
              <Icon className="size-4 shrink-0" />
              {link.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-[var(--color-background)]">
      {/* ── Desktop Sidebar ── */}
      <aside className="sticky top-0 hidden h-screen w-64 flex-shrink-0 flex-col border-r border-[var(--color-neutral-200)] bg-white lg:flex">
        <SidebarContent pathname={pathname} />
      </aside>

      {/* ── Mobile Overlay ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setMobileOpen(false)}
          />
          {/* Drawer */}
          <aside className="relative flex h-full w-72 flex-col bg-white shadow-xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-4 top-5 flex size-8 items-center justify-center rounded-full text-[var(--color-neutral-500)] hover:bg-[var(--color-neutral-100)]"
            >
              <X className="size-5" />
            </button>
            <SidebarContent
              pathname={pathname}
              onLinkClick={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      )}

      {/* ── Main content area ── */}
      <div className="flex flex-1 flex-col">
        {/* Top bar (mobile) */}
        <header className="flex h-16 items-center gap-4 border-b border-[var(--color-neutral-200)] bg-white px-6 lg:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="flex size-9 items-center justify-center rounded-[var(--radius-input)] text-[var(--color-neutral-600)] hover:bg-[var(--color-neutral-100)]"
          >
            <Menu className="size-5" />
          </button>
          <Link
            href="/dashboard"
            className="font-[family-name:var(--font-display)] text-lg font-700 tracking-tight text-[var(--color-ink)] no-underline hover:text-[var(--color-ink)]"
          >
            faiceoff
          </Link>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 lg:p-10">{children}</main>
      </div>
    </div>
  );
}
