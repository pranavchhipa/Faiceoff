/**
 * AI pipeline module — read-only env-var display + cost / throughput analytics.
 *
 * Live model swap requires a Vercel env update + redeploy, so this page is
 * deliberately read-only. KPIs cover throughput, latency, and quality:
 *   • Generations 24h / 7d / 30d
 *   • Avg approved generation duration (created_at → updated_at) over 7d
 *   • Approval & failure rate over 7d
 *
 * Section 2 surfaces the live env-var configuration (image model, prompt
 * assembler, stage-2 refinement flag, face similarity flag).
 *
 * Section 3 lists the most recent 30 generations with status + duration so
 * an operator can eyeball the pipeline without leaving the page.
 */

import { ensureCCAuth, PageHeader } from "../_components/page-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/cc/audit";
import { getCurrentSession } from "@/lib/cc/session";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ ccSlug: string }>;
}

interface RecentGen {
  id: string;
  status: string;
  retry_count: number | null;
  created_at: string;
  updated_at: string;
}

interface DurationRow {
  created_at: string;
  updated_at: string;
}

function relativeFrom(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function durationSec(created: string, updated: string): number {
  return Math.max(0, Math.round((new Date(updated).getTime() - new Date(created).getTime()) / 1000));
}

function statusPill(status: string): string {
  if (status === "approved") return "cc-pill-ok";
  if (status === "rejected" || status === "failed" || status === "discarded") return "cc-pill-bad";
  if (status === "compliance_check" || status === "generating" || status === "output_check") return "cc-pill-warn";
  if (status === "ready_for_brand_review" || status === "ready_for_approval") return "cc-pill-info";
  return "cc-pill-neutral";
}

export default async function AIPage({ params }: Props) {
  const { ccSlug } = await params;
  await ensureCCAuth(ccSlug);

  const session = await getCurrentSession();
  void logAudit({ action: "ai.view", sessionId: session?.id ?? null });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const now = Date.now();
  const day1 = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const day7 = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const day30 = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    count24h,
    count7d,
    count30d,
    durations7d,
    failed7d,
    approved7d,
    total7d,
    recentRes,
  ] = await Promise.all([
    admin.from("generations").select("id", { count: "exact", head: true }).gte("created_at", day1),
    admin.from("generations").select("id", { count: "exact", head: true }).gte("created_at", day7),
    admin.from("generations").select("id", { count: "exact", head: true }).gte("created_at", day30),
    admin
      .from("generations")
      .select("created_at, updated_at")
      .eq("status", "approved")
      .gte("created_at", day7)
      .limit(500),
    admin
      .from("generations")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("created_at", day7),
    admin
      .from("generations")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved")
      .gte("created_at", day7),
    admin.from("generations").select("id", { count: "exact", head: true }).gte("created_at", day7),
    admin
      .from("generations")
      .select("id, status, retry_count, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const durRows = (durations7d.data ?? []) as DurationRow[];
  const avgDurationSec = durRows.length
    ? Math.round(
        durRows.reduce((sum, r) => sum + durationSec(r.created_at, r.updated_at), 0) / durRows.length,
      )
    : 0;

  const total = total7d.count ?? 0;
  const approvalPct = total > 0 ? Math.round(((approved7d.count ?? 0) / total) * 100) : 0;
  const failurePct = total > 0 ? Math.round(((failed7d.count ?? 0) / total) * 100) : 0;

  const recent = (recentRes.data ?? []) as RecentGen[];

  // Env-var snapshot.
  const imageModel = process.env.NANO_BANANA_MODEL ?? "gemini-3-pro-image-preview";
  const promptAssembler = process.env.PROMPT_ASSEMBLER_MODEL ?? "meta-llama/llama-3.1-8b-instruct";
  const stage2Enabled = process.env.ENABLE_PRODUCT_REFINEMENT === "true";
  const faceSimEnabled = process.env.ENABLE_FACE_SIMILARITY === "true";

  return (
    <>
      <PageHeader
        title="AI pipeline"
        subtitle="Throughput · latency · quality · live model configuration"
      />

      <div className="cc-stack">
        <div className="cc-grid cc-grid-4">
          <Kpi label="Generations 24h" value={String(count24h.count ?? 0)} />
          <Kpi label="Generations 7d" value={String(count7d.count ?? 0)} sub={`${count30d.count ?? 0} in 30d`} />
          <Kpi
            label="Avg gen duration"
            value={`${avgDurationSec}s`}
            sub={`approved · n=${durRows.length}`}
            tone={avgDurationSec > 90 ? "warn" : avgDurationSec > 0 ? "ok" : undefined}
          />
          <Kpi
            label="Approval rate 7d"
            value={`${approvalPct}%`}
            sub={`failure ${failurePct}% · n=${total}`}
            tone={total > 0 ? (approvalPct >= 70 ? "ok" : approvalPct >= 50 ? "warn" : "bad") : undefined}
          />
        </div>

        <div>
          <p className="cc-card-title" style={{ marginBottom: 8 }}>Active model configuration</p>
          <div className="cc-grid cc-grid-2">
            <ConfigRow
              label="Image model"
              value={imageModel}
              env="NANO_BANANA_MODEL"
              tone="ok"
              toneText="active"
            />
            <ConfigRow
              label="Prompt assembler"
              value={promptAssembler}
              env="PROMPT_ASSEMBLER_MODEL"
              tone="ok"
              toneText="active"
            />
            <ConfigRow
              label="Stage-2 refinement"
              value={stage2Enabled ? "enabled" : "disabled"}
              env="ENABLE_PRODUCT_REFINEMENT"
              tone={stage2Enabled ? "ok" : "warn"}
              toneText={stage2Enabled ? "on" : "off"}
            />
            <ConfigRow
              label="Face similarity check"
              value={faceSimEnabled ? "enabled" : "disabled"}
              env="ENABLE_FACE_SIMILARITY"
              tone={faceSimEnabled ? "ok" : "warn"}
              toneText={faceSimEnabled ? "on" : "off"}
            />
          </div>
          <p className="cc-muted" style={{ fontSize: 11.5, marginTop: 12, fontFamily: "var(--cc-mono)", letterSpacing: "0.06em" }}>
            LIVE MODEL SWAP SHIPS NEXT ITERATION · TO CHANGE: UPDATE VERCEL ENV + REDEPLOY
          </p>
        </div>

        <div>
          <p className="cc-card-title" style={{ marginBottom: 8 }}>Pipeline · last 30 generations</p>
          <div className="cc-card" style={{ padding: 0, overflow: "auto" }}>
            <table className="cc-table">
              <thead>
                <tr>
                  <th style={{ width: 110 }}>Gen id</th>
                  <th style={{ width: 150 }}>Status</th>
                  <th style={{ width: 110 }}>Duration</th>
                  <th style={{ width: 80 }}>Retries</th>
                  <th style={{ width: 130 }}>Created</th>
                  <th style={{ width: 130 }}>Updated</th>
                </tr>
              </thead>
              <tbody>
                {recent.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="cc-table-empty">No generations yet.</td>
                  </tr>
                ) : (
                  recent.map((g) => (
                    <tr key={g.id}>
                      <td className="cc-mono-cell" style={{ fontSize: 11 }}>{g.id.slice(0, 8)}…</td>
                      <td><span className={`cc-pill ${statusPill(g.status)}`}>{g.status}</span></td>
                      <td className="cc-mono-cell" style={{ fontSize: 11.5 }}>{durationSec(g.created_at, g.updated_at)}s</td>
                      <td className="cc-mono-cell" style={{ fontSize: 11.5 }}>{g.retry_count ?? 0}</td>
                      <td className="cc-mono-cell" style={{ fontSize: 11, color: "var(--cc-fg-muted)" }}>{relativeFrom(g.created_at)}</td>
                      <td className="cc-mono-cell" style={{ fontSize: 11, color: "var(--cc-fg-muted)" }}>{relativeFrom(g.updated_at)}</td>
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

function ConfigRow({
  label,
  value,
  env,
  tone,
  toneText,
}: {
  label: string;
  value: string;
  env: string;
  tone: "ok" | "warn" | "bad";
  toneText: string;
}) {
  const pillCls = tone === "ok" ? "cc-pill-ok" : tone === "warn" ? "cc-pill-warn" : "cc-pill-bad";
  return (
    <div className="cc-card">
      <div className="cc-row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <span className="cc-label" style={{ marginBottom: 0 }}>{label}</span>
        <span className={`cc-pill ${pillCls}`}>{toneText}</span>
      </div>
      <p className="cc-mono-cell" style={{ margin: 0, fontSize: 12.5, color: "var(--cc-fg)", wordBreak: "break-all" }}>
        {value}
      </p>
      <p className="cc-mono-cell" style={{ margin: "6px 0 0 0", fontSize: 10, color: "var(--cc-fg-dim)", letterSpacing: "0.1em" }}>
        ENV · {env}
      </p>
    </div>
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
