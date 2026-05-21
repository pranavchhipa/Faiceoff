"use client";

/**
 * Support — shared creator + brand page (mounted at /creator/support and
 * /brand/support via re-export wrappers).
 *
 * Left: list of the user's tickets. Right: either the "new ticket" form or
 * the selected ticket's thread with a reply box.
 */

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  LifeBuoy,
  Plus,
  Send,
  Loader2,
  CheckCircle2,
  Clock,
  ArrowLeft,
} from "lucide-react";

interface Ticket {
  id: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  has_unread_for_user: boolean;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
}

interface Message {
  id: string;
  sender_kind: "user" | "operator";
  body: string;
  action_tag: string | null;
  created_at: string;
}

const CATEGORIES = [
  { value: "generation_quality", label: "Generation quality" },
  { value: "payment", label: "Payment / billing" },
  { value: "payout", label: "Payout / earnings" },
  { value: "collab", label: "Collab / approval" },
  { value: "account", label: "Account" },
  { value: "bug", label: "Bug report" },
  { value: "feature_request", label: "Feature request" },
  { value: "other", label: "Other" },
];

function statusStyle(status: string): { bg: string; text: string; label: string } {
  switch (status) {
    case "open":
      return { bg: "bg-amber-500/12", text: "text-amber-600", label: "Open" };
    case "in_progress":
      return { bg: "bg-blue-500/12", text: "text-blue-600", label: "In progress" };
    case "waiting_on_user":
      return { bg: "bg-violet-500/12", text: "text-violet-600", label: "Awaiting you" };
    case "resolved":
      return { bg: "bg-emerald-500/12", text: "text-emerald-600", label: "Resolved" };
    default:
      return { bg: "bg-[var(--color-secondary)]", text: "text-[var(--color-muted-foreground)]", label: "Closed" };
  }
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "new" | "detail">("list");
  const [activeId, setActiveId] = useState<string | null>(null);

  const loadTickets = useCallback(async () => {
    try {
      const res = await fetch("/api/support/tickets", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  function openDetail(id: string) {
    setActiveId(id);
    setView("detail");
  }

  return (
    <div className="mx-auto max-w-5xl px-4 pb-20 pt-6 lg:px-8 lg:pt-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-primary)]/12 text-[var(--color-primary)]">
              <LifeBuoy className="h-4 w-4" />
            </span>
            <h1 className="font-display text-[26px] font-800 tracking-tight text-[var(--color-foreground)]">
              Support
            </h1>
          </div>
          <p className="mt-1 text-[13px] text-[var(--color-muted-foreground)]">
            Raise a concern — our team reviews every ticket and resolves it directly.
          </p>
        </div>
        {view === "list" && (
          <button
            type="button"
            onClick={() => setView("new")}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-[13px] font-700 text-[var(--color-primary-foreground)] hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            New ticket
          </button>
        )}
      </div>

      {view === "new" && (
        <NewTicketForm
          onCancel={() => setView("list")}
          onCreated={async (id) => {
            await loadTickets();
            openDetail(id);
          }}
        />
      )}

      {view === "detail" && activeId && (
        <TicketDetail
          ticketId={activeId}
          onBack={() => {
            setView("list");
            setActiveId(null);
            loadTickets();
          }}
        />
      )}

      {view === "list" && (
        <>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-[var(--color-secondary)]" />
              ))}
            </div>
          ) : tickets.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] p-12 text-center">
              <LifeBuoy className="mx-auto mb-3 h-10 w-10 text-[var(--color-muted-foreground)]" />
              <p className="font-display text-[16px] font-700 text-[var(--color-foreground)]">
                No tickets yet
              </p>
              <p className="mx-auto mt-1 max-w-sm text-[13px] text-[var(--color-muted-foreground)]">
                Something not right? Open a ticket and we&apos;ll sort it out — bad
                generation, payment issue, anything.
              </p>
              <button
                type="button"
                onClick={() => setView("new")}
                className="mx-auto mt-4 flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-[13px] font-700 text-[var(--color-primary-foreground)] hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
                Raise your first ticket
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {tickets.map((t) => {
                const s = statusStyle(t.status);
                return (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => openDetail(t.id)}
                    className="flex w-full items-center gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 text-left transition hover:border-[var(--color-primary)]/30 hover:bg-[var(--color-secondary)]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {t.has_unread_for_user && (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--color-primary)]" />
                        )}
                        <p className="truncate font-display text-[15px] font-700 text-[var(--color-foreground)]">
                          {t.subject}
                        </p>
                      </div>
                      <p className="mt-0.5 text-[12px] text-[var(--color-muted-foreground)]">
                        {t.category.replace(/_/g, " ")} · {timeAgo(t.updated_at)}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 font-mono text-[10px] font-700 uppercase tracking-wider ${s.bg} ${s.text}`}>
                      {s.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ───────── New ticket form ───────── */

function NewTicketForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (id: string) => void;
}) {
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("generation_quality");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, category, message }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create ticket");
        return;
      }
      onCreated(data.ticket_id);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <motion.form
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onSubmit={submit}
      className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5"
    >
      <button
        type="button"
        onClick={onCancel}
        className="flex items-center gap-1.5 text-[12px] font-600 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back
      </button>

      <div>
        <label className="mb-1.5 block text-[12px] font-700 text-[var(--color-foreground)]">Subject</label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
          maxLength={140}
          placeholder="Brief summary of the issue"
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm text-[var(--color-foreground)] outline-none focus:border-[var(--color-primary)]"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-[12px] font-700 text-[var(--color-foreground)]">Category</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm text-[var(--color-foreground)] outline-none focus:border-[var(--color-primary)]"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1.5 block text-[12px] font-700 text-[var(--color-foreground)]">Describe the issue</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          rows={5}
          maxLength={4000}
          placeholder="What happened? Include any details that help us resolve it fast."
          className="w-full resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm text-[var(--color-foreground)] outline-none focus:border-[var(--color-primary)]"
        />
      </div>

      {error && (
        <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-500">{error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-5 py-2.5 text-[13px] font-700 text-[var(--color-primary-foreground)] hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Submit ticket
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-[13px] font-600 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        >
          Cancel
        </button>
      </div>
    </motion.form>
  );
}

/* ───────── Ticket detail thread ───────── */

function TicketDetail({ ticketId, onBack }: { ticketId: string; onBack: () => void }) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setTicket(data.ticket);
        setMessages(data.messages ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    load();
  }, [load]);

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: reply }),
      });
      if (res.ok) {
        setReply("");
        await load();
      }
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return <div className="h-64 animate-pulse rounded-2xl bg-[var(--color-secondary)]" />;
  }
  if (!ticket) {
    return (
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-8 text-center text-[13px] text-[var(--color-muted-foreground)]">
        Ticket not found.
        <button type="button" onClick={onBack} className="ml-2 text-[var(--color-primary)] underline">Back</button>
      </div>
    );
  }

  const s = statusStyle(ticket.status);
  const isResolved = ticket.status === "resolved" || ticket.status === "closed";

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] p-4">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-[12px] font-600 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All tickets
        </button>
        <span className={`rounded-full px-2.5 py-1 font-mono text-[10px] font-700 uppercase tracking-wider ${s.bg} ${s.text}`}>
          {s.label}
        </span>
      </div>

      <div className="p-4">
        <h2 className="font-display text-[18px] font-800 tracking-tight text-[var(--color-foreground)]">
          {ticket.subject}
        </h2>
        <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
          {ticket.category.replace(/_/g, " ")}
        </p>

        {/* Thread */}
        <div className="mt-5 space-y-3">
          {messages.map((m) => {
            const isUser = m.sender_kind === "user";
            return (
              <div key={m.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                    isUser
                      ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                      : "border border-[var(--color-border)] bg-[var(--color-secondary)] text-[var(--color-foreground)]"
                  }`}
                >
                  <div className={`mb-0.5 flex items-center gap-2 font-mono text-[9px] uppercase tracking-wider ${isUser ? "text-[var(--color-primary-foreground)]/70" : "text-[var(--color-muted-foreground)]"}`}>
                    {isUser ? "You" : "Support"}
                    {m.action_tag && (
                      <span className="rounded-full bg-emerald-500/20 px-1.5 py-px text-emerald-600">
                        {m.action_tag.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{m.body}</p>
                  <p className={`mt-1 text-[10px] ${isUser ? "text-[var(--color-primary-foreground)]/60" : "text-[var(--color-muted-foreground)]"}`}>
                    {timeAgo(m.created_at)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Reply / status footer */}
        {isResolved ? (
          <div className="mt-5 flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/8 px-4 py-3 text-[13px] text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />
            This ticket is {ticket.status}. Reply below to re-open if you still need help.
          </div>
        ) : (
          <div className="mt-5 flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]/50 px-4 py-2.5 text-[12px] text-[var(--color-muted-foreground)]">
            <Clock className="h-3.5 w-3.5" />
            Our team typically replies within a day.
          </div>
        )}

        {ticket.status !== "closed" && (
          <form onSubmit={sendReply} className="mt-3 flex items-end gap-2">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={2}
              placeholder="Type a reply…"
              className="flex-1 resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm text-[var(--color-foreground)] outline-none focus:border-[var(--color-primary)]"
            />
            <button
              type="submit"
              disabled={sending || !reply.trim()}
              className="flex h-[42px] items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 text-[13px] font-700 text-[var(--color-primary-foreground)] hover:opacity-90 disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
