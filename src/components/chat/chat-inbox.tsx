"use client";

/**
 * ChatInbox — split-pane chat UI shared by brand + creator surfaces.
 *
 * Architecture:
 *   • Left pane: conversation list (sidebar), sorted by last_message_at desc
 *   • Right pane: <ChatThread> for the active conversation
 *   • Auto-selects conversation from `?conversation=<id>` URL param so deep
 *     links from the collab page open the right thread directly (no extra
 *     click). Updates URL on conversation switch via router.replace.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Loader2, MessageSquare } from "lucide-react";
import { ChatThread, type MessageRow } from "./chat-thread";

interface Counterparty {
  name: string;
  avatar_url: string | null;
}

interface ConversationItem {
  id: string;
  brand_id: string;
  creator_id: string;
  created_at: string;
  last_message_at: string | null;
  counterparty: Counterparty;
  unread_count: number;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays < 7) {
    return d.toLocaleDateString("en-IN", { weekday: "short" });
  }
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

export function ChatInbox() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [role, setRole] = useState<"brand" | "creator" | null>(null);

  /* ── Load conversations ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/chat/conversations");
        if (!res.ok) {
          setLoadingConvs(false);
          return;
        }
        const json = await res.json();
        if (cancelled) return;
        setConversations(json.conversations ?? []);
        setRole(json.role ?? null);
      } finally {
        if (!cancelled) setLoadingConvs(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ── Auto-select conversation from URL ?conversation=xxx ── */
  useEffect(() => {
    const fromUrl = searchParams.get("conversation");
    if (fromUrl && fromUrl !== activeId) {
      setActiveId(fromUrl);
    }
  // Only when URL or list changes — avoid loop on activeId.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, conversations.length]);

  const selectConversation = useCallback(
    (id: string | null) => {
      setActiveId(id);
      // Reflect in URL so back/forward + refresh restore the open thread
      const params = new URLSearchParams(searchParams.toString());
      if (id) params.set("conversation", id);
      else params.delete("conversation");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      // Locally clear unread badge when opening
      if (id) {
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? { ...c, unread_count: 0 } : c)),
        );
      }
    },
    [pathname, router, searchParams],
  );

  /* ── Bump conversation in sidebar when a remote message arrives ── */
  const onMessageReceived = useCallback(
    (msg: MessageRow) => {
      setConversations((prev) =>
        prev
          .map((c) =>
            c.id === msg.conversation_id
              ? {
                  ...c,
                  last_message_at: msg.created_at,
                  unread_count:
                    c.id === activeId ? 0 : (c.unread_count ?? 0) + 1,
                }
              : c,
          )
          .sort((a, b) => {
            const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
            const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
            return tb - ta;
          }),
      );
    },
    [activeId],
  );

  const activeConv = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );

  return (
    <div className="grid h-[calc(100vh-200px)] min-h-[500px] grid-cols-1 overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] shadow-[var(--shadow-soft)] md:grid-cols-[320px_minmax(0,1fr)]">
      {/* ───── Sidebar ───── */}
      <aside
        className={`flex flex-col border-r border-[var(--color-border)] bg-[var(--color-secondary)] ${
          activeId ? "hidden md:flex" : "flex"
        }`}
      >
        <div className="border-b border-[var(--color-border)] px-4 py-3">
          <p className="text-[10px] font-700 uppercase tracking-widest text-[var(--color-muted-foreground)]">
            Inbox
          </p>
          <h2 className="mt-0.5 text-base font-700 text-[var(--color-foreground)]">
            Conversations
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingConvs ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-4 animate-spin text-[var(--color-muted-foreground)]" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-[var(--color-card)]">
                <MessageSquare className="size-5 text-[var(--color-muted-foreground)]" />
              </div>
              <p className="text-sm font-600 text-[var(--color-foreground)]">
                No conversations yet
              </p>
              <p className="mt-1 max-w-[220px] text-xs text-[var(--color-muted-foreground)]">
                Chats unlock after the first approved license between you and
                a {role === "brand" ? "creator" : "brand"}.
              </p>
            </div>
          ) : (
            <div className="py-1">
              {conversations.map((c) => {
                const active = c.id === activeId;
                const initials =
                  c.counterparty.name
                    .split(" ")
                    .slice(0, 2)
                    .map((s) => s[0])
                    .join("")
                    .toUpperCase() || "??";
                return (
                  <button
                    key={c.id}
                    onClick={() => selectConversation(c.id)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                      active
                        ? "bg-[var(--color-card)]"
                        : "hover:bg-[var(--color-card)]/50"
                    }`}
                  >
                    <div className="relative">
                      {c.counterparty.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={c.counterparty.avatar_url}
                          alt=""
                          className="size-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex size-10 items-center justify-center rounded-full bg-[var(--color-primary)]/15 text-xs font-700 text-[var(--color-primary)]">
                          {initials}
                        </div>
                      )}
                      {c.unread_count > 0 && (
                        <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-[var(--color-primary)] text-[9px] font-700 text-[var(--color-primary-foreground)]">
                          {c.unread_count > 9 ? "9+" : c.unread_count}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-600 text-[var(--color-foreground)]">
                        {c.counterparty.name}
                      </p>
                      <p className="text-[11px] text-[var(--color-muted-foreground)]">
                        {c.last_message_at
                          ? fmtTime(c.last_message_at)
                          : "No messages yet"}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      {/* ───── Thread ───── */}
      <section
        className={`flex flex-col bg-[var(--color-card)] ${
          activeId ? "flex" : "hidden md:flex"
        }`}
      >
        {!activeConv ? (
          <div className="flex flex-1 items-center justify-center px-6 text-center">
            <div>
              <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-[var(--color-secondary)]">
                <MessageSquare className="size-6 text-[var(--color-muted-foreground)]" />
              </div>
              <p className="text-sm font-600 text-[var(--color-foreground)]">
                Select a conversation
              </p>
              <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                Pick a thread on the left to start chatting.
              </p>
            </div>
          </div>
        ) : (
          <ChatThread
            conversationId={activeConv.id}
            counterparty={{
              name: activeConv.counterparty.name,
              avatar_url: activeConv.counterparty.avatar_url,
              subtitle: role === "brand" ? "Creator" : "Brand",
            }}
            onBack={() => selectConversation(null)}
            onMessageReceived={onMessageReceived}
          />
        )}
      </section>
    </div>
  );
}
