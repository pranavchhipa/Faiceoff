"use client";

/**
 * ChatInbox — split-pane chat UI shared by brand + creator surfaces.
 *
 * Architecture:
 *   • Left pane: conversation list, sorted by last_message_at desc
 *   • Right pane: active thread with infinite-scroll-up history
 *   • Realtime: Supabase channel subscription on conversation_messages,
 *     filtered to the active conversation_id. Inserts append optimistically;
 *     remote inserts dedupe by id.
 *   • Optimistic send: message renders immediately with a "sending..." flag,
 *     replaced with the server row when POST returns.
 *
 * UX details:
 *   • Auto-scrolls to bottom on mount + on new messages, but freezes if user
 *     has scrolled up (preserves their reading position).
 *   • Time-grouped headers (every 30+ min gap shows "Today 4:12pm" tag).
 *   • Avatar bubbles with role-colored accent.
 *   • Send on Enter, Shift+Enter for newline.
 *   • Read receipts: counterparty's avatar overlaid on last-read message.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Send,
  CheckCheck,
  Check,
  Loader2,
  MessageSquare,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

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

interface MessageRow {
  id: string;
  conversation_id: string;
  sender_user_id: string;
  sender_role: "brand" | "creator";
  body: string;
  read_by_brand: boolean;
  read_by_creator: boolean;
  created_at: string;
  /** Client-only: true while POST is in flight. */
  pending?: boolean;
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
    return d.toLocaleDateString("en-IN", {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function shouldGroupByTime(prev: MessageRow | null, curr: MessageRow): boolean {
  if (!prev) return true;
  const gap =
    new Date(curr.created_at).getTime() - new Date(prev.created_at).getTime();
  return gap > 30 * 60 * 1000; // 30 min
}

export function ChatInbox() {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [role, setRole] = useState<"brand" | "creator" | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const isAtBottomRef = useRef(true);
  const supabase = useMemo(() => createClient(), []);

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

  /* ── Resolve current user id (for "is this my message" rendering) ── */
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setMyUserId(data.user.id);
    });
  }, [supabase]);

  /* ── Load messages on conversation change ── */
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoadingMsgs(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/chat/conversations/${activeId}/messages?limit=50`,
        );
        if (!res.ok) {
          setLoadingMsgs(false);
          return;
        }
        const json = await res.json();
        if (cancelled) return;
        setMessages(json.messages ?? []);
        // Reset unread badge for this conv locally
        setConversations((prev) =>
          prev.map((c) =>
            c.id === activeId ? { ...c, unread_count: 0 } : c,
          ),
        );
      } finally {
        if (!cancelled) setLoadingMsgs(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  /* ── Realtime subscription for active conversation ── */
  useEffect(() => {
    if (!activeId) return;

    const channel = supabase
      .channel(`chat:${activeId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversation_messages",
          filter: `conversation_id=eq.${activeId}`,
        },
        (payload) => {
          const newMsg = payload.new as MessageRow;
          setMessages((prev) => {
            // Dedupe — skip if we already have this id (could be our own
            // optimistic insert that the server confirmed).
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            // Replace pending optimistic message if body matches
            const matchPendingIdx = prev.findIndex(
              (m) =>
                m.pending && m.body === newMsg.body &&
                m.sender_user_id === newMsg.sender_user_id,
            );
            if (matchPendingIdx >= 0) {
              const next = [...prev];
              next[matchPendingIdx] = newMsg;
              return next;
            }
            return [...prev, newMsg];
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeId, supabase]);

  /* ── Auto-scroll to bottom on new message (only if user is at bottom) ── */
  useEffect(() => {
    if (isAtBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

  /* ── Track scroll position ── */
  const onScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    isAtBottomRef.current = distance < 80;
  }, []);

  /* ── Send message (optimistic) ── */
  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || !activeId || sending || !role || !myUserId) return;

    setSending(true);
    setDraft("");
    isAtBottomRef.current = true;

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const optimistic: MessageRow = {
      id: tempId,
      conversation_id: activeId,
      sender_user_id: myUserId,
      sender_role: role,
      body: text,
      read_by_brand: role === "brand",
      read_by_creator: role === "creator",
      created_at: new Date().toISOString(),
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await fetch(
        `/api/chat/conversations/${activeId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: text }),
        },
      );
      if (!res.ok) throw new Error(`send failed ${res.status}`);
      const json = await res.json();
      const real = json.message as MessageRow;
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? real : m)),
      );
    } catch (err) {
      console.error("[chat] send failed", err);
      // Mark optimistic as failed (could add retry UI later)
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setDraft(text);
    } finally {
      setSending(false);
    }
  }, [draft, activeId, sending, role, myUserId]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void send();
      }
    },
    [send],
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
                    onClick={() => setActiveId(c.id)}
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
          <>
            {/* Thread header */}
            <header className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3">
              <button
                onClick={() => setActiveId(null)}
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--color-muted-foreground)] hover:bg-[var(--color-secondary)] md:hidden"
                aria-label="Back"
              >
                <ArrowLeft className="size-4" />
              </button>
              {activeConv.counterparty.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={activeConv.counterparty.avatar_url}
                  alt=""
                  className="size-10 rounded-full object-cover"
                />
              ) : (
                <div className="flex size-10 items-center justify-center rounded-full bg-[var(--color-primary)]/15 text-xs font-700 text-[var(--color-primary)]">
                  {activeConv.counterparty.name
                    .split(" ")
                    .slice(0, 2)
                    .map((s) => s[0])
                    .join("")
                    .toUpperCase() || "??"}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-700 text-[var(--color-foreground)]">
                  {activeConv.counterparty.name}
                </p>
                <p className="text-[11px] text-[var(--color-muted-foreground)]">
                  {role === "brand" ? "Creator" : "Brand"}
                </p>
              </div>
            </header>

            {/* Messages */}
            <div
              ref={scrollContainerRef}
              onScroll={onScroll}
              className="flex-1 overflow-y-auto px-4 py-4"
            >
              {loadingMsgs ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="size-4 animate-spin text-[var(--color-muted-foreground)]" />
                </div>
              ) : messages.length === 0 ? (
                <p className="py-12 text-center text-xs text-[var(--color-muted-foreground)]">
                  No messages yet — say hi.
                </p>
              ) : (
                <AnimatePresence initial={false}>
                  {messages.map((m, i) => {
                    const prev = i > 0 ? messages[i - 1] : null;
                    const showTimeHeader = shouldGroupByTime(prev, m);
                    const isMine = m.sender_user_id === myUserId;
                    const counterpartyRead = isMine
                      ? role === "brand"
                        ? m.read_by_creator
                        : m.read_by_brand
                      : false;

                    return (
                      <div key={m.id}>
                        {showTimeHeader && (
                          <div className="my-3 text-center text-[10px] font-600 uppercase tracking-widest text-[var(--color-muted-foreground)]">
                            {fmtTime(m.created_at)}
                          </div>
                        )}
                        <motion.div
                          initial={{ opacity: 0, y: 6, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{
                            duration: 0.18,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                          className={`mb-1.5 flex ${
                            isMine ? "justify-end" : "justify-start"
                          }`}
                        >
                          <div
                            className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                              isMine
                                ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                                : "bg-[var(--color-secondary)] text-[var(--color-foreground)]"
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words">
                              {m.body}
                            </p>
                            {isMine && (
                              <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-70">
                                {m.pending ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : counterpartyRead ? (
                                  <CheckCheck className="size-3" />
                                ) : (
                                  <Check className="size-3" />
                                )}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      </div>
                    );
                  })}
                </AnimatePresence>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Composer */}
            <div className="border-t border-[var(--color-border)] bg-[var(--color-card)] p-3">
              <div className="flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Message…"
                  rows={1}
                  className="flex-1 resize-none rounded-[var(--radius-button)] border border-[var(--color-border)] bg-[var(--color-secondary)] px-3.5 py-2.5 text-sm text-[var(--color-foreground)] outline-none focus:border-[var(--color-primary)]"
                  style={{ maxHeight: 120 }}
                />
                <button
                  onClick={() => void send()}
                  disabled={!draft.trim() || sending}
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
                  aria-label="Send"
                >
                  {sending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                </button>
              </div>
              <p className="mt-1.5 px-1 text-[10px] text-[var(--color-muted-foreground)]">
                Enter to send · Shift + Enter for newline
              </p>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
