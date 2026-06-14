/**
 * Disputes module — read-only queue with quick filters.
 *
 * Disputes table schema (from 00011):
 *   id, generation_id, raised_by (users.id), reason, status
 *   ('open', 'investigating', 'resolved_refund', 'resolved_no_action', 'closed')
 *   resolution_notes, resolved_at, created_at, updated_at
 *
 * We hydrate raised-by role + the referenced generation's image / brand /
 * creator so the row tells the operator the whole story without a click.
 *
 * Each row links to the detail page where the operator resolves it
 * (refund the brand / no action) via the resolveDispute server action.
 */

import Link from "next/link";
import { ensureCCAuth, PageHeader } from "../_components/page-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/cc/audit";
import { getCurrentSession } from "@/lib/cc/session";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ ccSlug: string }>;
  searchParams: Promise<{ status?: string }>;
}

interface DisputeRow {
  id: string;
  generation_id: string;
  raised_by: string;
  reason: string;
  status: string;
  resolution_notes: string | null;
  resolved_at: string | null;
  created_at: string;
}

interface GenLite {
  id: string;
  image_url: string | null;
  brand_id: string;
  creator_id: string;
}

interface UserLite {
  id: string;
  role: string | null;
}

const FILTER_OPTIONS = ["all", "open", "investigating", "resolved_refund", "resolved_no_action", "closed"];

function relativeFrom(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function statusPill(status: string): string {
  if (status === "open") return "cc-pill-bad";
  if (status === "investigating") return "cc-pill-warn";
  if (status === "resolved_refund" || status === "resolved_no_action") return "cc-pill-ok";
  if (status === "closed") return "cc-pill-neutral";
  return "cc-pill-info";
}

function rolePill(role: string | null | undefined): { cls: string; text: string } {
  if (role === "brand") return { cls: "cc-pill-info", text: "brand" };
  if (role === "creator") return { cls: "cc-pill-neutral", text: "creator" };
  if (role === "admin") return { cls: "cc-pill-warn", text: "admin" };
  return { cls: "cc-pill-neutral", text: "—" };
}

function truncate(text: string | null, n: number): string {
  if (!text) return "—";
  return text.length > n ? `${text.slice(0, n)}…` : text;
}

export default async function DisputesPage({ params, searchParams }: Props) {
  const { ccSlug } = await params;
  await ensureCCAuth(ccSlug);

  const sp = await searchParams;
  const filter = FILTER_OPTIONS.includes(sp.status ?? "") ? sp.status! : "all";

  const session = await getCurrentSession();
  void logAudit({ action: "disputes.view", sessionId: session?.id ?? null, payload: { filter } });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  let listQuery = admin
    .from("disputes")
    .select("id, generation_id, raised_by, reason, status, resolution_notes, resolved_at, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (filter !== "all") listQuery = listQuery.eq("status", filter);

  const [
    openCount,
    investigatingCount,
    resolvedThisMonth,
    totalCount,
    listRes,
  ] = await Promise.all([
    admin.from("disputes").select("id", { count: "exact", head: true }).eq("status", "open"),
    admin.from("disputes").select("id", { count: "exact", head: true }).eq("status", "investigating"),
    admin
      .from("disputes")
      .select("id", { count: "exact", head: true })
      .in("status", ["resolved_refund", "resolved_no_action"])
      .gte("created_at", startOfMonth.toISOString()),
    admin.from("disputes").select("id", { count: "exact", head: true }),
    listQuery,
  ]);

  const list = (listRes.data ?? []) as DisputeRow[];

  // Hydrate referenced generations + raised-by users in two parallel batch queries.
  const genIds = Array.from(new Set(list.map((d) => d.generation_id)));
  const userIds = Array.from(new Set(list.map((d) => d.raised_by)));

  const [genRes, userRes] = await Promise.all([
    genIds.length
      ? admin.from("generations").select("id, image_url, brand_id, creator_id").in("id", genIds)
      : Promise.resolve({ data: [] }),
    userIds.length
      ? admin.from("users").select("id, role").in("id", userIds)
      : Promise.resolve({ data: [] }),
  ]);

  const genMap = new Map<string, GenLite>(((genRes.data ?? []) as GenLite[]).map((g) => [g.id, g]));
  const userMap = new Map<string, UserLite>(((userRes.data ?? []) as UserLite[]).map((u) => [u.id, u]));

  return (
    <>
      <PageHeader
        title="Disputes"
        subtitle={`${list.length} loaded · open a row to resolve`}
      />

      <div className="cc-stack">
        <div className="cc-grid cc-grid-4">
          <Kpi label="Open" value={String(openCount.count ?? 0)} tone={(openCount.count ?? 0) > 0 ? "bad" : "ok"} />
          <Kpi label="In review" value={String(investigatingCount.count ?? 0)} tone={(investigatingCount.count ?? 0) > 0 ? "warn" : undefined} />
          <Kpi label="Resolved this month" value={String(resolvedThisMonth.count ?? 0)} />
          <Kpi label="Total all-time" value={String(totalCount.count ?? 0)} />
        </div>

        <form className="cc-toolbar" method="get">
          {FILTER_OPTIONS.map((s) => (
            <button
              key={s}
              type="submit"
              name="status"
              value={s}
              className="cc-btn"
              style={{
                background: filter === s ? "var(--cc-bg-3)" : undefined,
                borderColor: filter === s ? "var(--cc-accent)" : undefined,
                color: filter === s ? "var(--cc-accent)" : undefined,
              }}
            >
              {s === "all" ? "All" : s.replace("_", " ")}
            </button>
          ))}
        </form>

        <div className="cc-card" style={{ padding: 0, overflow: "auto" }}>
          <table className="cc-table">
            <thead>
              <tr>
                <th style={{ width: 110 }}>Dispute id</th>
                <th style={{ width: 50 }}>Img</th>
                <th style={{ width: 110 }}>Gen id</th>
                <th style={{ width: 110 }}>Raised by</th>
                <th style={{ width: 130 }}>Status</th>
                <th>Reason / resolution</th>
                <th style={{ width: 100 }}>Age</th>
                <th style={{ width: 90 }}>Review</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={8} className="cc-table-empty">No disputes match this filter.</td>
                </tr>
              ) : (
                list.map((d) => {
                  const gen = genMap.get(d.generation_id);
                  const raiser = userMap.get(d.raised_by);
                  const role = rolePill(raiser?.role ?? null);
                  return (
                    <tr key={d.id}>
                      <td className="cc-mono-cell" style={{ fontSize: 11 }}>
                        <Link href={`/${ccSlug}/disputes/${d.id}`} style={{ color: "var(--cc-accent)" }}>
                          {d.id.slice(0, 8)}…
                        </Link>
                      </td>
                      <td>
                        {gen?.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={gen.image_url}
                            alt=""
                            width={32}
                            height={32}
                            style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 3, display: "block" }}
                          />
                        ) : (
                          <div
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 3,
                              background: "var(--cc-bg-3)",
                              border: "1px solid var(--cc-border)",
                            }}
                          />
                        )}
                      </td>
                      <td className="cc-mono-cell" style={{ fontSize: 11, color: "var(--cc-fg-muted)" }}>
                        {d.generation_id.slice(0, 8)}…
                      </td>
                      <td>
                        <span className={`cc-pill ${role.cls}`}>{role.text}</span>
                      </td>
                      <td>
                        <span className={`cc-pill ${statusPill(d.status)}`}>{d.status.replace("_", " ")}</span>
                      </td>
                      <td style={{ fontSize: 12, color: "var(--cc-fg-muted)", maxWidth: 360 }}>
                        <div>{truncate(d.reason, 80)}</div>
                        {d.resolution_notes && (
                          <div style={{ marginTop: 4, fontSize: 11, color: "var(--cc-fg-dim)" }}>
                            <span className="cc-mono-cell" style={{ letterSpacing: "0.06em" }}>RES: </span>
                            {truncate(d.resolution_notes, 80)}
                          </div>
                        )}
                      </td>
                      <td className="cc-mono-cell" style={{ fontSize: 11.5, color: "var(--cc-fg-muted)" }}>
                        {relativeFrom(d.created_at)}
                      </td>
                      <td>
                        <Link href={`/${ccSlug}/disputes/${d.id}`} className="cc-btn" style={{ fontSize: 11 }}>
                          Open
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
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
