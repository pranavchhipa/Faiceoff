"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Logo } from "@/components/brand/logo";
import { CREATOR_SIDE_NAV } from "@/config/nav-items.creator";

/**
 * CreatorIconRail — collapsible vertical sidebar for creators (desktop only).
 *
 * Replaces the old top pill-tab nav. Same expand/collapse pattern as
 * BrandIconRail: closed = 56px icon-only rail with tooltips, open = 224px
 * with Faiceoff logo + wordmark + nav labels.
 */
export function CreatorIconRail() {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem("creator-sidebar-expanded") === "true") {
        setExpanded(true);
      }
    } catch {
      // Private browsing — ignore
    }
  }, []);

  function toggle() {
    setExpanded((v) => {
      const next = !v;
      try {
        localStorage.setItem("creator-sidebar-expanded", String(next));
      } catch {}
      return next;
    });
  }

  const grouped = CREATOR_SIDE_NAV.reduce<Record<string, typeof CREATOR_SIDE_NAV>>(
    (acc, item) => {
      const g = item.group ?? "Default";
      if (!acc[g]) acc[g] = [];
      acc[g].push(item);
      return acc;
    },
    {},
  );
  const groupOrder = Array.from(
    new Set(CREATOR_SIDE_NAV.map((i) => i.group ?? "Default")),
  );

  function isActive(href: string) {
    if (href === "/creator/dashboard") return pathname === href;
    return pathname.startsWith(href);
  }

  return (
    <TooltipProvider delayDuration={120} skipDelayDuration={80}>
      <aside
        style={{ width: expanded ? "224px" : "56px" }}
        className="sticky top-0 hidden h-screen shrink-0 flex-col items-center overflow-hidden border-r border-[var(--color-border)] bg-[var(--color-card)] py-3 transition-all duration-200 ease-in-out lg:flex"
      >
        {/* ── Logo ── */}
        <Link
          href="/creator/dashboard"
          aria-label="Faiceoff home"
          className={`flex h-10 items-center transition-transform hover:scale-[1.03] ${
            expanded ? "w-full gap-2.5 px-4" : "w-10 justify-center"
          }`}
        >
          {expanded ? (
            <Logo variant="full" adaptive className="h-6 w-auto" />
          ) : (
            <Logo variant="mark" className="h-7 w-7 shrink-0" />
          )}
        </Link>

        {/* Divider below logo */}
        <div className="my-3 h-px w-6 bg-[var(--color-border)]" />

        {/* ── Expand / Collapse toggle — top of rail so it's always visible ── */}
        <div className={`mb-1 ${expanded ? "w-full px-2" : ""}`}>
          <button
            type="button"
            onClick={toggle}
            aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
            className={`flex items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-secondary)] hover:text-[var(--color-foreground)] ${
              expanded
                ? "h-8 w-full gap-2 px-3 text-[12px] font-600"
                : "h-8 w-8"
            }`}
          >
            {expanded ? (
              <>
                <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
                <span>Collapse</span>
              </>
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        </div>

        <div className="mb-2 h-px w-6 bg-[var(--color-border)]" />

        {/* ── Nav items ── */}
        <nav
          className={`flex flex-1 flex-col gap-0.5 overflow-y-auto ${
            expanded ? "w-full px-2" : "items-center"
          }`}
        >
          {groupOrder.map((group, idx) => (
            <div
              key={group}
              className={`flex flex-col gap-0.5 ${expanded ? "w-full" : "items-center"}`}
            >
              {idx > 0 && (
                <div
                  className={`my-1.5 h-px bg-[var(--color-border)] ${
                    expanded ? "mx-1" : "w-6"
                  }`}
                />
              )}

              {expanded && groupOrder.length > 1 && (
                <p className="mb-1 px-3 text-[10px] font-700 uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                  {group}
                </p>
              )}

              {grouped[group].map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);

                /* Expanded: full-width pill row */
                if (expanded) {
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-all ${
                        active
                          ? "bg-[var(--color-primary)] font-700 text-[var(--color-primary-foreground)] shadow-[0_2px_8px_-2px_rgba(201,169,110,0.4)]"
                          : "font-600 text-[var(--color-muted-foreground)] hover:bg-[var(--color-secondary)] hover:text-[var(--color-foreground)]"
                      }`}
                    >
                      <Icon
                        style={{ width: "16px", height: "16px" }}
                        className="shrink-0"
                      />
                      <span>{item.label}</span>
                    </Link>
                  );
                }

                /* Collapsed: icon-only square with tooltip */
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
