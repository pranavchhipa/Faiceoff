/**
 * Support ticket detail — Control Centre.
 *
 * Shows the full thread + raiser context, and gives the operator action forms:
 *   - Reply (server action)
 *   - Triage status / priority
 *   - Resolve with a closing note
 *   - Grant credits (brands only) as goodwill remediation
 *
 * Viewing clears the operator-unread flag.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureCCAuth, PageHeader } from "../../_components/page-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  replyToTicket,
  updateTicketMeta,
  resolveTicket,
  grantCreditsForTicket,
} from "../actions";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ ccSlug: string; id: string }>;
}

interface Ticket {
  id: string;
  user_id: string;
  role: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  resolution_note: string | null;
  resolved_at: string | null;
  related_collab_session_id: string | null;
  related_generation_id: string | null;
  created_at: string;
}

interface Message {
  id: string;
  sender_kind: string;
  body: string | null;
  action_tag: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  created_at: string;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function TicketDetailPage({ params }: Props) {
  const { ccSlug, id } = await params;
  await ensureCCAuth(ccSlug);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: ticket } = await admin
    .from("support_tickets")
    .select(
      "id, user_id, role, subject, category, status, priority, resolution_note, resolved_at, related_collab_session_id, related_generation_id, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (!ticket) notFound();
  const t = ticket as Ticket;

  // Clear operator-unread on view
  void admin.from("support_tickets").update({ has_unread_for_operator: false }).eq("id", id);

  const [{ data: messages }, { data: raiser }] = await Promise.all([
    admin
      .from("ticket_messages")
      .select("id, sender_kind, body, action_tag, attachment_url, attachment_name, created_at")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true }),
    admin.from("users").select("display_name, email").eq("id", t.user_id).maybeSingle(),
  ]);

  // For brand tickets, fetch current credit balance for context
  let brandCredits: number | null = null;
  if (t.role === "brand") {
    const { data: brand } = await admin
      .from("brands")
      .select("credits_remaining")
      .eq("user_id", t.user_id)
      .maybeSingle();
    brandCredits = brand?.credits_remaining ?? null;
  }

  const msgs = (messages ?? []) as Message[];

  return (
    <>
      <PageHeader
        title={t.subject}
        subtitle={`${t.role} · ${t.category.replace(/_/g, " ")} · opened ${fmt(t.created_at)}`}
        actions={
          <Link href={`/${ccSlug}/tickets`} className="cc-btn">
            ← Back to queue
          </Link>
        }
      />

      <div className="cc-stack" style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16, alignItems: "start" }}>
        {/* ── Thread ── */}
        <div className="cc-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 11, color: "var(--cc-fg-dim)", fontFamily: "var(--cc-mono)", letterSpacing: "0.06em" }}>
            RAISED BY {raiser?.display_name ?? raiser?.email ?? t.user_id.slice(0, 8)}
          </div>

          {msgs.map((m) => {
            const isOperator = m.sender_kind === "operator";
            return (
              <div
                key={m.id}
                style={{
                  alignSelf: isOperator ? "flex-end" : "flex-start",
                  maxWidth: "85%",
                  background: isOperator ? "var(--cc-accent-dim, var(--cc-bg-3))" : "var(--cc-bg-2)",
                  border: "1px solid var(--cc-border)",
                  borderRadius: 8,
                  padding: "10px 12px",
                }}
              >
                <div style={{ fontSize: 10, color: "var(--cc-fg-dim)", marginBottom: 4, fontFamily: "var(--cc-mono)", letterSpacing: "0.06em" }}>
                  {isOperator ? "OPERATOR" : "USER"} · {fmt(m.created_at)}
                  {m.action_tag && (
                    <span className="cc-pill cc-pill-ok" style={{ marginLeft: 8 }}>
                      {m.action_tag.replace(/_/g, " ")}
                    </span>
                  )}
                </div>
                {m.attachment_url && (
                  <a href={m.attachment_url} target="_blank" rel="noreferrer" style={{ display: "block", marginBottom: m.body ? 8 : 0 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
                    <img
                      src={m.attachment_url}
                      alt={m.attachment_name ?? "Screenshot"}
                      style={{ maxHeight: 240, maxWidth: "100%", borderRadius: 6, border: "1px solid var(--cc-border)", display: "block" }}
                    />
                  </a>
                )}
                {m.body && (
                  <div style={{ fontSize: 13, color: "var(--cc-fg)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                    {m.body}
                  </div>
                )}
              </div>
            );
          })}

          {/* Reply form */}
          {t.status !== "closed" && (
            <form action={replyToTicket} style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
              <input type="hidden" name="ticket_id" value={t.id} />
              <input type="hidden" name="cc_slug" value={ccSlug} />
              <textarea
                name="body"
                required
                rows={3}
                placeholder="Reply to the user…"
                className="cc-input"
                style={{ resize: "vertical", fontFamily: "inherit" }}
              />
              <button type="submit" className="cc-btn cc-btn-primary" style={{ alignSelf: "flex-end" }}>
                Send reply
              </button>
            </form>
          )}
        </div>

        {/* ── Side panel: triage + actions ── */}
        <div className="cc-stack" style={{ gap: 12 }}>
          {/* Status */}
          <div className="cc-card">
            <div style={{ fontSize: 11, fontFamily: "var(--cc-mono)", letterSpacing: "0.06em", color: "var(--cc-fg-dim)", marginBottom: 8 }}>
              TRIAGE
            </div>
            <form action={updateTicketMeta} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input type="hidden" name="ticket_id" value={t.id} />
              <input type="hidden" name="cc_slug" value={ccSlug} />
              <label style={{ fontSize: 11, color: "var(--cc-fg-muted)" }}>Status</label>
              <select name="status" defaultValue={t.status} className="cc-input">
                <option value="open">open</option>
                <option value="in_progress">in progress</option>
                <option value="waiting_on_user">waiting on user</option>
                <option value="resolved">resolved</option>
                <option value="closed">closed</option>
              </select>
              <label style={{ fontSize: 11, color: "var(--cc-fg-muted)" }}>Priority</label>
              <select name="priority" defaultValue={t.priority} className="cc-input">
                <option value="low">low</option>
                <option value="normal">normal</option>
                <option value="high">high</option>
                <option value="urgent">urgent</option>
              </select>
              <button type="submit" className="cc-btn" style={{ marginTop: 4 }}>
                Update
              </button>
            </form>
          </div>

          {/* Grant credits — brand tickets only */}
          {t.role === "brand" && (
            <div className="cc-card">
              <div style={{ fontSize: 11, fontFamily: "var(--cc-mono)", letterSpacing: "0.06em", color: "var(--cc-fg-dim)", marginBottom: 8 }}>
                REMEDIATION
              </div>
              <p style={{ fontSize: 12, color: "var(--cc-fg-muted)", marginBottom: 8 }}>
                Current balance: <strong style={{ color: "var(--cc-fg)" }}>{brandCredits ?? "—"} credits</strong>
              </p>
              <form action={grantCreditsForTicket} style={{ display: "flex", gap: 8 }}>
                <input type="hidden" name="ticket_id" value={t.id} />
                <input type="hidden" name="cc_slug" value={ccSlug} />
                <input
                  type="number"
                  name="credits"
                  min={1}
                  max={1000}
                  placeholder="e.g. 5"
                  required
                  className="cc-input"
                  style={{ width: 90 }}
                />
                <button type="submit" className="cc-btn cc-btn-primary">
                  Grant credits
                </button>
              </form>
            </div>
          )}

          {/* Resolve */}
          {t.status !== "resolved" && t.status !== "closed" && (
            <div className="cc-card">
              <div style={{ fontSize: 11, fontFamily: "var(--cc-mono)", letterSpacing: "0.06em", color: "var(--cc-fg-dim)", marginBottom: 8 }}>
                RESOLVE
              </div>
              <form action={resolveTicket} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input type="hidden" name="ticket_id" value={t.id} />
                <input type="hidden" name="cc_slug" value={ccSlug} />
                <textarea
                  name="resolution_note"
                  rows={3}
                  placeholder="Closing note to the user (optional)…"
                  className="cc-input"
                  style={{ resize: "vertical", fontFamily: "inherit" }}
                />
                <button type="submit" className="cc-btn cc-btn-primary">
                  Mark resolved
                </button>
              </form>
            </div>
          )}

          {t.resolution_note && (
            <div className="cc-card">
              <div style={{ fontSize: 11, fontFamily: "var(--cc-mono)", letterSpacing: "0.06em", color: "var(--cc-fg-dim)", marginBottom: 6 }}>
                RESOLUTION
              </div>
              <p style={{ fontSize: 12.5, color: "var(--cc-fg)", whiteSpace: "pre-wrap" }}>{t.resolution_note}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
