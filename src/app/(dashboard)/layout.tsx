"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import {
  LayoutDashboard,
  Users,
  Megaphone,
  Wallet,
  ClipboardCheck,
  Settings,
  Menu,
  X,
  LogOut,
  IndianRupee,
  ScanFace,
  BarChart3,
  Package,
  Shield,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "@/components/providers/auth-provider";

interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

// Use direct /brand/* and /creator/* paths — NOT legacy /dashboard/*.
// Legacy paths get rewritten by middleware, but the rewrite map is
// inconsistent with what pages actually exist (e.g. /dashboard/settings →
// /brand/settings, which has no page). Routing through legacy was the
// source of the 404s the user kept hitting.
const CREATOR_NAV: NavLink[] = [
  { href: "/creator/dashboard",          label: "Dashboard",          icon: LayoutDashboard },
  { href: "/creator/licenses",           label: "Licenses",           icon: ClipboardCheck },
  { href: "/creator/earnings",           label: "Earnings",           icon: IndianRupee },
  { href: "/creator/payouts",            label: "Payouts",            icon: Wallet },
  { href: "/creator/withdraw",           label: "Withdraw",           icon: BarChart3 },
  { href: "/creator/blocked-categories", label: "Blocked categories", icon: ScanFace },
];

const BRAND_NAV: NavLink[] = [
  { href: "/brand/dashboard", label: "Dashboard",         icon: LayoutDashboard },
  { href: "/brand/discover",  label: "Discover Creators", icon: Users },
  { href: "/brand/sessions",  label: "Sessions",          icon: Megaphone },
  { href: "/brand/licenses",  label: "Licenses",          icon: ClipboardCheck },
  { href: "/brand/vault",     label: "Vault",             icon: ScanFace },
  { href: "/brand/wallet",    label: "Wallet",            icon: Wallet },
  { href: "/brand/credits",   label: "Credits",           icon: IndianRupee },
  { href: "/brand/billing",   label: "Billing",           icon: Settings },
];

const ADMIN_NAV: NavLink[] = [
  { href: "/admin",             label: "Overview",          icon: LayoutDashboard },
  { href: "/admin/packs",       label: "Credit packs",      icon: Package },
  { href: "/admin/safety",      label: "Safety review",     icon: Shield },
  { href: "/admin/stuck-gens",  label: "Stuck generations", icon: AlertTriangle },
];

function isActive(pathname: string, href: string): boolean {
  // Exact match for role-home paths so /brand/dashboard doesn't light up
  // when you're at /brand/sessions, etc.
  if (
    href === "/dashboard" ||
    href === "/admin" ||
    href === "/brand/dashboard" ||
    href === "/creator/dashboard"
  ) {
    return pathname === href;
  }
  return pathname.startsWith(href);
}

function SidebarContent({
  pathname,
  onLinkClick,
}: {
  pathname: string;
  onLinkClick?: () => void;
}) {
  const { user, role: dbRole } = useAuth();
  const router = useRouter();
  const displayName =
    user?.user_metadata?.display_name ??
    user?.email?.split("@")[0] ??
    "";
  // Only trust the DB-backed role. Never fall back to session metadata — it
  // can be stale and causes a creator→brand flash for brand accounts on
  // session refresh. Until dbRole resolves, render the skeleton.
  const role: "creator" | "brand" | "admin" | null = dbRole;
  const roleResolved = role !== null;
  const roleHomeHref =
    role === "admin" ? "/admin" : "/dashboard";
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    await fetch("/api/auth/sign-out", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex h-full flex-col bg-[var(--color-ink)]">
      {/* Logo */}
      <div className="flex h-20 shrink-0 items-center border-b border-white/10 px-5">
        <Link href={roleHomeHref} onClick={onLinkClick} className="no-underline">
          <Image src="/images/logo-dark.png" alt="Faiceoff" width={180} height={60} priority className="h-12 w-auto brightness-0 invert" />
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-5">
        <p className="mb-2 px-3 text-[10px] font-700 uppercase tracking-widest text-white/30">
          Navigation
        </p>
        {/* While we're still resolving the role, show a skeleton so we don't
            render creator nav to a brand (or vice-versa) and then swap. */}
        {!roleResolved ? (
          <div className="flex flex-col gap-1 animate-pulse">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-10 rounded-xl bg-white/5"
              />
            ))}
          </div>
        ) : null}
        {(!roleResolved
          ? []
          : role === "admin"
          ? ADMIN_NAV
          : role === "brand"
          ? BRAND_NAV
          : CREATOR_NAV
        ).map((link) => {
          const Icon = link.icon;
          const active = isActive(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onLinkClick}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all no-underline ${
                active
                  ? "bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-primary-container)] font-600 shadow-[0_4px_16px_rgba(106,28,246,0.3)]"
                  : "font-600 text-[#ffffff] hover:bg-white/10"
              }`}
            >
              <Icon className={`size-4 shrink-0 ${active ? "text-[#ffffff]" : "text-white/70 group-hover:text-[#ffffff]"}`} />
              <span className="text-[#ffffff]">{link.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom: user + sign out */}
      <div className="shrink-0 border-t border-white/10 p-3">
        <AnimatePresence mode="wait">
          {confirmLogout ? (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15 }}
              className="rounded-xl bg-red-500/10 p-3"
            >
              <p className="mb-2.5 text-[12px] font-600 text-white/80 text-center">
                Sign out?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmLogout(false)}
                  className="flex-1 rounded-lg py-1.5 text-xs font-600 text-white/50 transition-colors hover:bg-white/10 hover:text-white/80"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                  className="flex-1 rounded-lg bg-red-500/30 py-1.5 text-xs font-600 text-red-300 transition-colors hover:bg-red-500/40 disabled:opacity-50"
                >
                  {isSigningOut ? "..." : "Sign out"}
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="user"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/20 text-xs font-700 uppercase text-[var(--color-primary-container)]">
                {displayName ? displayName.charAt(0) : "·"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-600 text-white/90">
                  {displayName || "…"}
                </p>
                <p className="text-[11px] capitalize text-white/30">
                  {roleResolved ? role : "…"}
                </p>
              </div>
              <button
                onClick={() => setConfirmLogout(true)}
                title="Sign out"
                className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-red-500/15 text-red-400 transition-colors hover:bg-red-500/25 hover:text-red-300"
              >
                <LogOut className="size-4.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-white">

      {/* ── Desktop Sidebar ── */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-[var(--color-ink)] lg:flex">
        <SidebarContent pathname={pathname} />
      </aside>

      {/* ── Mobile Overlay ── */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[var(--color-ink)]/40"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="relative flex h-full w-64 flex-col bg-[var(--color-ink)] shadow-[var(--shadow-elevated)]"
            >
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute right-3 top-4 flex size-8 items-center justify-center rounded-full text-[var(--color-neutral-500)] hover:bg-[var(--color-neutral-100)]"
              >
                <X className="size-4" />
              </button>
              <SidebarContent
                pathname={pathname}
                onLinkClick={() => setMobileOpen(false)}
              />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* ── Main content area ── */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile topbar */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--color-neutral-200)] bg-[var(--color-background)] px-4 shadow-[var(--shadow-soft)] lg:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="flex size-9 items-center justify-center rounded-[var(--radius-input)] text-[var(--color-neutral-600)] hover:bg-[var(--color-neutral-100)]"
          >
            <Menu className="size-5" />
          </button>
          <Link href="/">
            <Image src="/images/logo-dark.png" alt="Faiceoff" width={130} height={43} priority className="h-6 w-auto" />
          </Link>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto bg-white p-5 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
