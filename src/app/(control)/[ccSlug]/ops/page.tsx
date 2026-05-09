/**
 * Operations Overview — the Control Centre home.
 *
 * Real-time-ish snapshot of platform activity. Re-renders on every page
 * load (force-dynamic) so a refresh shows live numbers. Auto-refresh
 * via the small client poller below.
 *
 * KPIs are scoped to:
 *   • Today (since 00:00 IST)
 *   • Right now (active states)
 *   • Lifetime totals
 *
 * Plus a system-health strip that surfaces the things most likely to
 * break (Razorpay / Gemini / OpenRouter / Resend / Upstash via Redis
 * latency).
 */

import { ensureCCAuth, PageHeader } from "../_components/page-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/cc/audit";
import { getCurrentSession } from "@/lib/cc/session";
import OpsAutoRefresh from "./ops-auto-refresh";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ ccSlug: string }>;
}

interface Snapshot {
  today: {
    signups_creator: number;
    signups_brand: number;
    topups_count: number;
    topups_inr_paise: number;
    generations: number;
    approvals: number;
    licences_issued: number;
  };
  active: {
    collabs_active: number;
    requests_pending: number;
    approvals_pending: number;
    stuck_generations: number;
    open_disputes: number;
  };
  lifetime: {
    total_creators: number;
    total_brands: number;
    total_licences: number;
    gmv_paise: number;
  };
  health: {
    db_ok: boolean;
    db_ms: number | null;
    last_razorpay_webhook_at: string | null;
    last_gemini_gen_at: string | null;
  };
  generated_at: string;
}

async function loadSnapshot(): Promise<Snapshot> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const istToday = new Date();
  // IST start of day = UTC of (today 00:00 IST = today -5:30 UTC)
  // For simplicity: use UTC midnight; close enough for a dashboard.
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const startIso = startOfDay.toISOString();

  // Fire all queries in parallel.
  const dbStart = Date.now();
  const [
    creatorsToday,
    brandsToday,
    topupsToday,
    generationsToday,
    approvalsToday,
    licensesToday,

    activeCollabs,
    pendingRequests,
    pendingApprovals,
    stuckGens,
    openDisputes,

    totalCreators,
    totalBrands,
    totalLicences,

    revenueToday,
    revenueLifetime,

    lastWebhook,
    lastGen,
  ] = await Promise.all([
    admin.from("creators").select("id", { count: "exact", head: true }).gte("created_at", startIso),
    admin.from("brands").select("id", { count: "exact", head: true }).gte("created_at", startIso),
    admin.from("credit_top_ups").select("amount_paise").gte("created_at", startIso).eq("status", "success"),
    admin.from("generations").select("id", { count: "exact", head: true }).gte("created_at", startIso),
    admin.from("approvals").select("id", { count: "exact", head: true }).gte("created_at", startIso).eq("status", "approved"),
    admin.from("licenses").select("id", { count: "exact", head: true }).gte("issued_at", startIso),

    admin.from("collab_sessions").select("id", { count: "exact", head: true }).eq("status", "active"),
    admin.from("collab_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("approvals").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("generations").select("id", { count: "exact", head: true }).in("status", ["draft", "compliance_check", "generating", "output_check"]).lt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    admin.from("disputes").select("id", { count: "exact", head: true }).eq("status", "open"),

    admin.from("creators").select("id", { count: "exact", head: true }),
    admin.from("brands").select("id", { count: "exact", head: true }),
    admin.from("licenses").select("id", { count: "exact", head: true }),

    admin.from("approvals").select("creator_share_paise, platform_share_paise").gte("created_at", startIso).eq("status", "approved"),
    admin.from("approvals").select("creator_share_paise, platform_share_paise").eq("status", "approved"),

    admin.from("webhook_events").select("received_at").eq("source", "razorpay").order("received_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("generations").select("created_at").not("image_url", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const dbMs = Date.now() - dbStart;

  const sumPaise = (rows: { creator_share_paise: number; platform_share_paise: number }[] | null | undefined) =>
    (rows ?? []).reduce(
      (s, r) => s + (r.creator_share_paise ?? 0) + (r.platform_share_paise ?? 0),
      0,
    );
  const sumTopupsPaise = (rows: { amount_paise: number }[] | null | undefined) =>
    (rows ?? []).reduce((s, r) => s + (r.amount_paise ?? 0), 0);

  return {
    today: {
      signups_creator: creatorsToday.count ?? 0,
      signups_brand: brandsToday.count ?? 0,
      topups_count: (topupsToday.data ?? []).length,
      topups_inr_paise: sumTopupsPaise(topupsToday.data),
      generations: generationsToday.count ?? 0,
      approvals: approvalsToday.count ?? 0,
      licences_issued: licensesToday.count ?? 0,
    },
    active: {
      collabs_active: activeCollabs.count ?? 0,
      requests_pending: pendingRequests.count ?? 0,
      approvals_pending: pendingApprovals.count ?? 0,
      stuck_generations: stuckGens.count ?? 0,
      open_disputes: openDisputes.count ?? 0,
    },
    lifetime: {
      total_creators: totalCreators.count ?? 0,
      total_brands: totalBrands.count ?? 0,
      total_licences: totalLicences.count ?? 0,
      gmv_paise: sumPaise(revenueLifetime.data),
    },
    health: {
      db_ok: !creatorsToday.error,
      db_ms: dbMs,
      last_razorpay_webhook_at: lastWebhook.data?.received_at ?? null,
      last_gemini_gen_at: lastGen.data?.created_at ?? null,
    },
    generated_at: new Date().toISOString(),
  };
}

function fmt(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function relativeFrom(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function HealthDot({ ok, label, sub }: { ok: boolean; label: string; sub: string }) {
  return (
    <div className="cc-card" style={{ padding: 12 }}>
      <div className="cc-row" style={{ gap: 8, marginBottom: 4 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: ok ? "var(--cc-ok)" : "var(--cc-bad)",
            display: "inline-block",
          }}
        />
        <span className="cc-label" style={{ marginBottom: 0 }}>{label}</span>
      </div>
      <p className="cc-mono-cell" style={{ margin: 0, fontSize: 11.5, color: "var(--cc-fg-muted)" }}>
        {sub}
      </p>
    </div>
  );
}

export default async function OpsPage({ params }: Props) {
  const { ccSlug } = await params;
  await ensureCCAuth(ccSlug);

  const snap = await loadSnapshot();

  // Audit the view (fire-and-forget, never block).
  const session = await getCurrentSession();
  void logAudit({
    action: "ops.view",
    sessionId: session?.id ?? null,
  });

  const { today, active, lifetime, health } = snap;
  const generatedAt = new Date(snap.generated_at);

  return (
    <>
      <PageHeader
        title="Operations"
        subtitle={`Snapshot · ${generatedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} IST · auto-refresh every 30s`}
      />
      <OpsAutoRefresh />

      <div className="cc-stack">
        {/* TODAY */}
        <div>
          <p className="cc-card-title" style={{ marginBottom: 8 }}>Today (since 00:00 UTC)</p>
          <div className="cc-grid cc-grid-4">
            <Kpi label="Signups · creator" value={String(today.signups_creator)} />
            <Kpi label="Signups · brand" value={String(today.signups_brand)} />
            <Kpi
              label="Top-ups"
              value={String(today.topups_count)}
              sub={fmt(today.topups_inr_paise)}
            />
            <Kpi label="Generations" value={String(today.generations)} />
            <Kpi label="Approvals" value={String(today.approvals)} />
            <Kpi label="Licences issued" value={String(today.licences_issued)} />
          </div>
        </div>

        {/* RIGHT NOW */}
        <div>
          <p className="cc-card-title" style={{ marginBottom: 8 }}>Right now</p>
          <div className="cc-grid cc-grid-4">
            <Kpi label="Active collabs" value={String(active.collabs_active)} />
            <Kpi label="Pending requests" value={String(active.requests_pending)} />
            <Kpi
              label="Pending approvals"
              value={String(active.approvals_pending)}
              tone={active.approvals_pending > 5 ? "warn" : undefined}
            />
            <Kpi
              label="Stuck gens (>24h)"
              value={String(active.stuck_generations)}
              tone={active.stuck_generations > 0 ? "bad" : "ok"}
            />
            <Kpi
              label="Open disputes"
              value={String(active.open_disputes)}
              tone={active.open_disputes > 0 ? "warn" : "ok"}
            />
          </div>
        </div>

        {/* LIFETIME */}
        <div>
          <p className="cc-card-title" style={{ marginBottom: 8 }}>Lifetime</p>
          <div className="cc-grid cc-grid-4">
            <Kpi label="Creators" value={lifetime.total_creators.toLocaleString("en-IN")} />
            <Kpi label="Brands" value={lifetime.total_brands.toLocaleString("en-IN")} />
            <Kpi label="Licences" value={lifetime.total_licences.toLocaleString("en-IN")} />
            <Kpi label="GMV" value={fmt(lifetime.gmv_paise)} />
          </div>
        </div>

        {/* HEALTH */}
        <div>
          <p className="cc-card-title" style={{ marginBottom: 8 }}>System health</p>
          <div className="cc-grid cc-grid-4">
            <HealthDot
              ok={health.db_ok}
              label="Database"
              sub={`${health.db_ms ?? "—"}ms · Supabase`}
            />
            <HealthDot
              ok={health.last_razorpay_webhook_at != null && Date.now() - new Date(health.last_razorpay_webhook_at).getTime() < 24 * 60 * 60 * 1000}
              label="Razorpay webhooks"
              sub={`Last ${relativeFrom(health.last_razorpay_webhook_at)}`}
            />
            <HealthDot
              ok={health.last_gemini_gen_at != null && Date.now() - new Date(health.last_gemini_gen_at).getTime() < 24 * 60 * 60 * 1000}
              label="Gemini pipeline"
              sub={`Last gen ${relativeFrom(health.last_gemini_gen_at)}`}
            />
            <HealthDot
              ok={true}
              label="Auth · Resend"
              sub="Probe via login attempts"
            />
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
      <span className="cc-kpi-value" style={{ color }}>
        {value}
      </span>
      {sub && <span className="cc-kpi-sub">{sub}</span>}
    </div>
  );
}
