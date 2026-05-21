/**
 * Support tickets — Control Centre triage queue.
 *
 * Lists tickets raised by creators + brands with quick status filters and a
 * KPI strip. Each row links to the detail page where the operator replies,
 * resolves, and (for brands) grants credits.
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

interface TicketRow {
  id: string;
  user_id: string;
  role: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  has_unread_for_operator: boolean;
  created_at: string;
  updated_at: string;
}

const FILTER_OPTIONS = ["all", "open", "in_progress", "waiting_on_user", "resolved", "closed"];

function relativeFrom(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function statusPill(status: string): string {
  if (status === "open") return "cc-pill-bad";
  if (status === "in_progress") return "cc-pill-warn";
  if (status === "waiting_on_user") return "cc-pill-info";
  if (status === "resolved") return "cc-pill-ok";
  return "cc-pill-neutral";
}

function priorityPill(priority: string): string {
  if (priority === "urgent" || priority === "high") return "cc-pill-bad";
  if (priority === "normal") return "cc-pill-neutral";
  return "cc-pill-info";
}

export default async function TicketsPage({ params, searchParams }: Props) {
  const { ccSlug } = await params;
  await ensureCCAuth(ccSlug);

  const sp = await searchParams;
  const filter = FILTER_OPTIONS.includes(sp.status ?? "") ? sp.status! : "all";

  const session = await getCurrentSession();
  void logAudit({ action: "tickets.view", sessionId: session?.id ?? null, payload: { filter } });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  let listQuery = admin
    .from("support_tickets")
    .select(
      "id, user_id, role, subject, category, status, priority, has_unread_for_operator, created_at, updated_at",
    )
    .order("updated_at", { ascending: false })
    .limit(200);
  if (filter !== "all") listQuery = listQuery.eq("status", filter);

  const [openCount, inProgressCount, unreadCount, listRes] = await Promise.all([
    admin.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
    admin.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "in_progress"),
    admin.from("support_tickets").select("id", { count: "exact", head: true }).eq("has_unread_for_operator", true),
    listQuery,
  ]);

  const list = (listRes.data ?? []) as TicketRow[];

  // Hydrate raiser display names
  const userIds = Array.from(new Set(list.map((t) => t.user_id)));
  const { data: users } = userIds.length
    ? await admin.from("users").select("id, display_name, email").in("id", userIds)
    : { data: [] };
  const userMap = new Map<string, { display_name: string | null; email: string | null }>(
    ((users ?? []) as Array<{ id: string; display_name: string | null; email: string | null }>).map(
      (u) => [u.id, { display_name: u.display_name, email: u.email }],
    ),
  );

  return (
    <>
      <PageHeader title="Support tickets" subtitle={`${list.length} loaded · creator + brand requests`} />

      <div className="cc-stack">
        <div className="cc-grid cc-grid-4">
          <Kpi label="Open" value={String(openCount.count ?? 0)} tone={(openCount.count ?? 0) > 0 ? "bad" : "ok"} />
          <Kpi label="In progress" value={String(inProgressCount.count ?? 0)} tone={(inProgressCount.count ?? 0) > 0 ? "warn" : undefined} />
          <Kpi label="Needs reply" value={String(unreadCount.count ?? 0)} tone={(unreadCount.count ?? 0) > 0 ? "bad" : "ok"} />
          <Kpi label="Loaded" value={String(list.length)} />
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
              {s === "all" ? "All" : s.replace(/_/g, " ")}
            </button>
          ))}
        </form>

        <div className="cc-card" style={{ padding: 0, overflow: "auto" }}>
          <table className="cc-table">
            <thead>
              <tr>
                <th style={{ width: 90 }}>Ticket</th>
                <th style={{ width: 90 }}>Role</th>
                <th>Subject</th>
                <th style={{ width: 130 }}>Category</th>
                <th style={{ width: 120 }}>Status</th>
                <th style={{ width: 90 }}>Priority</th>
                <th style={{ width: 100 }}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={7} className="cc-table-empty">No tickets match this filter.</td>
                </tr>
              ) : (
                list.map((t) => {
                  const u = userMap.get(t.user_id);
                  return (
                    <tr key={t.id}>
                      <td className="cc-mono-cell" style={{ fontSize: 11 }}>
                        <Link href={`/${ccSlug}/tickets/${t.id}`} style={{ color: "var(--cc-accent)" }}>
                          {t.id.slice(0, 8)}…
                        </Link>
                      </td>
                      <td>
                        <span className={`cc-pill ${t.role === "brand" ? "cc-pill-info" : "cc-pill-neutral"}`}>
                          {t.role}
                        </span>
                      </td>
                      <td style={{ fontSize: 12.5, maxWidth: 320 }}>
                        <Link href={`/${ccSlug}/tickets/${t.id}`} style={{ color: "var(--cc-fg)" }}>
                          {t.has_unread_for_operator && (
                            <span
                              style={{
                                display: "inline-block",
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                background: "var(--cc-bad)",
                                marginRight: 6,
                                verticalAlign: "middle",
                              }}
                            />
                          )}
                          {t.subject}
                        </Link>
                        <div style={{ fontSize: 11, color: "var(--cc-fg-dim)", marginTop: 2 }}>
                          {u?.display_name ?? u?.email ?? t.user_id.slice(0, 8)}
                        </div>
                      </td>
                      <td style={{ fontSize: 11.5, color: "var(--cc-fg-muted)" }}>
                        {t.category.replace(/_/g, " ")}
                      </td>
                      <td>
                        <span className={`cc-pill ${statusPill(t.status)}`}>{t.status.replace(/_/g, " ")}</span>
                      </td>
                      <td>
                        <span className={`cc-pill ${priorityPill(t.priority)}`}>{t.priority}</span>
                      </td>
                      <td className="cc-mono-cell" style={{ fontSize: 11.5, color: "var(--cc-fg-muted)" }}>
                        {relativeFrom(t.updated_at)}
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

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "bad" }) {
  const color =
    tone === "ok" ? "var(--cc-ok)" : tone === "warn" ? "var(--cc-warn)" : tone === "bad" ? "var(--cc-bad)" : "var(--cc-fg)";
  return (
    <div className="cc-kpi">
      <span className="cc-kpi-label">{label}</span>
      <span className="cc-kpi-value" style={{ color }}>{value}</span>
    </div>
  );
}
