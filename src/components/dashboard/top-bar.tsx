"use client";

import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";
import type { Role } from "@/config/routes";

interface TopBarProps {
  role: Role | null;
  displayName: string;
  email?: string | null;
  avatarUrl?: string | null;
  onOpenCommandPalette: () => void;
  /** Optional left-hand slot (e.g. Creator pill nav or breadcrumb). */
  leftSlot?: React.ReactNode;
}

/**
 * TopBar — shared desktop top bar.
 *
 * Layout: [left-slot] ... [search trigger (⌘K)] [theme] [notif] [user]
 *
 * Variants handled via `leftSlot`:
 *  - Brand: breadcrumb + page title (rail handles nav)
 *  - Creator: CreatorPillNav (sits in the left slot since there's no sidebar)
 *  - Admin: page title (left sidebar handles section nav)
 */
export function TopBar({
  role,
  displayName,
  email,
  avatarUrl,
  onOpenCommandPalette,
  leftSlot,
}: TopBarProps) {
  const pathname = usePathname();
  // Derive a page title if no leftSlot provided (fallback)
  const fallbackTitle = pathToTitle(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-background)]/85 px-4 backdrop-blur-xl lg:px-6">
      {/* Left: slot or fallback page title */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {leftSlot ?? (
          <h1 className="truncate font-display text-[15px] font-700 tracking-tight text-[var(--color-foreground)]">
            {fallbackTitle}
          </h1>
        )}
      </div>

      {/* Right: search + actions */}
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onOpenCommandPalette}
          aria-label="Open command palette"
          className="hidden h-9 items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-[13px] text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-secondary)] hover:text-[var(--color-foreground)] md:flex md:min-w-[240px]"
        >
          <Search className="h-4 w-4" />
          <span className="flex-1 text-left">Search or jump to…</span>
          <kbd className="flex items-center gap-0.5 rounded border border-[var(--color-border)] bg-[var(--color-background)] px-1.5 py-0.5 font-mono text-[10px] font-600 text-[var(--color-muted-foreground)]">
            ⌘K
          </kbd>
        </button>

        {/* Mobile: icon-only search button */}
        <button
          type="button"
          onClick={onOpenCommandPalette}
          aria-label="Search"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-secondary)] md:hidden"
        >
          <Search className="h-4 w-4" />
        </button>

        <ThemeToggle />
        <NotificationBell count={0} />
        <UserMenu
          displayName={displayName}
          email={email}
          avatarUrl={avatarUrl}
          role={role}
        />
      </div>
    </header>
  );
}

function pathToTitle(pathname: string): string {
  const segs = pathname.split("/").filter(Boolean);
  if (segs.length === 0) return "Dashboard";
  const last = segs[segs.length - 1];
  // Strip dynamic [id] style tokens
  if (/^\[.*\]$/.test(last) || /^[0-9a-f-]{24,}$/i.test(last)) {
    return segs.slice(0, -1).slice(-1)[0]?.replace(/-/g, " ") ?? "Dashboard";
  }
  return last.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
