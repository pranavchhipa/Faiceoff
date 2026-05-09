/**
 * Compliance — DPDP / GST / TDS / TCS dashboard.
 *
 * Reads:
 *   • creators.dpdp_consent_at — count of recorded DPDP consents
 *   • licenses.status='active' — active licences
 *   • gst_output_ledger / tds_ledger / tcs_ledger — MTD running totals (paise)
 *   • data_export_requests / data_deletion_requests — queue depths
 *     (fall back to "—" if tables don't exist)
 *   • owner_audit_log — last 50 compliance-relevant entries
 *
 * Read-only. Drill-downs (export queue, deletion queue) ship next iteration —
 * this page is the dashboard.
 */

import { ensureCCAuth, PageHeader } from "../_components/page-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/cc/audit";
import { getCurrentSession } from "@/lib/cc/session";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ ccSlug: string }>;
}

interface AuditRow {
  id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  ip: string | null;
  created_at: string;
}

function fmt(paise: number | null | undefined): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format((paise ?? 0) / 100);
}

function startOfMonthIso(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error("[cc/compliance] query failed, using fallback", err);
    return fallback;
  }
}

export default async function CompliancePage({ params }: Props) {
  const { ccSlug } = await params;
  await ensureCCAuth(ccSlug);

  const session = await getCurrentSession();
  void logAudit({ action: "compliance.view", sessionId: session?.id ?? null });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const monthIso = startOfMonthIso();

  const [
    dpdpCount,
    activeLicences,
    gstMtd,
    tdsMtd,
    tcsMtd,
    exportQueue,
    deletionQueue,
    complianceAudits,
  ] = await Promise.all([
    safe(async () => {
      // creators.dpdp_consent_at — set when creator accepts the consent flow.
      const { count } = await admin
        .from("creators")
        .select("id", { count: "exact", head: true })
        .not("dpdp_consent_at", "is", null);
      return (count as number | null) ?? 0;
    }, 0),
    safe(async () => {
      const { count } = await admin
        .from("licenses")
        .select("id", { count: "exact", head: true })
        .eq("status", "active");
      return (count as number | null) ?? 0;
    }, 0),
    safe(async () => {
      const { data } = await admin
        .from("gst_output_ledger")
        .select("tax_paise")
        .gte("created_at", monthIso);
      return ((data ?? []) as Array<{ tax_paise: number | null }>).reduce(
        (s, r) => s + (r.tax_paise ?? 0),
        0,
      );
    }, 0),
    safe(async () => {
      const { data } = await admin
        .from("tds_ledger")
        .select("tax_paise")
        .gte("created_at", monthIso);
      return ((data ?? []) as Array<{ tax_paise: number | null }>).reduce(
        (s, r) => s + (r.tax_paise ?? 0),
        0,
      );
    }, 0),
    safe(async () => {
      const { data } = await admin
        .from("tcs_ledger")
        .select("tax_paise")
        .gte("created_at", monthIso);
      return ((data ?? []) as Array<{ tax_paise: number | null }>).reduce(
        (s, r) => s + (r.tax_paise ?? 0),
        0,
      );
    }, 0),
    safe(
      async () => {
        const { count } = await admin
          .from("data_export_requests")
          .select("id", { count: "exact", head: true })
          .in("status", ["requested", "pending", "processing"]);
        return (count as number | null) ?? 0;
      },
      null as number | null,
    ),
    safe(
      async () => {
        const { count } = await admin
          .from("data_deletion_requests")
          .select("id", { count: "exact", head: true })
          .in("status", ["requested", "pending", "processing"]);
        return (count as number | null) ?? 0;
      },
      null as number | null,
    ),
    safe(async () => {
      // Pull recent owner_audit_log entries that look compliance-relevant.
      // We OR three predicates because the action vocabulary is open.
      const { data } = await admin
        .from("owner_audit_log")
        .select("id, action, target_type, target_id, ip, created_at")
        .or(
          "action.ilike.compliance.%,action.ilike.%refund%,action.ilike.%delete%,action.ilike.%export%,action.ilike.%dpdp%",
        )
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as AuditRow[];
    }, [] as AuditRow[]),
  ]);

  return (
    <>
      <PageHeader
        title="Compliance"
        subtitle="DPDP consents · licences · GST/TDS/TCS · data subject rights"
      />

      <div className="cc-stack">
        {/* KPI strip */}
        <div>
          <p className="cc-card-title" style={{ marginBottom: 8 }}>
            This month
          </p>
          <div className="cc-grid cc-grid-4">
            <Kpi
              label="DPDP consents"
              value={dpdpCount.toLocaleString("en-IN")}
              sub="creators with dpdp_consent_at"
            />
            <Kpi
              label="Active licences"
              value={activeLicences.toLocaleString("en-IN")}
              sub="licenses.status = active"
            />
            <Kpi
              label="GST collected · MTD"
              value={fmt(gstMtd)}
              sub="output_on_commission + service"
            />
            <Kpi
              label="TDS withheld · MTD"
              value={fmt(tdsMtd)}
              sub="Sec 194-O · 1%"
            />
          </div>
        </div>

        {/* DPDP queues */}
        <div>
          <p className="cc-card-title" style={{ marginBottom: 8 }}>
            DPDP requests · data subject rights
          </p>
          <div className="cc-grid cc-grid-2">
            <div className="cc-card" style={{ padding: 16 }}>
              <p className="cc-card-title" style={{ margin: 0, marginBottom: 6 }}>
                Right to access
              </p>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 12,
                  marginBottom: 8,
                }}
              >
                <span
                  className="cc-mono-cell"
                  style={{ fontSize: 26, fontWeight: 700 }}
                >
                  {exportQueue === null ? "—" : exportQueue}
                </span>
                <span
                  className="cc-mono-cell"
                  style={{ color: "var(--cc-fg-muted)", fontSize: 11.5 }}
                >
                  pending exports
                </span>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 11.5,
                  color: "var(--cc-fg-muted)",
                }}
              >
                {exportQueue === null
                  ? "data_export_requests table not configured."
                  : "Drill-down · view list ships next iteration."}
              </p>
            </div>
            <div className="cc-card" style={{ padding: 16 }}>
              <p className="cc-card-title" style={{ margin: 0, marginBottom: 6 }}>
                Right to be forgotten
              </p>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 12,
                  marginBottom: 8,
                }}
              >
                <span
                  className="cc-mono-cell"
                  style={{ fontSize: 26, fontWeight: 700 }}
                >
                  {deletionQueue === null ? "—" : deletionQueue}
                </span>
                <span
                  className="cc-mono-cell"
                  style={{ color: "var(--cc-fg-muted)", fontSize: 11.5 }}
                >
                  pending deletions
                </span>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 11.5,
                  color: "var(--cc-fg-muted)",
                }}
              >
                {deletionQueue === null
                  ? "data_deletion_requests table not configured."
                  : "Drill-down · view list ships next iteration."}
              </p>
            </div>
          </div>
        </div>

        {/* Tax ledgers MTD */}
        <div>
          <p className="cc-card-title" style={{ marginBottom: 8 }}>
            Tax ledgers · this month
          </p>
          <div className="cc-card" style={{ padding: 0, overflow: "auto" }}>
            <table className="cc-table">
              <thead>
                <tr>
                  <th style={{ width: 130 }}>Ledger</th>
                  <th style={{ width: 130 }}>MTD total</th>
                  <th style={{ width: 100 }}>Section</th>
                  <th style={{ width: 130 }}>Filing</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="cc-mono-cell">gst_output_ledger</td>
                  <td className="cc-mono-cell">{fmt(gstMtd)}</td>
                  <td className="cc-mono-cell" style={{ color: "var(--cc-fg-muted)" }}>
                    18%
                  </td>
                  <td className="cc-mono-cell" style={{ color: "var(--cc-fg-muted)" }}>
                    GSTR-1 / 3B
                  </td>
                  <td style={{ color: "var(--cc-fg-muted)" }}>
                    GST collected on platform commission &amp; remitted on creator service
                  </td>
                </tr>
                <tr>
                  <td className="cc-mono-cell">tds_ledger</td>
                  <td className="cc-mono-cell">{fmt(tdsMtd)}</td>
                  <td className="cc-mono-cell" style={{ color: "var(--cc-fg-muted)" }}>
                    194-O · 1%
                  </td>
                  <td className="cc-mono-cell" style={{ color: "var(--cc-fg-muted)" }}>
                    Form 26Q
                  </td>
                  <td style={{ color: "var(--cc-fg-muted)" }}>
                    Income-tax TDS deducted at creator withdrawal · Form 16A quarterly
                  </td>
                </tr>
                <tr>
                  <td className="cc-mono-cell">tcs_ledger</td>
                  <td className="cc-mono-cell">{fmt(tcsMtd)}</td>
                  <td className="cc-mono-cell" style={{ color: "var(--cc-fg-muted)" }}>
                    Sec 52 · 1%
                  </td>
                  <td className="cc-mono-cell" style={{ color: "var(--cc-fg-muted)" }}>
                    GSTR-8
                  </td>
                  <td style={{ color: "var(--cc-fg-muted)" }}>
                    CGST TCS collected at creator withdrawal · monthly
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent compliance audits */}
        <div>
          <p className="cc-card-title" style={{ marginBottom: 8 }}>
            Recent compliance audits · last 50 (compliance/refund/delete/export/dpdp)
          </p>
          <div className="cc-card" style={{ padding: 0, overflow: "auto" }}>
            <table className="cc-table">
              <thead>
                <tr>
                  <th style={{ width: 160 }}>Time (UTC)</th>
                  <th style={{ width: 200 }}>Action</th>
                  <th style={{ width: 120 }}>Target type</th>
                  <th>Target id</th>
                  <th style={{ width: 130 }}>IP</th>
                </tr>
              </thead>
              <tbody>
                {complianceAudits.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="cc-table-empty">
                      No compliance-tagged audit entries yet.
                    </td>
                  </tr>
                ) : (
                  complianceAudits.map((r) => (
                    <tr key={r.id}>
                      <td
                        className="cc-mono-cell"
                        style={{ color: "var(--cc-fg-muted)", fontSize: 11.5 }}
                      >
                        {new Date(r.created_at)
                          .toISOString()
                          .replace("T", " ")
                          .slice(0, 19)}
                      </td>
                      <td className="cc-mono-cell">{r.action}</td>
                      <td
                        className="cc-mono-cell"
                        style={{ color: "var(--cc-fg-muted)" }}
                      >
                        {r.target_type ?? "—"}
                      </td>
                      <td
                        className="cc-mono-cell"
                        style={{ color: "var(--cc-fg-muted)", fontSize: 11.5 }}
                      >
                        {r.target_id ?? "—"}
                      </td>
                      <td
                        className="cc-mono-cell"
                        style={{ color: "var(--cc-fg-muted)", fontSize: 11.5 }}
                      >
                        {r.ip ?? "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div
          className="cc-card"
          style={{
            padding: 12,
            fontSize: 11.5,
            color: "var(--cc-fg-muted)",
            borderStyle: "dashed",
          }}
        >
          Read-only this iteration. Drill-down lists for export &amp; deletion
          queues, plus DPDP consent log per user, ship next iteration.
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
      <span className="cc-kpi-value" style={{ color }}>
        {value}
      </span>
      {sub && <span className="cc-kpi-sub">{sub}</span>}
    </div>
  );
}
