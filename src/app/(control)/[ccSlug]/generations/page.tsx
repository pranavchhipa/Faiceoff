/**
 * Generations module — the operator's window onto what the product actually
 * produced. Every AI image ever generated, newest first.
 *
 * The AI page (../ai) shows pipeline COUNTS; this shows the OUTPUT. It is a
 * browse/inspect surface, not an action queue — force-discard / retry of a
 * wedged gen still lives in ../moderation. Nothing here mutates anything.
 *
 * Thumbnail grid, 60 per page, server-side filtered on:
 *   status · creator-approval state · collab · creator · brand · date range
 *
 * Failed / needs_admin_review rows have no image — they render as a bordered
 * placeholder carrying failure_reason, because those are exactly the rows an
 * operator is hunting for.
 *
 * Images live on public R2 (generations.image_url) so they render directly —
 * no signed URL needed. Plain <img> on purpose: next/image would need every R2
 * host whitelisted in next.config and buys nothing on an internal tool.
 */

import Link from "next/link";
import { ensureCCAuth, PageHeader } from "../_components/page-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/cc/audit";
import { getCurrentSession } from "@/lib/cc/session";
import {
  GEN_STATUSES,
  UUID_RE,
  DATE_RE,
  fmtMoney,
  relativeFrom,
  statusPillClass,
  approvalPillClass,
} from "./shared";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;

/** Explicit FK hint — approvals has three FKs, this names the right one. */
const APPROVAL_EMBED = "approvals!approvals_generation_id_fkey";

const APPROVAL_FILTERS: Record<string, string> = {
  approved: "approved",
  rejected: "rejected",
  pending: "pending",
};

interface Props {
  params: Promise<{ ccSlug: string }>;
  searchParams: Promise<{
    status?: string;
    approval?: string;
    collab?: string;
    creator?: string;
    brand?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}

interface GenRow {
  id: string;
  status: string;
  image_url: string | null;
  upscaled_url: string | null;
  cost_paise: number | null;
  retry_count: number | null;
  failure_reason: string | null;
  creator_id: string | null;
  brand_id: string | null;
  collab_session_id: string | null;
  structured_brief: Record<string, unknown> | null;
  created_at: string;
}

export default async function GenerationsPage({ params, searchParams }: Props) {
  const { ccSlug } = await params;
  await ensureCCAuth(ccSlug);

  const sp = await searchParams;
  const session = await getCurrentSession();
  void logAudit({ action: "generations.view", sessionId: session?.id ?? null, payload: sp });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // ── Sanitise every filter before it reaches a PostgREST filter string ────
  const status = sp.status && (GEN_STATUSES as readonly string[]).includes(sp.status) ? sp.status : "";
  const approval = sp.approval && APPROVAL_FILTERS[sp.approval] ? sp.approval : "";
  const collab = sp.collab && UUID_RE.test(sp.collab) ? sp.collab : "";
  const creator = sp.creator && UUID_RE.test(sp.creator) ? sp.creator : "";
  const brand = sp.brand && UUID_RE.test(sp.brand) ? sp.brand : "";
  const from = sp.from && DATE_RE.test(sp.from) ? sp.from : "";
  const to = sp.to && DATE_RE.test(sp.to) ? sp.to : "";
  const pageNum = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const offset = (pageNum - 1) * PAGE_SIZE;

  const cols =
    "id, status, image_url, upscaled_url, cost_paise, retry_count, failure_reason, " +
    "creator_id, brand_id, collab_session_id, structured_brief, created_at";

  // The creator-approval filter needs approvals joined, so the embed only
  // appears in the select when that filter is actually asked for. The approval
  // chip itself comes from a separate, embed-free query below — a bad embed can
  // never blank the gallery.
  const selectStr = approval ? `${cols}, ${APPROVAL_EMBED}!inner(status)` : cols;

  let q = admin
    .from("generations")
    .select(selectStr, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (status) q = q.eq("status", status);
  if (collab) q = q.eq("collab_session_id", collab);
  if (creator) q = q.eq("creator_id", creator);
  if (brand) q = q.eq("brand_id", brand);
  // +05:30, not Z: the operator picking "20 Sep" means the Indian calendar day.
  // UTC boundaries would silently hand them 05:30 IST that day through 05:29
  // the next. India has no DST, so a fixed offset is exact, and it matches the
  // IST bucketing the Funnel page uses.
  if (from) q = q.gte("created_at", `${from}T00:00:00+05:30`);
  if (to) q = q.lte("created_at", `${to}T23:59:59.999+05:30`);
  if (approval) q = q.eq("approvals.status", APPROVAL_FILTERS[approval]);

  const { data: genRows, count, error } = await q;
  const gens = (genRows ?? []) as GenRow[];
  const total = count ?? gens.length;
  const genIds = gens.map((g) => g.id);

  // ── Hydration + filter dropdown sources, all in one round ────────────────
  // creators/brands/users are small tables in this product; collab_sessions is
  // capped at the 300 most recent, which is exactly what the dropdown offers.
  const [approvalsRes, creatorsRes, brandsRes, collabsRes, usersRes] = await Promise.all([
    genIds.length > 0
      ? admin.from("approvals").select("generation_id, status").in("generation_id", genIds)
      : Promise.resolve({ data: [] }),
    admin.from("creators").select("id, user_id, instagram_handle").limit(500),
    admin.from("brands").select("id, user_id, company_name").limit(500),
    admin.from("collab_sessions").select("id, name").order("created_at", { ascending: false }).limit(300),
    admin.from("users").select("id, display_name").limit(1000),
  ]);

  const usersById = new Map<string, string | null>(
    ((usersRes.data ?? []) as Array<{ id: string; display_name: string | null }>).map((u) => [u.id, u.display_name]),
  );

  const creatorList = (
    (creatorsRes.data ?? []) as Array<{ id: string; user_id: string | null; instagram_handle: string | null }>
  ).map((c) => ({
    id: c.id,
    label:
      (c.user_id ? usersById.get(c.user_id) : null) ??
      (c.instagram_handle ? `@${c.instagram_handle}` : null) ??
      `${c.id.slice(0, 8)}…`,
  }));
  creatorList.sort((a, b) => a.label.localeCompare(b.label));
  const creatorLabel = new Map(creatorList.map((c) => [c.id, c.label]));

  const brandList = (
    (brandsRes.data ?? []) as Array<{ id: string; user_id: string | null; company_name: string | null }>
  ).map((b) => ({
    id: b.id,
    label:
      (b.company_name && b.company_name.trim()) ||
      (b.user_id ? usersById.get(b.user_id) : null) ||
      `${b.id.slice(0, 8)}…`,
  }));
  brandList.sort((a, b) => a.label.localeCompare(b.label));
  const brandLabel = new Map(brandList.map((b) => [b.id, b.label]));

  const collabList = ((collabsRes.data ?? []) as Array<{ id: string; name: string | null }>).map((c) => ({
    id: c.id,
    label: c.name?.trim() || `${c.id.slice(0, 8)}…`,
  }));

  // The lists above are capped for the dropdowns' sake. Past a cap an entity
  // would vanish from its own tile and render as `a1b2c3d4…`, which reads as a
  // data bug rather than a truncated lookup. Backfill labels for exactly the
  // ids on THIS page — bounded by PAGE_SIZE, and at today's volumes this fires
  // zero extra queries because nothing is ever missing.
  const missingCreators = [...new Set(gens.map((g) => g.creator_id).filter((x): x is string => !!x))].filter(
    (id) => !creatorLabel.has(id),
  );
  const missingBrands = [...new Set(gens.map((g) => g.brand_id).filter((x): x is string => !!x))].filter(
    (id) => !brandLabel.has(id),
  );

  if (missingCreators.length > 0 || missingBrands.length > 0) {
    const [mc, mb] = await Promise.all([
      missingCreators.length > 0
        ? admin.from("creators").select("id, user_id, instagram_handle").in("id", missingCreators)
        : Promise.resolve({ data: [] }),
      missingBrands.length > 0
        ? admin.from("brands").select("id, user_id, company_name").in("id", missingBrands)
        : Promise.resolve({ data: [] }),
    ]);
    const extraUserIds = [
      ...((mc.data ?? []) as Array<{ user_id: string | null }>).map((r) => r.user_id),
      ...((mb.data ?? []) as Array<{ user_id: string | null }>).map((r) => r.user_id),
    ].filter((x): x is string => !!x && !usersById.has(x));
    if (extraUserIds.length > 0) {
      const { data: eu } = await admin.from("users").select("id, display_name").in("id", extraUserIds);
      for (const u of (eu ?? []) as Array<{ id: string; display_name: string | null }>) {
        usersById.set(u.id, u.display_name);
      }
    }
    for (const c of (mc.data ?? []) as Array<{
      id: string;
      user_id: string | null;
      instagram_handle: string | null;
    }>) {
      creatorLabel.set(
        c.id,
        (c.user_id ? usersById.get(c.user_id) : null) ??
          (c.instagram_handle ? `@${c.instagram_handle}` : null) ??
          `${c.id.slice(0, 8)}…`,
      );
    }
    for (const b of (mb.data ?? []) as Array<{
      id: string;
      user_id: string | null;
      company_name: string | null;
    }>) {
      brandLabel.set(
        b.id,
        (b.company_name && b.company_name.trim()) ||
          (b.user_id ? usersById.get(b.user_id) : null) ||
          `${b.id.slice(0, 8)}…`,
      );
    }
  }

  const approvalByGen = new Map<string, string>(
    ((approvalsRes.data ?? []) as Array<{ generation_id: string; status: string }>).map((a) => [
      a.generation_id,
      a.status,
    ]),
  );

  // ── Pagination links keep every active filter ────────────────────────────
  function pageHref(n: number): string {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (approval) p.set("approval", approval);
    if (collab) p.set("collab", collab);
    if (creator) p.set("creator", creator);
    if (brand) p.set("brand", brand);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (n > 1) p.set("page", String(n));
    const qs = p.toString();
    return `/${ccSlug}/generations${qs ? `?${qs}` : ""}`;
  }

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showingFrom = total === 0 ? 0 : offset + 1;
  const showingTo = offset + gens.length;

  return (
    <>
      <PageHeader
        title="Generations"
        subtitle={`${total.toLocaleString("en-IN")} total · showing ${showingFrom}–${showingTo} · every image the platform has produced, newest first`}
      />

      <form className="cc-toolbar" method="get">
        <select name="status" defaultValue={status} className="cc-select" style={{ maxWidth: 190 }}>
          <option value="">Any status</option>
          {GEN_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>

        <select name="approval" defaultValue={approval} className="cc-select" style={{ maxWidth: 190 }}>
          <option value="">Any creator decision</option>
          <option value="approved">Creator approved</option>
          <option value="rejected">Creator rejected</option>
          <option value="pending">Awaiting creator</option>
        </select>

        <select name="collab" defaultValue={collab} className="cc-select" style={{ maxWidth: 200 }}>
          <option value="">Any collab</option>
          {collabList.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>

        <select name="creator" defaultValue={creator} className="cc-select" style={{ maxWidth: 190 }}>
          <option value="">Any creator</option>
          {creatorList.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>

        <select name="brand" defaultValue={brand} className="cc-select" style={{ maxWidth: 190 }}>
          <option value="">Any brand</option>
          {brandList.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>

        <input
          type="date"
          name="from"
          defaultValue={from}
          className="cc-input"
          style={{ maxWidth: 150 }}
          title="From date"
        />
        <input type="date" name="to" defaultValue={to} className="cc-input" style={{ maxWidth: 150 }} title="To date" />

        <button type="submit" className="cc-btn">
          Filter
        </button>
        <a href={`/${ccSlug}/generations`} className="cc-btn">
          Reset
        </a>
      </form>

      {error && (
        <div
          className="cc-card"
          style={{ background: "rgba(210,67,67,0.08)", borderColor: "rgba(210,67,67,0.3)", marginBottom: 16 }}
        >
          <p className="cc-mono-cell" style={{ fontSize: 11.5, color: "var(--cc-bad)", margin: 0 }}>
            Query error: {error.message}
          </p>
        </div>
      )}

      {gens.length === 0 ? (
        <div className="cc-card" style={{ textAlign: "center", padding: "36px 20px" }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Nothing matches</h3>
          <p style={{ margin: "6px 0 14px 0", fontSize: 12.5, color: "var(--cc-fg-muted)" }}>
            No generations for these filters.
          </p>
          <a className="cc-btn" href={`/${ccSlug}/generations`}>
            Reset filters
          </a>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(196px, 1fr))", gap: 12 }}>
          {gens.map((g) => {
            const src = g.image_url ?? null;
            const apStatus = approvalByGen.get(g.id) ?? null;
            const productName =
              typeof g.structured_brief?.product_name === "string"
                ? (g.structured_brief.product_name as string)
                : null;
            const cName = g.creator_id ? creatorLabel.get(g.creator_id) ?? `${g.creator_id.slice(0, 8)}…` : "—";
            const bName = g.brand_id ? brandLabel.get(g.brand_id) ?? `${g.brand_id.slice(0, 8)}…` : "—";

            return (
              <Link
                key={g.id}
                href={`/${ccSlug}/generations/${g.id}`}
                className="cc-card cc-action-card"
                style={{ padding: 0, overflow: "hidden", textDecoration: "none", color: "inherit", display: "block" }}
              >
                <div
                  style={{
                    position: "relative",
                    aspectRatio: "1 / 1",
                    background: "var(--cc-bg)",
                    borderBottom: "1px solid var(--cc-border)",
                  }}
                >
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={src}
                      alt={productName ?? "generation"}
                      loading="lazy"
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        padding: 12,
                        textAlign: "center",
                        border: "1px dashed var(--cc-border-strong)",
                      }}
                    >
                      <span
                        className="cc-monospace"
                        style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--cc-fg-dim)" }}
                      >
                        NO IMAGE
                      </span>
                      <span style={{ fontSize: 11.5, color: "var(--cc-fg-muted)", lineHeight: 1.35 }}>
                        {g.failure_reason ??
                          (g.status === "failed" ? "Failed — no reason recorded" : "Not produced yet")}
                      </span>
                    </div>
                  )}
                  {g.upscaled_url && g.upscaled_url !== g.image_url && (
                    <span
                      className="cc-pill cc-pill-neutral"
                      style={{ position: "absolute", top: 6, right: 6 }}
                      title="An upscaled variant exists"
                    >
                      2x
                    </span>
                  )}
                </div>

                <div style={{ padding: "8px 10px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span className={`cc-pill ${statusPillClass(g.status)}`}>{g.status.replace(/_/g, " ")}</span>
                    {apStatus && (
                      <span className={`cc-pill ${approvalPillClass(apStatus)}`} title="Creator decision">
                        {apStatus}
                      </span>
                    )}
                  </div>

                  {productName && (
                    <span
                      style={{
                        fontSize: 12,
                        color: "var(--cc-fg)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {productName}
                    </span>
                  )}

                  <span
                    style={{
                      fontSize: 11.5,
                      color: "var(--cc-fg-muted)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {cName} · {bName}
                  </span>

                  <span
                    className="cc-mono-cell"
                    style={{
                      fontSize: 11,
                      color: "var(--cc-fg-dim)",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>{fmtMoney(g.cost_paise)}</span>
                    <span>{relativeFrom(g.created_at)}</span>
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {lastPage > 1 && (
        <div className="cc-toolbar" style={{ marginTop: 20, justifyContent: "space-between" }}>
          <span className="cc-mono-cell" style={{ fontSize: 11.5, color: "var(--cc-fg-muted)" }}>
            Page {pageNum} of {lastPage}
          </span>
          <span className="cc-row">
            {pageNum > 1 && (
              <a href={pageHref(pageNum - 1)} className="cc-btn">
                ← Newer
              </a>
            )}
            {pageNum < lastPage && (
              <a href={pageHref(pageNum + 1)} className="cc-btn">
                Older →
              </a>
            )}
          </span>
        </div>
      )}
    </>
  );
}
