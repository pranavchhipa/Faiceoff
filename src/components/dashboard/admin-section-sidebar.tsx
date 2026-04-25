"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_SIDE_NAV } from "@/config/nav-items.admin";

/**
 * AdminSectionSidebar — 220px grouped sidebar for Admin split-stage chrome.
 *
 * Pattern: Zendesk / Linear triage views. Groups by workflow
 * (Triage / Manage / System). Each item shows label + optional
 * count badge so queue sizes are visible at a glance.
 */
interface AdminSectionSidebarProps {
  /**
   * Optional counts to render next to certain items (e.g. pending
   * safety reviews, stuck generations). Wire this to a server-side
   * resolver when those endpoints are ready.
   */
  counts?: Partial<Record<string, number>>;
}

export function AdminSectionSidebar({ counts = {} }: AdminSectionSidebarProps) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  }

  const grouped = ADMIN_SIDE_NAV.reduce<Record<string, typeof ADMIN_SIDE_NAV>>(
    (acc, item) => {
      const g = item.group ?? "Default";
      if (!acc[g]) acc[g] = [];
      acc[g].push(item);
      return acc;
    },
    {},
  );
  const groupOrder = Array.from(new Set(ADMIN_SIDE_NAV.map((i) => i.group ?? "Default")));

  return (
    <aside className="sticky top-0 hidden h-screen w-[220px] shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-card)] lg:flex">
      {/* Header — logo + "Admin" label */}
      <div className="flex h-14 items-center gap-2 border-b border-[var(--color-border)] px-4">
        <Link
          href="/admin"
          aria-label="Faiceoff admin home"
          className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--color-primary)] p-1"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-mark.png"
            alt="Faiceoff"
            className="h-full w-full object-contain"
          />
        </Link>
        <div className="flex flex-col leading-none">
          <span className="font-display text-[13px] font-700 text-[var(--color-foreground)]">
            Faiceoff
          </span>
          <span className="text-[9px] font-mono font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
            Admin console
          </span>
        </div>
      </div>

      {/* Nav — grouped */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {groupOrder.map((group) => (
          <div key={group} className="mb-5">
            <p className="mb-2 px-2 text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
              {group}
            </p>
            <div className="flex flex-col gap-0.5">
              {grouped[group].map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                const count = counts[item.href];
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors ${
                      active
                        ? "bg-[var(--color-secondary)] font-700 text-[var(--color-foreground)]"
                        : "font-500 text-[var(--color-muted-foreground)] hover:bg-[var(--color-secondary)] hover:text-[var(--color-foreground)]"
                    }`}
                  >
                    <Icon
                      className="shrink-0"
                      style={{
                        width: "16px",
                        height: "16px",
                        color: active ? "var(--color-primary)" : "currentColor",
                      }}
                    />
                    <span className="flex-1 truncate">{item.label}</span>
                    {typeof count === "number" && count > 0 && (
                      <span
                        className={`rounded-full px-1.5 py-px text-[10px] font-700 ${
                          active
                            ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                            : "bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer hint */}
      <div className="border-t border-[var(--color-border)] px-4 py-3 text-[10px] font-mono text-[var(--color-muted-foreground)]">
        <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-secondary)] px-1.5 py-0.5">⌘K</kbd>{" "}
        to jump anywhere
      </div>
    </aside>
  );
}
