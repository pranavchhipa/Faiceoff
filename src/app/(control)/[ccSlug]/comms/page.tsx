/**
 * Communications module — proxy KPIs + chat activity feed.
 *
 * No `email_log` table exists yet (Resend webhook not wired). We fall back
 * to proxy counts derived from the events that *trigger* transactional
 * email sends:
 *   • approvals created today  ≈ approval-request emails sent
 *   • collab_requests today    ≈ collab-request emails sent
 *
 * Plus chat-activity from conversation_messages so the operator sees
 * real-time engagement at a glance. Failed-deliveries column is "—" until
 * we wire Resend webhooks.
 */

import { ensureCCAuth, PageHeader } from "../_components/page-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/cc/audit";
import { getCurrentSession } from "@/lib/cc/session";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ ccSlug: string }>;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  sender_role: string;
  body: string;
  created_at: string;
}

interface AuditEntry {
  id: string;
  action: string;
  target_id: string | null;
  payload: unknown;
  created_at: string;
}

function relativeFrom(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function senderPill(role: string): string {
  if (role === "brand") return "cc-pill-info";
  if (role === "creator") return "cc-pill-neutral";
  return "cc-pill-warn";
}

function truncate(text: string, n: number): string {
  return text.length > n ? `${text.slice(0, n)}…` : text;
}

async function tryQuery<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    console.error("[cc/comms] query failed", err);
    return null;
  }
}

export default async function CommsPage({ params }: Props) {
  const { ccSlug } = await params;
  await ensureCCAuth(ccSlug);

  const session = await getCurrentSession();
  void logAudit({ action: "comms.view", sessionId: session?.id ?? null });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const startIso = startOfDay.toISOString();

  // email_log doesn't exist — wrap in try/catch so the page doesn't crash if we add it later.
  const emailLog = await tryQuery(async () => {
    const res = await admin
      .from("email_log")
      .select("id, to_email, template, status, created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    return res.data ?? null;
  });
  const hasEmailLog = emailLog != null;

  const [
    approvalsToday,
    collabRequestsToday,
    chatMessagesToday,
    chatRecentRes,
    auditCommsRes,
  ] = await Promise.all([
    admin
      .from("approvals")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startIso),
    admin
      .from("collab_requests")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startIso),
    admin
      .from("conversation_messages")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startIso),
    admin
      .from("conversation_messages")
      .select("id, conversation_id, sender_role, body, created_at")
      .order("created_at", { ascending: false })
      .limit(30),
    tryQuery(async () => {
      const res = await admin
        .from("owner_audit_log")
        .select("id, action, target_id, payload, created_at")
        .ilike("action", "%email%")
        .order("created_at", { ascending: false })
        .limit(10);
      return res.data ?? null;
    }),
  ]);

  const recentMessages = (chatRecentRes.data ?? []) as MessageRow[];
  const recentAuditEmails = (auditCommsRes ?? []) as AuditEntry[];

  return (
    <>
      <PageHeader
        title="Communications"
        subtitle="Email send proxies · chat activity · transactional log"
      />

      <div className="cc-stack">
        <div className="cc-grid cc-grid-4">
          <Kpi
            label="Approval emails today"
            value={String(approvalsToday.count ?? 0)}
            sub="proxy · approvals.created_at"
          />
          <Kpi
            label="Collab-request emails today"
            value={String(collabRequestsToday.count ?? 0)}
            sub="proxy · collab_requests.created_at"
          />
          <Kpi
            label="Chat messages today"
            value={String(chatMessagesToday.count ?? 0)}
            sub="conversation_messages"
          />
          <Kpi
            label="Failed deliveries"
            value="—"
            sub={hasEmailLog ? "live" : "log not wired"}
            tone={hasEmailLog ? undefined : "warn"}
          />
        </div>

        <div>
          <p className="cc-card-title" style={{ marginBottom: 8 }}>Email send log</p>
          {hasEmailLog ? (
            <div className="cc-card" style={{ padding: 0, overflow: "auto" }}>
              <table className="cc-table">
                <thead>
                  <tr>
                    <th>To</th>
                    <th>Template</th>
                    <th style={{ width: 100 }}>Status</th>
                    <th style={{ width: 110 }}>Sent</th>
                  </tr>
                </thead>
                <tbody>
                  {((emailLog ?? []) as Array<{ id: string; to_email: string; template: string; status: string; created_at: string }>).length === 0 ? (
                    <tr>
                      <td colSpan={4} className="cc-table-empty">No email events logged.</td>
                    </tr>
                  ) : (
                    ((emailLog ?? []) as Array<{ id: string; to_email: string; template: string; status: string; created_at: string }>).map((e) => (
                      <tr key={e.id}>
                        <td className="cc-mono-cell" style={{ fontSize: 12 }}>{e.to_email}</td>
                        <td className="cc-mono-cell" style={{ fontSize: 12 }}>{e.template}</td>
                        <td>
                          <span className={`cc-pill ${e.status === "delivered" ? "cc-pill-ok" : e.status === "bounced" || e.status === "failed" ? "cc-pill-bad" : "cc-pill-info"}`}>
                            {e.status}
                          </span>
                        </td>
                        <td className="cc-mono-cell" style={{ fontSize: 11.5, color: "var(--cc-fg-muted)" }}>{relativeFrom(e.created_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : recentAuditEmails.length > 0 ? (
            <div className="cc-card" style={{ padding: 0, overflow: "auto" }}>
              <table className="cc-table">
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Target</th>
                    <th style={{ width: 110 }}>When</th>
                  </tr>
                </thead>
                <tbody>
                  {recentAuditEmails.map((a) => (
                    <tr key={a.id}>
                      <td className="cc-mono-cell" style={{ fontSize: 12 }}>{a.action}</td>
                      <td className="cc-mono-cell" style={{ fontSize: 11, color: "var(--cc-fg-muted)" }}>
                        {a.target_id ? `${a.target_id.slice(0, 8)}…` : "—"}
                      </td>
                      <td className="cc-mono-cell" style={{ fontSize: 11.5, color: "var(--cc-fg-muted)" }}>{relativeFrom(a.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="cc-coming-soon">
              <h3>Resend send-log integration</h3>
              <p style={{ margin: "4px 0 0 0", fontSize: 12.5 }}>
                Live email events fire fire-and-forget from <span className="cc-monospace">/lib/email/transactional.ts</span>.
                Resend webhook receiver + <span className="cc-monospace">email_log</span> table ship next iteration.
              </p>
              <p style={{ marginTop: 14, fontSize: 11, fontFamily: "var(--cc-mono)", letterSpacing: "0.08em" }}>
                FALLING BACK TO APPROVAL / COLLAB-REQUEST PROXIES ABOVE
              </p>
            </div>
          )}
        </div>

        <div>
          <p className="cc-card-title" style={{ marginBottom: 8 }}>Recent chat activity</p>
          <div className="cc-card" style={{ padding: 0, overflow: "auto" }}>
            <table className="cc-table">
              <thead>
                <tr>
                  <th style={{ width: 90 }}>Sender</th>
                  <th>Message</th>
                  <th style={{ width: 130 }}>Conversation</th>
                  <th style={{ width: 110 }}>When</th>
                </tr>
              </thead>
              <tbody>
                {recentMessages.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="cc-table-empty">No chat messages yet.</td>
                  </tr>
                ) : (
                  recentMessages.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <span className={`cc-pill ${senderPill(m.sender_role)}`}>{m.sender_role}</span>
                      </td>
                      <td style={{ fontSize: 12.5, color: "var(--cc-fg)" }}>{truncate(m.body, 80)}</td>
                      <td className="cc-mono-cell" style={{ fontSize: 11, color: "var(--cc-fg-muted)" }}>
                        {m.conversation_id.slice(0, 8)}…
                      </td>
                      <td className="cc-mono-cell" style={{ fontSize: 11.5, color: "var(--cc-fg-muted)" }}>
                        {relativeFrom(m.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "ok" | "warn" | "bad";
}) {
  const color =
    tone === "ok"
      ? "var(--cc-ok)"
      : tone === "warn"
        ? "var(--cc-warn)"
        : tone === "bad"
          ? "var(--cc-bad)"
          : "var(--cc-fg)";
  return (
    <div className="cc-kpi">
      <span className="cc-kpi-label">{label}</span>
      <span className="cc-kpi-value" style={{ color }}>{value}</span>
      {sub && <span className="cc-kpi-sub">{sub}</span>}
    </div>
  );
}
