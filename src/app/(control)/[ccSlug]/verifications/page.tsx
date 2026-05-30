/**
 * Creator verifications — Control Centre review queue.
 *
 * Creators submit Aadhaar + PAN + an Instagram-follow confirmation from
 * /creator/verify. They land here as 'pending'. The operator opens a row,
 * eyeballs the docs, and approves (→ gold tick + payouts unlocked) or rejects.
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

interface VerRow {
  id: string;
  creator_id: string;
  status: string;
  instagram_followed: boolean;
  submitted_at: string | null;
  reviewed_at: string | null;
}

const FILTER_OPTIONS = ["pending", "all", "verified", "rejected"];

function relativeFrom(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function statusPill(status: string): string {
  if (status === "pending") return "cc-pill-warn";
  if (status === "verified") return "cc-pill-ok";
  if (status === "rejected") return "cc-pill-bad";
  return "cc-pill-neutral";
}

export default async function VerificationsPage({ params, searchParams }: Props) {
  const { ccSlug } = await params;
  await ensureCCAuth(ccSlug);

  const sp = await searchParams;
  const filter = FILTER_OPTIONS.includes(sp.status ?? "") ? sp.status! : "pending";

  const session = await getCurrentSession();
  void logAudit({ action: "verifications.view", sessionId: session?.id ?? null, payload: { filter } });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  let listQuery = admin
    .from("creator_verifications")
    .select("id, creator_id, status, instagram_followed, submitted_at, reviewed_at")
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (filter !== "all") listQuery = listQuery.eq("status", filter);

  const [pendingCount, verifiedCount, rejectedCount, listRes] = await Promise.all([
    admin.from("creator_verifications").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("creator_verifications").select("id", { count: "exact", head: true }).eq("status", "verified"),
    admin.from("creator_verifications").select("id", { count: "exact", head: true }).eq("status", "rejected"),
    listQuery,
  ]);

  const list = (listRes.data ?? []) as VerRow[];

  // Hydrate creator names + handles.
  const creatorIds = Array.from(new Set(list.map((v) => v.creator_id)));
  const { data: creators } = creatorIds.length
    ? await admin
        .from("creators")
        .select("id, user_id, instagram_handle, is_verified")
        .in("id", creatorIds)
    : { data: [] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cRows = (creators ?? []) as any[];
  const userIds = cRows.map((c) => c.user_id);
  const { data: users } = userIds.length
    ? await admin.from("users").select("id, display_name, email").in("id", userIds)
    : { data: [] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userMap = new Map((users ?? []).map((u: any) => [u.id, u]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const creatorMap = new Map(cRows.map((c: any) => [c.id, { ...c, user: userMap.get(c.user_id) }]));

  return (
    <>
      <PageHeader title="Creator verifications" subtitle={`${list.length} loaded · manual KYC review`} />

      <div className="cc-stack">
        <div className="cc-grid cc-grid-4">
          <Kpi label="Pending" value={String(pendingCount.count ?? 0)} tone={(pendingCount.count ?? 0) > 0 ? "warn" : "ok"} />
          <Kpi label="Verified" value={String(verifiedCount.count ?? 0)} tone="ok" />
          <Kpi label="Rejected" value={String(rejectedCount.count ?? 0)} tone={(rejectedCount.count ?? 0) > 0 ? "bad" : undefined} />
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
              {s === "all" ? "All" : s}
            </button>
          ))}
        </form>

        <div className="cc-card" style={{ padding: 0, overflow: "auto" }}>
          <table className="cc-table">
            <thead>
              <tr>
                <th style={{ width: 90 }}>Ref</th>
                <th>Creator</th>
                <th style={{ width: 160 }}>Instagram</th>
                <th style={{ width: 110 }}>Status</th>
                <th style={{ width: 110 }}>Submitted</th>
                <th style={{ width: 90 }}>Review</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={6} className="cc-table-empty">No verifications match this filter.</td>
                </tr>
              ) : (
                list.map((v) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const c = creatorMap.get(v.creator_id) as any;
                  const name = c?.user?.display_name ?? c?.user?.email ?? "Creator";
                  return (
                    <tr key={v.id}>
                      <td className="cc-mono-cell" style={{ fontSize: 11 }}>
                        <Link href={`/${ccSlug}/verifications/${v.id}`} style={{ color: "var(--cc-accent)" }}>
                          {v.id.slice(0, 8)}…
                        </Link>
                      </td>
                      <td style={{ fontSize: 12.5 }}>
                        <Link href={`/${ccSlug}/verifications/${v.id}`} style={{ color: "var(--cc-fg)" }}>
                          {name}
                        </Link>
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {c?.instagram_handle ? `@${c.instagram_handle}` : "—"}{" "}
                        <span className={`cc-pill ${v.instagram_followed ? "cc-pill-ok" : "cc-pill-neutral"}`}>
                          {v.instagram_followed ? "follows" : "unconfirmed"}
                        </span>
                      </td>
                      <td>
                        <span className={`cc-pill ${statusPill(v.status)}`}>{v.status}</span>
                      </td>
                      <td style={{ fontSize: 11, color: "var(--cc-fg-dim)" }}>{relativeFrom(v.submitted_at)}</td>
                      <td>
                        <Link href={`/${ccSlug}/verifications/${v.id}`} className="cc-btn" style={{ fontSize: 11 }}>
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
