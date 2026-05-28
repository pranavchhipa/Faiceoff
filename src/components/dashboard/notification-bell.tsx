"use client";

/**
 * NotificationBell — live notification feed in the topbar.
 *
 * Three layers of freshness (so a new notification feels instant even when
 * one layer is wobbly):
 *
 *   1. Initial fetch on mount + a 20s visible-tab poll (was 45s — too slow
 *      to feel "real-time" even as a fallback).
 *   2. Supabase realtime subscription on `public.notifications` INSERTs
 *      filtered to the current user's id — pushes new rows to the bell
 *      the moment they're written server-side. Requires the table to be
 *      in the supabase_realtime publication (see migration 00062).
 *   3. A sonner toast pops for every NEW notification that arrives via
 *      realtime, so the brand/creator sees the message even if their bell
 *      is closed. Clicking the toast deep-links to the notification's href.
 *
 * Marking-read flow is unchanged — single-row optimistic update + POST to
 * /api/notifications/read; "Mark all read" clears the badge in one shot.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Bell,
  CheckCheck,
  Inbox,
  IndianRupee,
  ImageIcon,
  MessageSquare,
  Megaphone,
  LifeBuoy,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
}

const POLL_MS = 20_000;

function iconFor(type: string) {
  switch (type) {
    case "collab_request":
    case "collab_accepted":
    case "collab_declined":
      return <Megaphone className="h-3.5 w-3.5" />;
    case "payment_received":
    case "credits_granted":
    case "payout":
      return <IndianRupee className="h-3.5 w-3.5" />;
    case "generation_ready":
      return <ImageIcon className="h-3.5 w-3.5" />;
    case "approval_requested":
    case "approval_approved":
    case "approval_rejected":
      return <Inbox className="h-3.5 w-3.5" />;
    case "ticket_opened":
    case "ticket_reply":
    case "ticket_resolved":
      return <LifeBuoy className="h-3.5 w-3.5" />;
    case "system":
      return <Sparkles className="h-3.5 w-3.5" />;
    default:
      return <MessageSquare className="h-3.5 w-3.5" />;
  }
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
}

export function NotificationBell() {
  const router = useRouter();
  const { user, supabase } = useAuth();

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  // bumps a short animation class on the bell when a brand-new notification
  // arrives via realtime — visual cue to glance at the badge.
  const [pulseKey, setPulseKey] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  // Track seen ids so realtime + poll never both toast / dupe the same row.
  const seenIdsRef = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const fetched: Notification[] = data.notifications ?? [];
      setItems(fetched);
      setUnread(data.unread ?? 0);
      // Prime the seen set so realtime doesn't re-toast already-fetched rows.
      for (const n of fetched) seenIdsRef.current.add(n.id);
    } catch {
      // best-effort
    }
  }, []);

  // Initial load + visible-tab poll (20s fallback in case realtime is down).
  useEffect(() => {
    load();
    const tick = () => {
      if (!document.hidden) load();
    };
    const h = setInterval(tick, POLL_MS);
    const onVis = () => {
      if (!document.hidden) load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(h);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  // ── Realtime — instant push for new notifications ───────────────────────
  // Subscribes to INSERT events on public.notifications filtered by the
  // current user's id. Requires the table to be in the supabase_realtime
  // publication (migration 00062). If realtime is unavailable, the poll
  // above still picks new rows within 20s.
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`notif:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as Notification | undefined;
          if (!row || !row.id) return;
          // Dedupe — if we already saw this id from the initial fetch or a
          // previous realtime event, skip the toast + state update.
          if (seenIdsRef.current.has(row.id)) return;
          seenIdsRef.current.add(row.id);

          // Push to the dropdown list (newest first), cap to 30 like the API
          setItems((prev) => [row, ...prev].slice(0, 30));
          if (!row.read_at) setUnread((u) => u + 1);

          // Animate the bell briefly so the user notices
          setPulseKey((k) => k + 1);

          // Pop a sonner toast — click navigates to the href
          toast(row.title, {
            description: row.body ?? undefined,
            duration: 6_000,
            action: row.href
              ? {
                  label: "Open",
                  onClick: () => router.push(row.href as string),
                }
              : undefined,
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, supabase, router]);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function markAllRead() {
    setUnread(0);
    setItems((prev) =>
      prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })),
    );
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
    } catch {}
  }

  async function handleRowClick(n: Notification) {
    if (!n.read_at) {
      setUnread((u) => Math.max(0, u - 1));
      setItems((prev) =>
        prev.map((x) =>
          x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x,
        ),
      );
      fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [n.id] }),
      }).catch(() => {});
    }
    setOpen(false);
    if (n.href) router.push(n.href);
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Local keyframes for the brief bell shake when a new notification
          arrives, and the badge ping ring. Scoped via classnames so they
          don't leak. Using a plain <style> + dangerouslySetInnerHTML to avoid
          any styled-jsx / App Router edge cases. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes fco-notif-shake {
              0%   { transform: rotate(0); }
              15%  { transform: rotate(-14deg); }
              30%  { transform: rotate(12deg); }
              45%  { transform: rotate(-8deg); }
              60%  { transform: rotate(6deg); }
              75%  { transform: rotate(-3deg); }
              100% { transform: rotate(0); }
            }
            @keyframes fco-notif-ping {
              75%, 100% { transform: scale(2); opacity: 0; }
            }
            .fco-notif-ping {
              animation: fco-notif-ping 1.2s cubic-bezier(0, 0, 0.2, 1) infinite;
            }
            .fco-notif-shake {
              animation: fco-notif-shake 0.7s ease-in-out 1;
              transform-origin: 50% 0%;
            }
          `,
        }}
      />

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={unread > 0 ? `${unread} new notifications` : "Notifications"}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-secondary)] hover:text-[var(--color-foreground)]"
      >
        <Bell
          key={pulseKey}
          className={`h-4 w-4 ${pulseKey > 0 ? "fco-notif-shake" : ""}`}
        />
        {unread > 0 && (
          <>
            {/* Subtle ping ring under the badge — the unread state's "I'm alive" cue */}
            <span
              aria-hidden
              className="fco-notif-ping absolute -right-1 -top-1 h-4 w-4 rounded-full bg-[var(--color-primary)] opacity-60"
            />
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-primary)] px-1 text-[9px] font-700 text-[var(--color-primary-foreground)] ring-2 ring-[var(--color-background)]">
              {unread > 9 ? "9+" : unread}
            </span>
          </>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-[0_16px_48px_-12px_rgba(0,0,0,0.35)]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
            <span className="font-display text-[14px] font-700 text-[var(--color-foreground)]">
              Notifications
            </span>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="flex items-center gap-1 text-[11px] font-600 text-[var(--color-primary)] hover:underline"
              >
                <CheckCheck className="h-3 w-3" />
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[420px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-secondary)] text-[var(--color-muted-foreground)]">
                  <Bell className="h-4 w-4" />
                </span>
                <p className="text-[13px] font-600 text-[var(--color-foreground)]">
                  You&apos;re all caught up
                </p>
                <p className="text-[12px] text-[var(--color-muted-foreground)]">
                  New activity shows up here.
                </p>
              </div>
            ) : (
              items.map((n) => (
                <button
                  type="button"
                  key={n.id}
                  onClick={() => handleRowClick(n)}
                  className={`flex w-full items-start gap-3 border-b border-[var(--color-border)] px-4 py-3 text-left transition-colors last:border-0 hover:bg-[var(--color-secondary)] ${
                    n.read_at ? "" : "bg-[var(--color-primary)]/[0.04]"
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                      n.read_at
                        ? "bg-[var(--color-secondary)] text-[var(--color-muted-foreground)]"
                        : "bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
                    }`}
                  >
                    {iconFor(n.type)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] font-700 leading-snug text-[var(--color-foreground)]">
                        {n.title}
                      </p>
                      <span className="shrink-0 font-mono text-[10px] text-[var(--color-muted-foreground)]">
                        {timeAgo(n.created_at)}
                      </span>
                    </div>
                    {n.body && (
                      <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-[var(--color-muted-foreground)]">
                        {n.body}
                      </p>
                    )}
                  </div>
                  {!n.read_at && (
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-primary)]" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
