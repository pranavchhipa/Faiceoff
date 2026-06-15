/**
 * Control Centre Home — the friendly "what's happening + what needs you" view.
 *
 * This is the daily-driver overview for a non-technical owner. It answers two
 * questions at a glance:
 *
 *   1. What happened today?      → big, readable stat cards
 *   2. What needs me right now?  → an action-queue grid + a live activity feed
 *
 * The dense KPI grid + raw health dots that used to live here are gone from the
 * top of the page; the system-health strip is kept but demoted to the bottom as
 * a secondary, technical check.
 *
 * Data:
 *   • loadSnapshot()    — today's numbers + active states + lifetime + health
 *                         (unchanged, reused as-is)
 *   • getPendingCounts() — how many items sit in each operator action-queue
 *   • getActivityFeed()  — merged, human-readable recent events
 *
 * Re-renders on every load (force-dynamic) + the OpsAutoRefresh client poller
 * (every 30s) so numbers stay live.
 */

import Link from "next/link";
import { ensureCCAuth, PageHeader } from "../_components/page-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/cc/audit";
import { getCurrentSession } from "@/lib/cc/session";
import { getPendingCounts, getActivityFeed, type ActivityKind } from "@/lib/cc/overview";
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

export default async function OpsPage({ params }: Props) {
  const { ccSlug } = await params;
  await ensureCCAuth(ccSlug);

  // Load the snapshot + the two new friendly helpers in parallel.
  const [snap, pending, feed] = await Promise.all([
    loadSnapshot(),
    getPendingCounts(),
    getActivityFeed(20),
  ]);

  // Audit the view (fire-and-forget, never block).
  const session = await getCurrentSession();
  void logAudit({
    action: "ops.view",
    sessionId: session?.id ?? null,
  });

  const { today, lifetime, health } = snap;
  const generatedAt = new Date(snap.generated_at);

  const newSignups = today.signups_creator + today.signups_brand;
  const cc = `/${ccSlug}`;

  // Action queues — one card per non-zero queue, in priority order.
  const allQueues: ActionQueue[] = [
    {
      key: "payouts",
      count: pending.payouts,
      label: "Payouts to send",
      hint: "Creators waiting to get paid",
      cta: "Pay",
      href: `${cc}/payouts`,
      tone: "warn",
    },
    {
      key: "disputes",
      count: pending.disputes,
      label: "Disputes to resolve",
      hint: "Brand or creator raised an issue",
      cta: "Resolve",
      href: `${cc}/disputes`,
      tone: "bad",
    },
    {
      key: "brandVerify",
      count: pending.brandVerify,
      label: "Brand verifications",
      hint: "GST / company checks awaiting review",
      cta: "Review",
      href: `${cc}/brand-verifications`,
      tone: "accent",
    },
    {
      key: "creatorVerify",
      count: pending.creatorVerify,
      label: "Creator verifications",
      hint: "Identity checks awaiting review",
      cta: "Review",
      href: `${cc}/verifications`,
      tone: "accent",
    },
    {
      key: "tickets",
      count: pending.tickets,
      label: "Support tickets",
      hint: "People waiting on a reply",
      cta: "Reply",
      href: `${cc}/tickets`,
      tone: "accent",
    },
    {
      key: "stuckGens",
      count: pending.stuckGens,
      label: "Stuck generations",
      hint: "Images stuck for over 24 hours",
      cta: "Resolve",
      href: `${cc}/moderation`,
      tone: "bad",
    },
  ];
  const queues = allQueues.filter((q) => q.count > 0);

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="What's happening across Faiceoff, and what needs your attention."
      />
      <OpsAutoRefresh />

      <div className="cc-stack" style={{ gap: 28 }}>
        {/* ── TODAY'S NUMBERS ──────────────────────────────────────────── */}
        <section>
          <p className="cc-card-title" style={{ marginBottom: 12 }}>Today so far</p>
          <div className="cc-grid cc-grid-4">
            <BigStat
              label="Money in today"
              value={fmt(today.topups_inr_paise)}
              sub={today.topups_count === 1 ? "1 top-up" : `${today.topups_count} top-ups`}
            />
            <BigStat
              label="New sign-ups"
              value={String(newSignups)}
              sub={`${today.signups_creator} creators · ${today.signups_brand} brands`}
            />
            <BigStat
              label="Images created"
              value={String(today.generations)}
              sub={`${today.approvals} approved today`}
            />
            <BigStat
              label="Needs your action"
              value={String(pending.total)}
              sub={pending.total === 0 ? "Nothing pending" : "Across all queues"}
              tone={pending.total > 0 ? "warn" : "ok"}
            />
          </div>
        </section>

        {/* ── NEEDS YOUR ATTENTION ─────────────────────────────────────── */}
        <section>
          <p className="cc-card-title" style={{ marginBottom: 12 }}>Needs your attention</p>
          {queues.length === 0 ? (
            <div
              className="cc-card"
              style={{
                padding: "28px 20px",
                textAlign: "center",
                borderColor: "var(--cc-ok)",
                background: "rgba(31, 170, 106, 0.06)",
              }}
            >
              <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--cc-ok)" }}>
                All caught up ✓
              </p>
              <p style={{ margin: "6px 0 0 0", fontSize: 13, color: "var(--cc-fg-muted)" }}>
                Nothing is waiting on you right now. Enjoy the calm.
              </p>
            </div>
          ) : (
            <div className="cc-grid cc-grid-3">
              {queues.map((q) => (
                <ActionCard key={q.key} queue={q} />
              ))}
            </div>
          )}
        </section>

        {/* ── LIVE ACTIVITY ────────────────────────────────────────────── */}
        <section>
          <p className="cc-card-title" style={{ marginBottom: 12 }}>Live activity</p>
          <div className="cc-card" style={{ padding: 0, overflow: "hidden" }}>
            {feed.length === 0 ? (
              <p style={{ margin: 0, padding: "28px 20px", textAlign: "center", color: "var(--cc-fg-muted)", fontSize: 13 }}>
                No recent activity yet.
              </p>
            ) : (
              feed.map((item, i) => (
                <Link
                  key={`${item.kind}-${item.ts}-${i}`}
                  href={item.href ?? "#"}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 16px",
                    textDecoration: "none",
                    color: "inherit",
                    borderTop: i === 0 ? "none" : "1px solid var(--cc-border)",
                  }}
                  className="cc-activity-row"
                >
                  <span
                    aria-hidden
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      flexShrink: 0,
                      background: activityColor(item.kind),
                      boxShadow: `0 0 0 4px ${activityColor(item.kind)}1f`,
                    }}
                  />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: "var(--cc-fg)" }}>
                    {item.text}
                  </span>
                  <span style={{ flexShrink: 0, fontSize: 11.5, color: "var(--cc-fg-dim)" }}>
                    {relativeFrom(item.ts)}
                  </span>
                </Link>
              ))
            )}
          </div>
        </section>

        {/* ── SYSTEM HEALTH (secondary, technical) ─────────────────────── */}
        <section style={{ marginTop: 4 }}>
          <p className="cc-card-title" style={{ marginBottom: 10 }}>System health · technical check</p>
          <div className="cc-row" style={{ gap: 12, flexWrap: "wrap" }}>
            <HealthChip
              ok={health.db_ok}
              label="Database"
              sub={`${health.db_ms ?? "—"}ms`}
            />
            <HealthChip
              ok={health.last_razorpay_webhook_at != null && Date.now() - new Date(health.last_razorpay_webhook_at).getTime() < 24 * 60 * 60 * 1000}
              label="Razorpay"
              sub={relativeFrom(health.last_razorpay_webhook_at)}
            />
            <HealthChip
              ok={health.last_gemini_gen_at != null && Date.now() - new Date(health.last_gemini_gen_at).getTime() < 24 * 60 * 60 * 1000}
              label="Image pipeline"
              sub={`last gen ${relativeFrom(health.last_gemini_gen_at)}`}
            />
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--cc-fg-dim)" }}>
              Lifetime GMV {fmt(lifetime.gmv_paise)} · {lifetime.total_creators.toLocaleString("en-IN")} creators · {lifetime.total_brands.toLocaleString("en-IN")} brands · updated {generatedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} IST · auto-refresh 30s
            </span>
          </div>
        </section>
      </div>
    </>
  );
}

/* ── Pieces ──────────────────────────────────────────────────────────── */

interface ActionQueue {
  key: string;
  count: number;
  label: string;
  hint: string;
  cta: string;
  href: string;
  tone: "accent" | "warn" | "bad";
}

function toneColor(tone: "accent" | "warn" | "bad" | "ok"): string {
  switch (tone) {
    case "warn":
      return "var(--cc-warn)";
    case "bad":
      return "var(--cc-bad)";
    case "ok":
      return "var(--cc-ok)";
    default:
      return "var(--cc-accent)";
  }
}

function activityColor(kind: ActivityKind): string {
  switch (kind) {
    case "topup":
    case "payout":
      return "#1faa6a"; // ok / money
    case "dispute":
      return "#d24343"; // bad
    case "brand_verify":
    case "creator_verify":
      return "#c9a96e"; // accent
    case "collab":
      return "#4d8ad6"; // info
    default:
      return "#9aa0a6"; // signups / neutral
  }
}

function BigStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "warn" | "ok";
}) {
  const color = tone ? toneColor(tone) : "var(--cc-fg)";
  return (
    <div className="cc-card" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--cc-fg-muted)" }}>{label}</span>
      <span
        style={{
          fontSize: 34,
          fontWeight: 800,
          lineHeight: 1.05,
          letterSpacing: "-0.02em",
          fontVariantNumeric: "tabular-nums",
          color,
        }}
      >
        {value}
      </span>
      {sub && <span style={{ fontSize: 12, color: "var(--cc-fg-dim)" }}>{sub}</span>}
    </div>
  );
}

function ActionCard({ queue }: { queue: ActionQueue }) {
  const color = toneColor(queue.tone);
  return (
    <Link
      href={queue.href}
      className="cc-action-card"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "16px 18px",
        background: "var(--cc-bg-2)",
        border: "1px solid var(--cc-border)",
        borderLeft: `3px solid ${color}`,
        borderRadius: 4,
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span
          style={{
            fontSize: 30,
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: "-0.02em",
            fontVariantNumeric: "tabular-nums",
            color,
          }}
        >
          {queue.count}
        </span>
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--cc-fg)" }}>{queue.label}</span>
      </div>
      <span style={{ fontSize: 12.5, color: "var(--cc-fg-muted)" }}>{queue.hint}</span>
      <span style={{ marginTop: 4, fontSize: 12.5, fontWeight: 700, color }}>
        {queue.cta} →
      </span>
    </Link>
  );
}

function HealthChip({ ok, label, sub }: { ok: boolean; label: string; sub: string }) {
  return (
    <span
      className="cc-row"
      style={{
        gap: 8,
        padding: "6px 12px",
        border: "1px solid var(--cc-border)",
        borderRadius: 999,
        background: "var(--cc-bg-2)",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          display: "inline-block",
          background: ok ? "var(--cc-ok)" : "var(--cc-bad)",
        }}
      />
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--cc-fg)" }}>{label}</span>
      <span style={{ fontSize: 11, color: "var(--cc-fg-dim)" }}>{sub}</span>
    </span>
  );
}
