/**
 * Moderation module — pipeline failure & rejection oversight.
 *
 * Read-only snapshot of the gen pipeline's wreckage:
 *   • KPI tiles for rejected today / failed today / stuck >24h / active.
 *   • Stuck generations table — anything >24h still in compliance_check,
 *     generating, or output_check (likely orphaned).
 *   • Recent rejections (creator-rejected) with reason if present in
 *     structured_brief.
 *   • Recent failures (pipeline blew up — error in compliance_result).
 *
 * Actions (force-discard, refund, retry) ship in a follow-up.
 */

import { ensureCCAuth, PageHeader } from "../_components/page-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/cc/audit";
import { getCurrentSession } from "@/lib/cc/session";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ ccSlug: string }>;
}

interface GenRow {
  id: string;
  status: string;
  brand_id: string;
  creator_id: string;
  retry_count: number | null;
  created_at: string;
  updated_at: string;
  structured_brief: Record<string, unknown> | null;
  compliance_result: Record<string, unknown> | null;
}

const STUCK_STATUSES = ["compliance_check", "generating", "output_check"];
const ACTIVE_STATUSES = [
  "draft",
  "compliance_check",
  "generating",
  "output_check",
  "ready_for_brand_review",
  "ready_for_approval",
];

function relativeFrom(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function statusPill(status: string): string {
  if (status === "rejected" || status === "failed" || status === "discarded") return "cc-pill-bad";
  if (status === "approved") return "cc-pill-ok";
  if (STUCK_STATUSES.includes(status)) return "cc-pill-warn";
  if (status === "ready_for_brand_review" || status === "ready_for_approval") return "cc-pill-info";
  return "cc-pill-neutral";
}

function rejectionReason(brief: Record<string, unknown> | null): string {
  if (!brief) return "—";
  const reason =
    (brief.rejection_reason as string | undefined) ??
    (brief.reject_reason as string | undefined) ??
    (brief.feedback as string | undefined);
  if (!reason) return "—";
  return reason.length > 60 ? `${reason.slice(0, 60)}…` : reason;
}

function failureReason(comp: Record<string, unknown> | null): string {
  if (!comp) return "—";
  const reason =
    (comp.error as string | undefined) ??
    (comp.message as string | undefined) ??
    (comp.reason as string | undefined);
  if (!reason) return "—";
  return reason.length > 60 ? `${reason.slice(0, 60)}…` : reason;
}

export default async function ModerationPage({ params }: Props) {
  const { ccSlug } = await params;
  await ensureCCAuth(ccSlug);

  const session = await getCurrentSession();
  void logAudit({ action: "moderation.view", sessionId: session?.id ?? null });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const startIso = startOfDay.toISOString();
  const yesterdayIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const select =
    "id, status, brand_id, creator_id, retry_count, created_at, updated_at, structured_brief, compliance_result";

  const [
    rejectedToday,
    failedToday,
    stuckCount,
    activeCount,
    stuckRows,
    rejectedRows,
    failedRows,
  ] = await Promise.all([
    admin
      .from("generations")
      .select("id", { count: "exact", head: true })
      .eq("status", "rejected")
      .gte("created_at", startIso),
    admin
      .from("generations")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("created_at", startIso),
    admin
      .from("generations")
      .select("id", { count: "exact", head: true })
      .in("status", STUCK_STATUSES)
      .lt("created_at", yesterdayIso),
    admin
      .from("generations")
      .select("id", { count: "exact", head: true })
      .in("status", ACTIVE_STATUSES),
    admin
      .from("generations")
      .select(select)
      .in("status", STUCK_STATUSES)
      .lt("created_at", yesterdayIso)
      .order("created_at", { ascending: true })
      .limit(50),
    admin
      .from("generations")
      .select(select)
      .eq("status", "rejected")
      .order("updated_at", { ascending: false })
      .limit(50),
    admin
      .from("generations")
      .select(select)
      .eq("status", "failed")
      .order("updated_at", { ascending: false })
      .limit(50),
  ]);

  const stuck = (stuckRows.data ?? []) as GenRow[];
  const rejected = (rejectedRows.data ?? []) as GenRow[];
  const failed = (failedRows.data ?? []) as GenRow[];

  return (
    <>
      <PageHeader
        title="Moderation"
        subtitle="Pipeline rejections · failures · stuck queue"
      />

      <div className="cc-stack">
        <div className="cc-grid cc-grid-4">
          <Kpi label="Rejected today" value={String(rejectedToday.count ?? 0)} tone={(rejectedToday.count ?? 0) > 0 ? "warn" : undefined} />
          <Kpi label="Failed today" value={String(failedToday.count ?? 0)} tone={(failedToday.count ?? 0) > 0 ? "bad" : undefined} />
          <Kpi label="Stuck >24h" value={String(stuckCount.count ?? 0)} tone={(stuckCount.count ?? 0) > 0 ? "bad" : "ok"} />
          <Kpi label="Active gens" value={String(activeCount.count ?? 0)} />
        </div>

        <div>
          <p className="cc-card-title" style={{ marginBottom: 8 }}>
            Stuck generations (&gt;24h in compliance_check / generating / output_check)
          </p>
          <div className="cc-card" style={{ padding: 0, overflow: "auto" }}>
            <table className="cc-table">
              <thead>
                <tr>
                  <th style={{ width: 110 }}>Gen id</th>
                  <th style={{ width: 110 }}>Brand</th>
                  <th style={{ width: 110 }}>Creator</th>
                  <th style={{ width: 130 }}>Status</th>
                  <th style={{ width: 100 }}>Age</th>
                  <th style={{ width: 80 }}>Retries</th>
                </tr>
              </thead>
              <tbody>
                {stuck.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="cc-table-empty">No stuck generations.</td>
                  </tr>
                ) : (
                  stuck.map((g) => (
                    <tr key={g.id}>
                      <td className="cc-mono-cell" style={{ fontSize: 11 }}>{g.id.slice(0, 8)}…</td>
                      <td className="cc-mono-cell" style={{ fontSize: 11, color: "var(--cc-fg-muted)" }}>{g.brand_id.slice(0, 8)}…</td>
                      <td className="cc-mono-cell" style={{ fontSize: 11, color: "var(--cc-fg-muted)" }}>{g.creator_id.slice(0, 8)}…</td>
                      <td><span className={`cc-pill ${statusPill(g.status)}`}>{g.status}</span></td>
                      <td className="cc-mono-cell" style={{ fontSize: 11.5, color: "var(--cc-fg-muted)" }}>{relativeFrom(g.created_at)}</td>
                      <td className="cc-mono-cell" style={{ fontSize: 11.5 }}>{g.retry_count ?? 0}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <p className="cc-card-title" style={{ marginBottom: 8 }}>
            Recent rejections (creator-rejected)
          </p>
          <div className="cc-card" style={{ padding: 0, overflow: "auto" }}>
            <table className="cc-table">
              <thead>
                <tr>
                  <th style={{ width: 110 }}>Gen id</th>
                  <th style={{ width: 110 }}>Brand</th>
                  <th style={{ width: 110 }}>Creator</th>
                  <th>Reason</th>
                  <th style={{ width: 100 }}>Age</th>
                  <th style={{ width: 80 }}>Retries</th>
                </tr>
              </thead>
              <tbody>
                {rejected.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="cc-table-empty">No recent rejections.</td>
                  </tr>
                ) : (
                  rejected.map((g) => (
                    <tr key={g.id}>
                      <td className="cc-mono-cell" style={{ fontSize: 11 }}>{g.id.slice(0, 8)}…</td>
                      <td className="cc-mono-cell" style={{ fontSize: 11, color: "var(--cc-fg-muted)" }}>{g.brand_id.slice(0, 8)}…</td>
                      <td className="cc-mono-cell" style={{ fontSize: 11, color: "var(--cc-fg-muted)" }}>{g.creator_id.slice(0, 8)}…</td>
                      <td style={{ fontSize: 12, color: "var(--cc-fg-muted)" }}>{rejectionReason(g.structured_brief)}</td>
                      <td className="cc-mono-cell" style={{ fontSize: 11.5, color: "var(--cc-fg-muted)" }}>{relativeFrom(g.updated_at)}</td>
                      <td className="cc-mono-cell" style={{ fontSize: 11.5 }}>{g.retry_count ?? 0}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <p className="cc-card-title" style={{ marginBottom: 8 }}>
            Recent failures (pipeline error)
          </p>
          <div className="cc-card" style={{ padding: 0, overflow: "auto" }}>
            <table className="cc-table">
              <thead>
                <tr>
                  <th style={{ width: 110 }}>Gen id</th>
                  <th style={{ width: 110 }}>Brand</th>
                  <th style={{ width: 110 }}>Creator</th>
                  <th>Error</th>
                  <th style={{ width: 100 }}>Age</th>
                  <th style={{ width: 80 }}>Retries</th>
                </tr>
              </thead>
              <tbody>
                {failed.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="cc-table-empty">No recent failures.</td>
                  </tr>
                ) : (
                  failed.map((g) => (
                    <tr key={g.id}>
                      <td className="cc-mono-cell" style={{ fontSize: 11 }}>{g.id.slice(0, 8)}…</td>
                      <td className="cc-mono-cell" style={{ fontSize: 11, color: "var(--cc-fg-muted)" }}>{g.brand_id.slice(0, 8)}…</td>
                      <td className="cc-mono-cell" style={{ fontSize: 11, color: "var(--cc-fg-muted)" }}>{g.creator_id.slice(0, 8)}…</td>
                      <td style={{ fontSize: 12, color: "var(--cc-fg-muted)" }}>{failureReason(g.compliance_result)}</td>
                      <td className="cc-mono-cell" style={{ fontSize: 11.5, color: "var(--cc-fg-muted)" }}>{relativeFrom(g.updated_at)}</td>
                      <td className="cc-mono-cell" style={{ fontSize: 11.5 }}>{g.retry_count ?? 0}</td>
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
