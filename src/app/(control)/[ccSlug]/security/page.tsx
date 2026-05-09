/**
 * Security Centre — sessions + login attempts + key health.
 *
 * Shows: active CC sessions, latest login attempts (success+fail) from
 * the audit log, plus a "revoke all sessions" big red button.
 */

import { ensureCCAuth, PageHeader } from "../_components/page-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/cc/audit";
import { getCurrentSession } from "@/lib/cc/session";

export const dynamic = "force-dynamic";

interface Props { params: Promise<{ ccSlug: string }> }

interface SessionRow {
  id: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  ip: string | null;
  user_agent: string | null;
  revoked_at: string | null;
}

interface AuditRow {
  id: string;
  action: string;
  ip: string | null;
  payload: { useBackup?: boolean } | null;
  created_at: string;
}

export default async function SecurityPage({ params }: Props) {
  const { ccSlug } = await params;
  await ensureCCAuth(ccSlug);

  const session = await getCurrentSession();
  void logAudit({ action: "security.view", sessionId: session?.id ?? null });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const [sessionsRes, auditRes] = await Promise.all([
    admin
      .from("owner_sessions")
      .select("id, created_at, last_seen_at, expires_at, ip, user_agent, revoked_at")
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("owner_audit_log")
      .select("id, action, ip, payload, created_at")
      .in("action", ["auth.login", "auth.login_failed", "auth.logout"])
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  const sessions = (sessionsRes.data ?? []) as SessionRow[];
  const audits = (auditRes.data ?? []) as AuditRow[];
  const activeNow = sessions.filter(
    (s) =>
      !s.revoked_at &&
      new Date(s.expires_at).getTime() > Date.now(),
  );

  return (
    <>
      <PageHeader
        title="Security"
        subtitle={`${activeNow.length} active session${activeNow.length === 1 ? "" : "s"} · last 50 sessions + login attempts`}
      />

      <div className="cc-stack">
        <div>
          <p className="cc-card-title">Active sessions</p>
          <div className="cc-card" style={{ padding: 0, overflow: "auto" }}>
            <table className="cc-table">
              <thead>
                <tr>
                  <th style={{ width: 100 }}>Session</th>
                  <th style={{ width: 130 }}>IP</th>
                  <th>User-agent</th>
                  <th style={{ width: 130 }}>Created</th>
                  <th style={{ width: 130 }}>Last seen</th>
                  <th style={{ width: 90 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {sessions.length === 0 ? (
                  <tr><td colSpan={6} className="cc-table-empty">No sessions yet.</td></tr>
                ) : (
                  sessions.map((s) => {
                    const expired = new Date(s.expires_at).getTime() <= Date.now();
                    const status = s.revoked_at ? "revoked" : expired ? "expired" : "active";
                    return (
                      <tr key={s.id}>
                        <td className="cc-mono-cell" style={{ fontSize: 11 }}>{s.id.slice(0, 12)}…</td>
                        <td className="cc-mono-cell" style={{ color: "var(--cc-fg-muted)", fontSize: 11.5 }}>{s.ip ?? "—"}</td>
                        <td style={{ fontSize: 11.5, color: "var(--cc-fg-muted)" }}>{s.user_agent ?? "—"}</td>
                        <td className="cc-mono-cell" style={{ color: "var(--cc-fg-muted)", fontSize: 11 }}>
                          {new Date(s.created_at).toISOString().slice(0, 16).replace("T", " ")}
                        </td>
                        <td className="cc-mono-cell" style={{ color: "var(--cc-fg-muted)", fontSize: 11 }}>
                          {new Date(s.last_seen_at).toISOString().slice(0, 16).replace("T", " ")}
                        </td>
                        <td>
                          <span className={`cc-pill ${status === "active" ? "cc-pill-ok" : status === "revoked" ? "cc-pill-bad" : "cc-pill-neutral"}`}>
                            {status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <p className="cc-card-title">Login attempts</p>
          <div className="cc-card" style={{ padding: 0, overflow: "auto" }}>
            <table className="cc-table">
              <thead>
                <tr>
                  <th style={{ width: 160 }}>Time (UTC)</th>
                  <th style={{ width: 160 }}>Action</th>
                  <th style={{ width: 130 }}>IP</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {audits.length === 0 ? (
                  <tr><td colSpan={4} className="cc-table-empty">No login activity yet.</td></tr>
                ) : (
                  audits.map((a) => (
                    <tr key={a.id}>
                      <td className="cc-mono-cell" style={{ color: "var(--cc-fg-muted)", fontSize: 11.5 }}>
                        {new Date(a.created_at).toISOString().slice(0, 19).replace("T", " ")}
                      </td>
                      <td>
                        <span
                          className={`cc-pill ${
                            a.action === "auth.login"
                              ? "cc-pill-ok"
                              : a.action === "auth.login_failed"
                                ? "cc-pill-bad"
                                : "cc-pill-neutral"
                          }`}
                        >
                          {a.action}
                        </span>
                      </td>
                      <td className="cc-mono-cell" style={{ color: "var(--cc-fg-muted)", fontSize: 11.5 }}>{a.ip ?? "—"}</td>
                      <td className="cc-mono-cell" style={{ color: "var(--cc-fg-muted)", fontSize: 11 }}>
                        {a.payload?.useBackup ? "via backup code" : ""}
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
