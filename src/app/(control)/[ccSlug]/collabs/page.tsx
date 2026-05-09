/**
 * Collabs module — every collab session in the platform with quick filters.
 * Per-row force-complete / cancel actions ship in the next iteration; the
 * /api/collabs/[id]/force-complete endpoint already exists.
 */

import { ensureCCAuth, PageHeader } from "../_components/page-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/cc/audit";
import { getCurrentSession } from "@/lib/cc/session";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ ccSlug: string }>;
  searchParams: Promise<{ status?: string }>;
}

interface Row {
  id: string;
  name: string;
  status: string;
  package_tier: string | null;
  package_price_paise: number | null;
  approved_count: number;
  final_images_target: number | null;
  created_at: string;
}

function fmt(paise: number | null | undefined) {
  if (paise == null) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

export default async function CollabsPage({ params, searchParams }: Props) {
  const { ccSlug } = await params;
  await ensureCCAuth(ccSlug);

  const sp = await searchParams;
  const session = await getCurrentSession();
  void logAudit({ action: "collabs.view", sessionId: session?.id ?? null });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  let q = admin
    .from("collab_sessions")
    .select("id, name, status, package_tier, package_price_paise, approved_count, final_images_target, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (sp.status) q = q.eq("status", sp.status);
  const { data: rows } = await q;
  const list = (rows ?? []) as Row[];

  const statuses = ["active", "completed", "paused"];

  return (
    <>
      <PageHeader title="Collabs" subtitle={`${list.length} loaded`} />

      <div className="cc-toolbar">
        <a
          href={`/${ccSlug}/collabs`}
          className={`cc-pill ${!sp.status ? "cc-pill-info" : "cc-pill-neutral"}`}
        >
          all
        </a>
        {statuses.map((s) => (
          <a
            key={s}
            href={`/${ccSlug}/collabs?status=${s}`}
            className={`cc-pill ${sp.status === s ? "cc-pill-info" : "cc-pill-neutral"}`}
          >
            {s}
          </a>
        ))}
      </div>

      <div className="cc-card" style={{ padding: 0, overflow: "auto" }}>
        <table className="cc-table">
          <thead>
            <tr>
              <th>Name</th>
              <th style={{ width: 90 }}>Status</th>
              <th style={{ width: 80 }}>Tier</th>
              <th style={{ width: 110 }}>Price</th>
              <th style={{ width: 110 }}>Approved</th>
              <th style={{ width: 130 }}>Created</th>
              <th style={{ width: 100 }}>Id</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={7} className="cc-table-empty">No collabs match.</td></tr>
            ) : (
              list.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>
                    <span className={`cc-pill ${c.status === "active" ? "cc-pill-ok" : c.status === "completed" ? "cc-pill-info" : "cc-pill-neutral"}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="cc-mono-cell">{c.package_tier ?? "—"}</td>
                  <td className="cc-mono-cell">{fmt(c.package_price_paise)}</td>
                  <td className="cc-mono-cell">
                    {c.approved_count}{c.final_images_target ? ` / ${c.final_images_target}` : ""}
                  </td>
                  <td className="cc-mono-cell" style={{ color: "var(--cc-fg-muted)", fontSize: 11.5 }}>
                    {new Date(c.created_at).toISOString().slice(0, 10)}
                  </td>
                  <td className="cc-mono-cell" style={{ color: "var(--cc-fg-muted)", fontSize: 11 }}>
                    {c.id.slice(0, 8)}…
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
