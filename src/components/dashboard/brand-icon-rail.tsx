"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BRAND_SIDE_NAV } from "@/config/nav-items.brand";

/**
 * BrandIconRail — 56px icon-only vertical rail (desktop only).
 *
 * Pattern: Linear / Vercel / Figma style. Tooltips reveal labels
 * on hover. Groups are separated by hairline dividers. Active
 * state uses gold-tinted pill behind the icon.
 */
export function BrandIconRail() {
  const pathname = usePathname();

  // Partition nav by group so we can insert dividers between them
  const grouped = BRAND_SIDE_NAV.reduce<Record<string, typeof BRAND_SIDE_NAV>>(
    (acc, item) => {
      const g = item.group ?? "Default";
      if (!acc[g]) acc[g] = [];
      acc[g].push(item);
      return acc;
    },
    {},
  );
  const groupOrder = Array.from(new Set(BRAND_SIDE_NAV.map((i) => i.group ?? "Default")));

  function isActive(href: string) {
    if (href === "/brand/dashboard") return pathname === href;
    return pathname.startsWith(href);
  }

  return (
    <TooltipProvider delayDuration={120} skipDelayDuration={80}>
      <aside className="sticky top-0 hidden h-screen w-14 shrink-0 flex-col items-center border-r border-[var(--color-border)] bg-[var(--color-card)] py-3 lg:flex">
        {/* Logo mark */}
        <Link
          href="/brand/dashboard"
          aria-label="Faiceoff home"
          className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-primary)] p-1.5 transition-transform hover:scale-105"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-mark.png"
            alt="Faiceoff"
            className="h-full w-full object-contain"
          />
        </Link>

        <div className="my-3 h-px w-6 bg-[var(--color-border)]" />

        {/* Nav items */}
        <nav className="flex flex-1 flex-col items-center gap-1 overflow-y-auto">
          {groupOrder.map((group, idx) => (
            <div key={group} className="flex flex-col items-center gap-1">
              {idx > 0 && <div className="my-1 h-px w-6 bg-[var(--color-border)]" />}
              {grouped[group].map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>
                      <Link
                        href={item.href}
                        aria-label={item.label}
                        aria-current={active ? "page" : undefined}
                        className={`group relative flex h-10 w-10 items-center justify-center rounded-lg transition-all ${
                          active
                            ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-[0_2px_8px_-2px_rgba(201,169,110,0.4)]"
                            : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-secondary)] hover:text-[var(--color-foreground)]"
                        }`}
                      >
                        <Icon style={{ width: "18px", height: "18px" }} />
                        {active && (
                          <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-[var(--color-primary)]" />
                        )}
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="font-600">
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
    </TooltipProvider>
  );
}
