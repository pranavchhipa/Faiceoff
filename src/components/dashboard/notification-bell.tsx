"use client";

import { Bell } from "lucide-react";

/**
 * NotificationBell — compact bell with optional unread dot.
 * Currently a static UI stub; wire up to a real notifications
 * feed (Novu / Supabase Realtime) when that ships.
 */
export function NotificationBell({ count = 0 }: { count?: number }) {
  return (
    <button
      type="button"
      aria-label={count > 0 ? `${count} new notifications` : "Notifications"}
      className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-secondary)] hover:text-[var(--color-foreground)]"
    >
      <Bell className="h-4 w-4" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-destructive)] px-1 text-[9px] font-700 text-[var(--color-destructive-foreground)] ring-2 ring-[var(--color-background)]">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </button>
  );
}
