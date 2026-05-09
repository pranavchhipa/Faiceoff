/**
 * Audit log viewer — every Control Centre action.
 *
 * Read-only. Filter by action/date. Latest 200 by default.
 */

import { ensureCCAuth, PageHeader } from "../_components/page-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/cc/audit";
import { getCurrentSession } from "@/lib/cc/session";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ ccSlug: string }>;
  searchParams: Promise<{ action?: string }>;
}

export default async function AuditPage({ params, searchParams }: Props) {
  const { ccSlug } = await params;
  await ensureCCAuth(ccSlug);

  const sp = await searchParams;
  const session = await getCurrentSession();
  void logAudit({ action: "audit.view", sessionId: session?.id ?? null });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  let q = admin
    .from("owner_audit_log")
    .select("id, session_id, action, target_type, target_id, payload, ip, user_agent, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (sp.action) {
    q = q.eq("action", sp.action);
  }
  const { data: rows } = await q;
  const list = (rows ?? []) as Array<{
    id: string;
    session_id: string | null;
    action: string;
    target_type: string | null;
    target_id: string | null;
    payload: unknown;
    ip: string | null;
    user_agent: string | null;
    created_at: string;
  }>;

  // Distinct actions for filter chip row.
  const distinct = Array.from(new Set(list.map((r) => r.action))).sort();

  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle={`Last ${list.length} actions · append-only`}
      />

      <div className="cc-toolbar">
        <a
          href={`/${ccSlug}/audit`}
          className={`cc-pill ${!sp.action ? "cc-pill-info" : "cc-pill-neutral"}`}
        >
          all
        </a>
        {distinct.map((a) => (
          <a
            key={a}
            href={`/${ccSlug}/audit?action=${encodeURIComponent(a)}`}
            className={`cc-pill ${sp.action === a ? "cc-pill-info" : "cc-pill-neutral"}`}
          >
            {a}
          </a>
        ))}
      </div>

      <div className="cc-card" style={{ padding: 0, overflow: "auto" }}>
        <table className="cc-table">
          <thead>
            <tr>
              <th style={{ width: 160 }}>Time (UTC)</th>
              <th style={{ width: 180 }}>Action</th>
              <th style={{ width: 100 }}>Target type</th>
              <th>Target id</th>
              <th style={{ width: 130 }}>IP</th>
              <th style={{ width: 100 }}>Session</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={6} className="cc-table-empty">
                  No audit entries yet.
                </td>
              </tr>
            ) : (
              list.map((r) => (
                <tr key={r.id}>
                  <td className="cc-mono-cell" style={{ color: "var(--cc-fg-muted)", fontSize: 11.5 }}>
                    {new Date(r.created_at).toISOString().replace("T", " ").slice(0, 19)}
                  </td>
                  <td className="cc-mono-cell">{r.action}</td>
                  <td className="cc-mono-cell" style={{ color: "var(--cc-fg-muted)" }}>
                    {r.target_type ?? "—"}
                  </td>
                  <td className="cc-mono-cell" style={{ color: "var(--cc-fg-muted)", fontSize: 11.5 }}>
                    {r.target_id ?? "—"}
                  </td>
                  <td className="cc-mono-cell" style={{ color: "var(--cc-fg-muted)", fontSize: 11.5 }}>
                    {r.ip ?? "—"}
                  </td>
                  <td className="cc-mono-cell" style={{ color: "var(--cc-fg-muted)", fontSize: 11.5 }}>
                    {r.session_id ? `${r.session_id.slice(0, 8)}…` : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
