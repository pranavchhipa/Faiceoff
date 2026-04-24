"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Plus, type LucideIcon } from "lucide-react";
import type { Role } from "@/config/routes";
import {
  LayoutDashboard,
  Inbox,
  IndianRupee,
  UserCircle2,
  Users,
  Megaphone,
  Image as ImageIcon,
  ShieldAlert,
  Hourglass,
  Package,
} from "lucide-react";

interface Tab {
  label: string;
  href: string;
  icon: LucideIcon;
}

const CREATOR_TABS: Tab[] = [
  { label: "Home", href: "/creator/dashboard", icon: LayoutDashboard },
  { label: "Approve", href: "/creator/approvals", icon: Inbox },
  { label: "Earn", href: "/creator/earnings", icon: IndianRupee },
  { label: "Me", href: "/creator/settings", icon: UserCircle2 },
];

const BRAND_TABS: Tab[] = [
  { label: "Home", href: "/brand/dashboard", icon: LayoutDashboard },
  { label: "Discover", href: "/brand/discover", icon: Users },
  // center FAB takes the middle slot
  { label: "Vault", href: "/brand/vault", icon: ImageIcon },
  { label: "Me", href: "/brand/settings", icon: UserCircle2 },
];

const ADMIN_TABS: Tab[] = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  { label: "Safety", href: "/admin/safety", icon: ShieldAlert },
  { label: "Stuck", href: "/admin/stuck-gens", icon: Hourglass },
  { label: "Packs", href: "/admin/packs", icon: Package },
];

interface MobileBottomNavProps {
  role: Role | null;
}

/**
 * MobileBottomNav — fixed bottom tab bar for internal pages on mobile.
 * Brand gets a center "+" FAB that routes to the session creation flow.
 * Creator / Admin get even-width tab rows.
 */
export function MobileBottomNav({ role }: MobileBottomNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  if (!role) return null;

  const tabs =
    role === "brand"
      ? BRAND_TABS
      : role === "admin"
      ? ADMIN_TABS
      : CREATOR_TABS;

  const brandLayout = role === "brand";

  function isActive(href: string) {
    if (
      href === "/brand/dashboard" ||
      href === "/creator/dashboard" ||
      href === "/admin"
    ) {
      return pathname === href;
    }
    return pathname.startsWith(href);
  }

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-stretch border-t border-[var(--color-border)] bg-[var(--color-background)]/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      {/* split left-half tabs | FAB | right-half tabs for Brand.
          Creator/Admin just render 4-5 equal tabs. */}
      {brandLayout ? (
        <>
          {tabs.slice(0, 2).map((tab) => (
            <TabButton key={tab.href} tab={tab} active={isActive(tab.href)} />
          ))}
          <div className="flex flex-1 items-center justify-center">
            <button
              type="button"
              onClick={() => router.push("/brand/sessions")}
              aria-label="New session"
              className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-[0_8px_20px_-4px_rgba(201,169,110,0.55)] ring-4 ring-[var(--color-background)] transition-transform active:scale-95"
            >
              <Plus className="h-6 w-6" strokeWidth={2.4} />
            </button>
          </div>
          {tabs.slice(2).map((tab) => (
            <TabButton key={tab.href} tab={tab} active={isActive(tab.href)} />
          ))}
        </>
      ) : (
        tabs.map((tab) => (
          <TabButton key={tab.href} tab={tab} active={isActive(tab.href)} />
        ))
      )}
    </nav>
  );
}

function TabButton({ tab, active }: { tab: Tab; active: boolean }) {
  const Icon = tab.icon;
  return (
    <Link
      href={tab.href}
      aria-current={active ? "page" : undefined}
      className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-600 transition-colors ${
        active
          ? "text-[var(--color-primary)]"
          : "text-[var(--color-muted-foreground)]"
      }`}
    >
      <Icon className={`h-5 w-5 ${active ? "stroke-[2.25]" : "stroke-[1.75]"}`} />
      <span className="leading-none">{tab.label}</span>
    </Link>
  );
}
