"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { BRAND_SIDE_NAV } from "@/config/nav-items.brand";
import { CREATOR_SIDE_NAV } from "@/config/nav-items.creator";
import { ADMIN_SIDE_NAV } from "@/config/nav-items.admin";
import type { Role } from "@/config/routes";
import type { NavItem } from "@/config/nav-items.brand";

interface MobileDrawerNavProps {
  role: Role | null;
  open: boolean;
  onClose: () => void;
}

/**
 * MobileDrawerNav — slide-in drawer that exposes the FULL role nav
 * on mobile (the bottom tab bar only shows 4-5 primary items).
 * Opens via the hamburger in the top bar. Desktop never shows it.
 */
export function MobileDrawerNav({ role, open, onClose }: MobileDrawerNavProps) {
  const pathname = usePathname();

  if (!role) return null;

  const nav: NavItem[] =
    role === "brand"
      ? BRAND_SIDE_NAV
      : role === "admin"
      ? ADMIN_SIDE_NAV
      : CREATOR_SIDE_NAV;

  const grouped = nav.reduce<Record<string, NavItem[]>>((acc, item) => {
    const g = item.group ?? "Menu";
    if (!acc[g]) acc[g] = [];
    acc[g].push(item);
    return acc;
  }, {});
  const groupOrder = Array.from(new Set(nav.map((i) => i.group ?? "Menu")));

  function isActive(href: string) {
    if (
      href === "/admin" ||
      href === "/brand/dashboard" ||
      href === "/creator/dashboard"
    ) {
      return pathname === href;
    }
    return pathname.startsWith(href);
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="left"
        className="w-[280px] border-r border-[var(--color-border)] bg-[var(--color-card)] p-0 [&>[data-slot=sheet-close-button]]:hidden"
      >
        <SheetHeader className="border-b border-[var(--color-border)] p-4">
          <SheetTitle className="flex items-center gap-2 font-display text-lg font-800 tracking-tight">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-mark.png"
              alt="Faiceoff"
              className="h-7 w-7 object-contain"
            />
            Faiceoff<span className="text-[var(--color-primary)]">.</span>
            <span className="ml-auto rounded-full border border-[var(--color-border)] bg-[var(--color-secondary)] px-2 py-0.5 text-[10px] font-700 uppercase tracking-wider text-[var(--color-muted-foreground)]">
              {role}
            </span>
          </SheetTitle>
        </SheetHeader>

        <nav className="flex flex-1 flex-col overflow-y-auto p-3">
          {groupOrder.map((group) => (
            <div key={group} className="mb-4">
              {nav.some((n) => n.group === group) && groupOrder.length > 1 && (
                <p className="mb-1.5 px-2 text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                  {group}
                </p>
              )}
              <div className="flex flex-col gap-0.5">
                {grouped[group].map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                        active
                          ? "bg-[var(--color-primary)] font-700 text-[var(--color-primary-foreground)]"
                          : "font-600 text-[var(--color-muted-foreground)] hover:bg-[var(--color-secondary)] hover:text-[var(--color-foreground)]"
                      }`}
                    >
                      <Icon className="shrink-0" style={{ width: "16px", height: "16px" }} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
