"use client";

/**
 * ChatThread — single-conversation chat view.
 *
 * Used standalone (embedded inside a collab page) or as the right pane of
 * <ChatInbox />. Self-contained: handles message loading, realtime subscribe,
 * optimistic send, read-receipt sync, presence (online + typing), failed-send
 * retry, infinite scroll-up, and "new messages while scrolled up" indicator.
 *
 * Props:
 *   - conversationId: which conversation to render (required)
 *   - counterparty: { name, avatar_url } — for the header (optional, header
 *     hidden if not provided)
 *   - showHeader: render the top header strip (default true)
 *   - onBack: optional back button handler (mobile inbox flow)
 *   - className: optional class override for outer container
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
  AlertCircle,
  RefreshCw,
  ChevronDown,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface Counterparty {
  name: string;
  avatar_url: string | null;
  subtitle?: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_user_id: string;
  sender_role: "brand" | "creator";
  body: string;
  read_by_brand: boolean;
  read_by_creator: boolean;
  created_at: string;
  /** Client-only flags */
  pending?: boolean;
  failed?: boolean;
  /** Original draft text for retry */
  _retryBody?: string;
}

interface ChatThreadProps {
  conversationId: string;
  counterparty?: Counterparty;
  showHeader?: boolean;
  onBack?: () => void;
  className?: string;
  /**
   * Notifies parent when this thread receives a remote message. Inbox uses
   * this to bump the conversation in the sidebar list.
   */
  onMessageReceived?: (msg: MessageRow) => void;
}

/* ── Helpers ───────────────────────────────────────────── */

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Date separator label: "Today" / "Yesterday" / weekday / full date. */
function daySeparatorLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (isSameDay(d, now)) return "Today";
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (isSameDay(d, yest)) return "Yesterday";
  const diffDays = Math.floor(
    (now.getTime() - d.getTime()) / 86400000,
  );
  if (diffDays < 7) {
    return d.toLocaleDateString("en-IN", { weekday: "long" });
  }
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: now.getFullYear() === d.getFullYear() ? undefined : "numeric",
  });
}

/** HH:MM time, locale-friendly. */
function fmtClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Should we render a new day separator before this message? */
function shouldShowDaySep(prev: MessageRow | null, curr: MessageRow): boolean {
  if (!prev) return true;
  return !isSameDay(new Date(prev.created_at), new Date(curr.created_at));
}

/* ── Component ─────────────────────────────────────────── */

export function ChatThread({
  conversationId,
  counterparty,
  showHeader = true,
  onBack,
  className = "",
  onMessageReceived,
}: ChatThreadProps) {
  const supabase = useMemo(() => createClient(), []);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [role, setRole] = useState<"brand" | "creator" | null>(null);

  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Counterparty presence
  const [counterpartyOnline, setCounterpartyOnline] = useState(false);
  const [counterpartyTyping, setCounterpartyTyping] = useState(false);

  // "X new messages while you were scrolled up" indicator
  const [unreadBelow, setUnreadBelow] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const isAtBottomRef = useRef(true);
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef(0);

  /* ── Resolve current user id ── */
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setMyUserId(data.user.id);
    });
  }, [supabase]);

  /* ── Load initial messages ── */
  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    setLoading(true);
    setMessages([]);
    setHasMore(false);
    (async () => {
      try {
        const res = await fetch(
          `/api/chat/conversations/${conversationId}/messages?limit=50`,
        );
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        setMessages(json.messages ?? []);
        setRole(json.role ?? null);
        setHasMore(!!json.has_more);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  /* ── Realtime subscription (INSERT new messages + UPDATE for read receipts) ── */
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`chat:msgs:${conversationId}`)
      // New incoming message
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversation_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMsg = payload.new as MessageRow;
          setMessages((prev) => {
            // Already have it (own optimistic confirmed)
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            // Replace pending optimistic if body matches
            const matchPending = prev.findIndex(
              (m) =>
                m.pending &&
                m.body === newMsg.body &&
                m.sender_user_id === newMsg.sender_user_id,
            );
            if (matchPending >= 0) {
              const next = [...prev];
              next[matchPending] = newMsg;
              return next;
            }
            return [...prev, newMsg];
          });
          if (newMsg.sender_user_id !== myUserId) {
            onMessageReceived?.(newMsg);
            if (!isAtBottomRef.current) {
              setUnreadBelow((n) => n + 1);
            }
          }
        },
      )
      // Read receipt update (counterparty read our messages)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversation_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const upd = payload.new as MessageRow;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === upd.id
                ? {
                    ...m,
                    read_by_brand: upd.read_by_brand,
                    read_by_creator: upd.read_by_creator,
                  }
                : m,
            ),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, supabase, myUserId, onMessageReceived]);

  /* ── Presence (online + typing) on a separate channel ── */
  useEffect(() => {
    if (!conversationId || !myUserId) return;

    const channel = supabase.channel(`chat:presence:${conversationId}`, {
      config: { presence: { key: myUserId } },
    });
    presenceChannelRef.current = channel;

    const updateOnline = () => {
      const state = channel.presenceState() as Record<string, unknown[]>;
      // Anyone besides me present in the channel?
      const others = Object.keys(state).filter((k) => k !== myUserId);
      setCounterpartyOnline(others.length > 0);
    };

    channel
      .on("presence", { event: "sync" }, updateOnline)
      .on("presence", { event: "join" }, updateOnline)
      .on("presence", { event: "leave" }, updateOnline)
      .on("broadcast", { event: "typing" }, (payload) => {
        const fromUserId = (payload.payload as { user_id?: string })?.user_id;
        if (!fromUserId || fromUserId === myUserId) return;
        setCounterpartyTyping(true);
        // Auto-clear after 3.5s of no further typing events
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => {
          setCounterpartyTyping(false);
        }, 3500);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: myUserId,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      supabase.removeChannel(channel);
      presenceChannelRef.current = null;
      setCounterpartyOnline(false);
      setCounterpartyTyping(false);
    };
  }, [conversationId, supabase, myUserId]);

  /* ── Auto-scroll on new messages (only if user was already at bottom) ── */
  useEffect(() => {
    if (isAtBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setUnreadBelow(0);
    }
  }, [messages.length]);

  /* ── Track scroll position for "is at bottom" + infinite scroll up ── */
  const onScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const wasAtBottom = isAtBottomRef.current;
    isAtBottomRef.current = distance < 80;
    if (!wasAtBottom && isAtBottomRef.current) {
      setUnreadBelow(0);
    }

    // Infinite scroll up
    if (
      el.scrollTop < 60 &&
      hasMore &&
      !loadingMore &&
      messages.length > 0
    ) {
      void loadMoreOlder();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loadingMore, messages.length]);

  const loadMoreOlder = useCallback(async () => {
    if (loadingMore || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = messages[0];
      const res = await fetch(
        `/api/chat/conversations/${conversationId}/messages?before=${encodeURIComponent(oldest.created_at)}&limit=50`,
      );
      if (!res.ok) return;
      const json = await res.json();
      const older: MessageRow[] = json.messages ?? [];
      if (older.length === 0) {
        setHasMore(false);
        return;
      }
      // Preserve scroll position when prepending
      const el = scrollContainerRef.current;
      const prevScrollHeight = el?.scrollHeight ?? 0;
      setMessages((prev) => [...older, ...prev]);
      setHasMore(!!json.has_more);
      // After render, restore scroll offset
      requestAnimationFrame(() => {
        if (!el) return;
        const newScrollHeight = el.scrollHeight;
        el.scrollTop = newScrollHeight - prevScrollHeight;
      });
    } finally {
      setLoadingMore(false);
    }
  }, [conversationId, loadingMore, messages]);

  /* ── Send (optimistic) with retry support ── */
  const sendBody = useCallback(
    async (text: string, replaceTempId?: string) => {
      if (!conversationId || !role || !myUserId) return;
      const tempId =
        replaceTempId ??
        `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      if (!replaceTempId) {
        const optimistic: MessageRow = {
          id: tempId,
          conversation_id: conversationId,
          sender_user_id: myUserId,
          sender_role: role,
          body: text,
          read_by_brand: role === "brand",
          read_by_creator: role === "creator",
          created_at: new Date().toISOString(),
          pending: true,
        };
        setMessages((prev) => [...prev, optimistic]);
      } else {
        // Retry: clear failed flag, set pending
        setMessages((prev) =>
          prev.map((m) =>
            m.id === replaceTempId
              ? { ...m, pending: true, failed: false }
              : m,
          ),
        );
      }

      try {
        const res = await fetch(
          `/api/chat/conversations/${conversationId}/messages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body: text }),
          },
        );
        if (!res.ok) throw new Error(`send failed ${res.status}`);
        const json = await res.json();
        const real = json.message as MessageRow;
        setMessages((prev) => prev.map((m) => (m.id === tempId ? real : m)));
      } catch (err) {
        console.error("[chat] send failed", err);
        // Mark as failed (keep visible with retry option)
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId
              ? { ...m, pending: false, failed: true, _retryBody: text }
              : m,
          ),
        );
      }
    },
    [conversationId, role, myUserId],
  );

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft("");
    isAtBottomRef.current = true;
    setUnreadBelow(0);
    try {
      await sendBody(text);
    } finally {
      setSending(false);
    }
  }, [draft, sending, sendBody]);

  const retryFailed = useCallback(
    async (msg: MessageRow) => {
      const text = msg._retryBody ?? msg.body;
      if (!text) return;
      await sendBody(text, msg.id);
    },
    [sendBody],
  );

  /* ── Broadcast typing event (debounced, max 1/sec) ── */
  const broadcastTyping = useCallback(() => {
    const ch = presenceChannelRef.current;
    if (!ch || !myUserId) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < 1500) return;
    lastTypingSentRef.current = now;
    void ch.send({
      type: "broadcast",
      event: "typing",
      payload: { user_id: myUserId },
    });
  }, [myUserId]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void send();
      }
    },
    [send],
  );

  const onDraftChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setDraft(e.target.value);
      if (e.target.value.length > 0) broadcastTyping();
    },
    [broadcastTyping],
  );

  const scrollToBottom = useCallback(() => {
    isAtBottomRef.current = true;
    setUnreadBelow(0);
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const initials =
    counterparty?.name
      .split(" ")
      .slice(0, 2)
      .map((s) => s[0])
      .join("")
      .toUpperCase() || "??";

  return (
    <div
      className={`flex h-full min-h-[480px] flex-col overflow-hidden bg-[var(--color-card)] ${className}`}
    >
      {/* Header */}
      {showHeader && counterparty && (
        <header className="flex shrink-0 items-center gap-3 border-b border-[var(--color-border)] px-4 py-3">
          {onBack && (
            <button
              onClick={onBack}
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--color-muted-foreground)] hover:bg-[var(--color-secondary)] md:hidden"
              aria-label="Back"
            >
              <ArrowLeft className="size-4" />
            </button>
          )}
          <div className="relative">
            {counterparty.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={counterparty.avatar_url}
                alt=""
                className="size-10 rounded-full object-cover"
              />
            ) : (
              <div className="flex size-10 items-center justify-center rounded-full bg-[var(--color-primary)]/15 text-xs font-700 text-[var(--color-primary)]">
                {initials}
              </div>
            )}
            {counterpartyOnline && (
              <span
                className="absolute bottom-0 right-0 size-2.5 rounded-full bg-emerald-500 ring-2 ring-[var(--color-card)]"
                title="Online"
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-700 text-[var(--color-foreground)]">
              {counterparty.name}
            </p>
            <p className="text-[11px] text-[var(--color-muted-foreground)]">
              {counterpartyTyping ? (
                <span className="text-[var(--color-primary)]">typing…</span>
              ) : counterpartyOnline ? (
                <span className="text-emerald-600 dark:text-emerald-400">
                  Online
                </span>
              ) : (
                counterparty.subtitle ?? "Offline"
              )}
            </p>
          </div>
        </header>
      )}

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        onScroll={onScroll}
        className="relative flex-1 overflow-y-auto px-4 py-4"
      >
        {loadingMore && (
          <div className="flex justify-center pb-2">
            <Loader2 className="size-3 animate-spin text-[var(--color-muted-foreground)]" />
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-4 animate-spin text-[var(--color-muted-foreground)]" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-[var(--color-secondary)]">
              <MessageSquare className="size-5 text-[var(--color-muted-foreground)]" />
            </div>
            <p className="text-sm font-700 text-[var(--color-foreground)]">
              No messages yet
            </p>
            <p className="mt-1 max-w-[260px] text-[12px] text-[var(--color-muted-foreground)]">
              Say hi — both of you will see messages instantly.
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((m, i) => {
              const prev = i > 0 ? messages[i - 1] : null;
              const showDaySep = shouldShowDaySep(prev, m);
              const isMine = m.sender_user_id === myUserId;
              const counterpartyRead = isMine
                ? role === "brand"
                  ? m.read_by_creator
                  : m.read_by_brand
                : false;

              return (
                <div key={m.id}>
                  {showDaySep && (
                    <div className="my-3 flex items-center justify-center">
                      <span className="rounded-full bg-[var(--color-secondary)] px-2.5 py-0.5 font-mono text-[9px] font-700 uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
                        {daySeparatorLabel(m.created_at)}
                      </span>
                    </div>
                  )}
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                    className={`mb-1.5 flex ${isMine ? "justify-end" : "justify-start"}`}
                  >
                    <div className="flex max-w-[78%] flex-col gap-0.5">
                      <div
                        className={`group relative rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                          isMine
                            ? m.failed
                              ? "border border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400"
                              : "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                            : "bg-[var(--color-secondary)] text-[var(--color-foreground)]"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        <div
                          className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                            isMine && !m.failed ? "opacity-70" : ""
                          }`}
                        >
                          <span className={isMine ? "" : "text-[var(--color-muted-foreground)]"}>
                            {fmtClock(m.created_at)}
                          </span>
                          {isMine &&
                            (m.failed ? (
                              <AlertCircle className="size-3 text-red-500" />
                            ) : m.pending ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : counterpartyRead ? (
                              <CheckCheck className="size-3" />
                            ) : (
                              <Check className="size-3" />
                            ))}
                        </div>
                      </div>
                      {isMine && m.failed && (
                        <button
                          type="button"
                          onClick={() => retryFailed(m)}
                          className="ml-auto flex items-center gap-1 self-end text-[10px] font-700 text-red-500 hover:underline"
                        >
                          <RefreshCw className="size-2.5" />
                          Failed — tap to retry
                        </button>
                      )}
                    </div>
                  </motion.div>
                </div>
              );
            })}
          </AnimatePresence>
        )}
        <div ref={messagesEndRef} />

        {/* Floating "X new" pill when scrolled up + new messages arrived */}
        <AnimatePresence>
          {unreadBelow > 0 && (
            <motion.button
              type="button"
              onClick={scrollToBottom}
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 16, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="sticky bottom-2 left-1/2 mx-auto flex w-fit -translate-x-1/2 items-center gap-1.5 rounded-full bg-[var(--color-primary)] px-3 py-1.5 text-[11px] font-700 text-[var(--color-primary-foreground)] shadow-[0_8px_24px_-6px_rgba(0,0,0,0.35)]"
            >
              <ChevronDown className="size-3" />
              {unreadBelow} new {unreadBelow === 1 ? "message" : "messages"}
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-card)] p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={onDraftChange}
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
    </div>
  );
}
