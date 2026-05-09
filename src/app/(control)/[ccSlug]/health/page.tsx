/**
 * Marketplace health — funnel + lifetime leaderboards.
 *
 * Read-only owner view. Real queries:
 *   • Top 10 creators by lifetime earnings (sum creator_share_paise on licenses).
 *   • Top 10 brands by lifetime spend (sum amount_paid_paise on licenses).
 *   • 30-day funnel: signups → first-request → first-payment → first-approval.
 *   • 30-day approval rate (approved / approved+rejected from approvals).
 *
 * Avg time to first approval is intentionally skipped — needs a join across
 * users → approvals that's hard to express cheaply through PostgREST. KPI
 * shows an em-dash and a note in the subtitle.
 */

import { ensureCCAuth, PageHeader } from "../_components/page-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/cc/audit";
import { getCurrentSession } from "@/lib/cc/session";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ ccSlug: string }>;
}

interface CreatorRow {
  creator_id: string;
  earnings_paise: number;
  display_name: string | null;
  instagram_handle: string | null;
}

interface BrandRow {
  brand_id: string;
  spend_paise: number;
  company_name: string | null;
}

interface Funnel {
  signups: number;
  first_request: number;
  first_payment: number;
  first_approval: number;
}

interface HealthSnapshot {
  total_creators: number;
  total_brands: number;
  approval_rate_30d: number | null;
  approvals_30d_total: number;
  funnel_30d: Funnel;
  top_creators: CreatorRow[];
  top_brands: BrandRow[];
}

function fmt(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function pct(part: number, whole: number): string {
  if (whole <= 0) return "0%";
  return `${Math.round((part / whole) * 1000) / 10}%`;
}

async function loadHealth(): Promise<HealthSnapshot> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Pull data in one parallel salvo; all queries swallow errors locally so a
  // single broken query doesn't crash the whole page.
  const queries = await Promise.all([
    // Lifetime totals
    admin
      .from("creators")
      .select("id", { count: "exact", head: true })
      .then((r: { count: number | null }) => r.count ?? 0)
      .catch(() => 0),
    admin
      .from("brands")
      .select("id", { count: "exact", head: true })
      .then((r: { count: number | null }) => r.count ?? 0)
      .catch(() => 0),

    // Approval rate (30d)
    admin
      .from("approvals")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since30)
      .eq("status", "approved")
      .then((r: { count: number | null }) => r.count ?? 0)
      .catch(() => 0),
    admin
      .from("approvals")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since30)
      .eq("status", "rejected")
      .then((r: { count: number | null }) => r.count ?? 0)
      .catch(() => 0),

    // Funnel — total signups (combined creator + brand) in 30d
    admin
      .from("users")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since30)
      .then((r: { count: number | null }) => r.count ?? 0)
      .catch(() => 0),
    admin
      .from("collab_requests")
      .select("brand_id", { count: "exact", head: true })
      .gte("created_at", since30)
      .then((r: { count: number | null }) => r.count ?? 0)
      .catch(() => 0),
    admin
      .from("collab_requests")
      .select("brand_id", { count: "exact", head: true })
      .gte("created_at", since30)
      .in("status", ["paid"])
      .then((r: { count: number | null }) => r.count ?? 0)
      .catch(() => 0),
    admin
      .from("approvals")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since30)
      .eq("status", "approved")
      .then((r: { count: number | null }) => r.count ?? 0)
      .catch(() => 0),

    // Top creators by lifetime earnings
    admin
      .from("licenses")
      .select("creator_id, creator_share_paise")
      .then((r: { data: { creator_id: string; creator_share_paise: number }[] | null }) => r.data ?? [])
      .catch(() => [] as { creator_id: string; creator_share_paise: number }[]),

    // Top brands by lifetime spend
    admin
      .from("licenses")
      .select("brand_id, amount_paid_paise")
      .then((r: { data: { brand_id: string; amount_paid_paise: number }[] | null }) => r.data ?? [])
      .catch(() => [] as { brand_id: string; amount_paid_paise: number }[]),
  ]);

  const [
    totalCreators,
    totalBrands,
    approvedCount,
    rejectedCount,
    signups30,
    firstRequest30,
    firstPayment30,
    firstApproval30,
    licenseCreatorRows,
    licenseBrandRows,
  ] = queries;

  // Aggregate top creators / brands in JS (sub-1k-row leaderboards).
  const creatorMap = new Map<string, number>();
  for (const row of licenseCreatorRows as { creator_id: string; creator_share_paise: number }[]) {
    creatorMap.set(row.creator_id, (creatorMap.get(row.creator_id) ?? 0) + (row.creator_share_paise ?? 0));
  }
  const brandMap = new Map<string, number>();
  for (const row of licenseBrandRows as { brand_id: string; amount_paid_paise: number }[]) {
    brandMap.set(row.brand_id, (brandMap.get(row.brand_id) ?? 0) + (row.amount_paid_paise ?? 0));
  }
  const creatorTop = Array.from(creatorMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const brandTop = Array.from(brandMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Resolve creator + brand names in parallel.
  const [creatorMeta, brandMeta] = await Promise.all([
    creatorTop.length > 0
      ? admin
          .from("creators")
          .select("id, instagram_handle, user_id, users(display_name)")
          .in("id", creatorTop.map(([id]) => id))
          .then(
            (
              r: {
                data:
                  | { id: string; instagram_handle: string | null; users: { display_name: string | null } | null }[]
                  | null;
              },
            ) => r.data ?? [],
          )
          .catch(() => [])
      : Promise.resolve([]),
    brandTop.length > 0
      ? admin
          .from("brands")
          .select("id, company_name")
          .in("id", brandTop.map(([id]) => id))
          .then((r: { data: { id: string; company_name: string | null }[] | null }) => r.data ?? [])
          .catch(() => [])
      : Promise.resolve([]),
  ]);

  const creatorMetaMap = new Map<string, { display_name: string | null; instagram_handle: string | null }>();
  for (const c of creatorMeta as {
    id: string;
    instagram_handle: string | null;
    users: { display_name: string | null } | null;
  }[]) {
    creatorMetaMap.set(c.id, {
      display_name: c.users?.display_name ?? null,
      instagram_handle: c.instagram_handle ?? null,
    });
  }
  const brandMetaMap = new Map<string, { company_name: string | null }>();
  for (const b of brandMeta as { id: string; company_name: string | null }[]) {
    brandMetaMap.set(b.id, { company_name: b.company_name ?? null });
  }

  const top_creators: CreatorRow[] = creatorTop.map(([id, paise]) => {
    const meta = creatorMetaMap.get(id);
    return {
      creator_id: id,
      earnings_paise: paise,
      display_name: meta?.display_name ?? null,
      instagram_handle: meta?.instagram_handle ?? null,
    };
  });
  const top_brands: BrandRow[] = brandTop.map(([id, paise]) => {
    const meta = brandMetaMap.get(id);
    return {
      brand_id: id,
      spend_paise: paise,
      company_name: meta?.company_name ?? null,
    };
  });

  const totalDecided = (approvedCount as number) + (rejectedCount as number);
  const approval_rate_30d = totalDecided > 0 ? (approvedCount as number) / totalDecided : null;

  return {
    total_creators: totalCreators as number,
    total_brands: totalBrands as number,
    approval_rate_30d,
    approvals_30d_total: totalDecided,
    funnel_30d: {
      signups: signups30 as number,
      first_request: firstRequest30 as number,
      first_payment: firstPayment30 as number,
      first_approval: firstApproval30 as number,
    },
    top_creators,
    top_brands,
  };
}

export default async function HealthPage({ params }: Props) {
  const { ccSlug } = await params;
  await ensureCCAuth(ccSlug);

  const session = await getCurrentSession();
  void logAudit({ action: "health.view", sessionId: session?.id ?? null });

  const snap = await loadHealth();
  const { total_creators, total_brands, approval_rate_30d, approvals_30d_total, funnel_30d, top_creators, top_brands } =
    snap;

  return (
    <>
      <PageHeader
        title="Marketplace health"
        subtitle="Funnel · cohorts · top movers · last 30 days"
      />

      <div className="cc-stack">
        {/* TOP-LEVEL KPIS */}
        <div className="cc-grid cc-grid-4">
          <Kpi label="Total creators" value={total_creators.toLocaleString("en-IN")} />
          <Kpi label="Total brands" value={total_brands.toLocaleString("en-IN")} />
          <Kpi
            label="Approval rate · 30d"
            value={approval_rate_30d == null ? "—" : `${Math.round(approval_rate_30d * 100)}%`}
            sub={approvals_30d_total > 0 ? `${approvals_30d_total} decided` : "no decisions yet"}
            tone={
              approval_rate_30d == null
                ? undefined
                : approval_rate_30d >= 0.7
                  ? "ok"
                  : approval_rate_30d >= 0.5
                    ? "warn"
                    : "bad"
            }
          />
          <Kpi label="Avg signup → 1st approval" value="—" sub="needs cohort join" />
        </div>

        {/* FUNNEL */}
        <div className="cc-card">
          <p className="cc-card-title">Funnel · last 30 days</p>
          <FunnelRow label="Signups (creator + brand)" count={funnel_30d.signups} base={funnel_30d.signups} />
          <FunnelRow label="First collab request" count={funnel_30d.first_request} base={funnel_30d.signups} />
          <FunnelRow label="First payment" count={funnel_30d.first_payment} base={funnel_30d.first_request} />
          <FunnelRow label="First approval" count={funnel_30d.first_approval} base={funnel_30d.first_payment} />
          <p className="cc-mono-cell" style={{ marginTop: 12, fontSize: 11, color: "var(--cc-fg-dim)" }}>
            Drop-off shown relative to the previous step. Counts are events not unique users — same brand
            sending two requests in 30d shows up twice.
          </p>
        </div>

        {/* LEADERBOARDS */}
        <div className="cc-grid cc-grid-2">
          {/* Top creators */}
          <div className="cc-card" style={{ padding: 0 }}>
            <p className="cc-card-title" style={{ padding: "16px 16px 0 16px" }}>
              Top creators · lifetime earnings
            </p>
            <table className="cc-table">
              <thead>
                <tr>
                  <th style={{ width: 32 }}>#</th>
                  <th>Creator</th>
                  <th style={{ textAlign: "right" }}>Earnings</th>
                </tr>
              </thead>
              <tbody>
                {top_creators.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="cc-table-empty">
                      No licensed earnings yet.
                    </td>
                  </tr>
                ) : (
                  top_creators.map((c, i) => (
                    <tr key={c.creator_id}>
                      <td className="cc-mono-cell" style={{ color: "var(--cc-fg-muted)" }}>
                        {i + 1}
                      </td>
                      <td>
                        <div>{c.display_name ?? <span className="cc-dim">unnamed</span>}</div>
                        {c.instagram_handle && (
                          <div className="cc-mono-cell" style={{ fontSize: 11, color: "var(--cc-fg-muted)" }}>
                            @{c.instagram_handle}
                          </div>
                        )}
                      </td>
                      <td className="cc-mono-cell" style={{ textAlign: "right" }}>
                        {fmt(c.earnings_paise)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Top brands */}
          <div className="cc-card" style={{ padding: 0 }}>
            <p className="cc-card-title" style={{ padding: "16px 16px 0 16px" }}>
              Top brands · lifetime spend
            </p>
            <table className="cc-table">
              <thead>
                <tr>
                  <th style={{ width: 32 }}>#</th>
                  <th>Brand</th>
                  <th style={{ textAlign: "right" }}>Spend</th>
                </tr>
              </thead>
              <tbody>
                {top_brands.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="cc-table-empty">
                      No paid licenses yet.
                    </td>
                  </tr>
                ) : (
                  top_brands.map((b, i) => (
                    <tr key={b.brand_id}>
                      <td className="cc-mono-cell" style={{ color: "var(--cc-fg-muted)" }}>
                        {i + 1}
                      </td>
                      <td>{b.company_name ?? <span className="cc-dim">unnamed</span>}</td>
                      <td className="cc-mono-cell" style={{ textAlign: "right" }}>
                        {fmt(b.spend_paise)}
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

function FunnelRow({ label, count, base }: { label: string; count: number; base: number }) {
  const ratio = base > 0 ? count / base : 0;
  const widthPct = base > 0 ? Math.max(0, Math.min(100, ratio * 100)) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="cc-row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12.5 }}>{label}</span>
        <span className="cc-mono-cell" style={{ fontSize: 12, color: "var(--cc-fg-muted)" }}>
          {count.toLocaleString("en-IN")} <span style={{ color: "var(--cc-fg-dim)" }}>· {pct(count, base)}</span>
        </span>
      </div>
      <div
        style={{
          height: 6,
          background: "var(--cc-bg-3)",
          borderRadius: 2,
          overflow: "hidden",
          border: "1px solid var(--cc-border)",
        }}
      >
        <div
          style={{
            width: `${widthPct}%`,
            height: "100%",
            background: "var(--cc-accent)",
          }}
        />
      </div>
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
      <span className="cc-kpi-value" style={{ color }}>
        {value}
      </span>
      {sub && <span className="cc-kpi-sub">{sub}</span>}
    </div>
  );
}
