"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { CREATOR_SIDE_NAV } from "@/config/nav-items.creator";

/**
 * CreatorPillNav — horizontal pill-tab navigation for Creator chrome.
 *
 * Sits in the top bar's left slot (no sidebar). Primary items only;
 * secondary items are reachable via ⌘K and the overflow menu.
 * Active pill uses a Framer `layoutId` for a smooth sliding highlight.
 */
export function CreatorPillNav() {
  const pathname = usePathname();

  const primary = CREATOR_SIDE_NAV.filter((n) => n.group === "Primary");

  function isActive(href: string) {
    if (href === "/creator/dashboard") return pathname === href;
    return pathname.startsWith(href);
  }

  const activeHref = primary.find((n) => isActive(n.href))?.href;

  return (
    <div className="flex items-center gap-3">
      {/* Compact wordmark — clicks home */}
      <Link
        href="/creator/dashboard"
        aria-label="Faiceoff home"
        className="shrink-0 font-display text-base font-800 tracking-tight text-[var(--color-foreground)] hover:text-[var(--color-primary)]"
      >
        Faiceoff<span className="text-[var(--color-primary)]">.</span>
      </Link>

      <span className="hidden h-5 w-px bg-[var(--color-border)] md:block" />

      {/* Pill tabs */}
      <nav className="relative hidden items-center gap-0.5 rounded-full border border-[var(--color-border)] bg-[var(--color-card)] p-1 md:flex">
        {primary.map((item) => {
          const active = activeHref === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="relative z-10 flex h-8 items-center rounded-full px-3 text-[13px] font-600 transition-colors"
              style={{
                color: active ? "var(--color-primary-foreground)" : "var(--color-muted-foreground)",
              }}
            >
              {active && (
                <motion.span
                  layoutId="creator-pill-active"
                  className="absolute inset-0 rounded-full bg-[var(--color-primary)]"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                {item.label}
                {item.href === "/creator/approvals" && (
                  <span
                    className={`rounded-full px-1.5 py-px text-[10px] font-700 ${
                      active
                        ? "bg-[var(--color-primary-foreground)]/15 text-[var(--color-primary-foreground)]"
                        : "bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
                    }`}
                  >
                    2
                  </span>
                )}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
