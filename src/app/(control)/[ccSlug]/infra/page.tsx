/**
 * Infrastructure dashboard — service inventory + env-var presence + recent
 * webhook activity. Real spend dashboards (Vercel / R2 egress / Gemini
 * tokens) need provider API integrations and ship in a follow-up.
 *
 * Schema gotcha: webhook_events uses `source` (not `provider`) and
 * `received_at` (not `created_at`). See migration 00030.
 */

import { ensureCCAuth, PageHeader } from "../_components/page-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/cc/audit";
import { getCurrentSession } from "@/lib/cc/session";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ ccSlug: string }>;
}

interface RecentWebhook {
  id: string;
  source: string;
  event_type: string;
  received_at: string;
  processed_at: string | null;
  processing_error: string | null;
  retry_count: number;
}

interface ServiceStatus {
  name: string;
  envCheck: () => boolean;
  envHints: string[];
  lastActivity?: string | null;
}

const SERVICES: ServiceStatus[] = [
  {
    name: "Supabase (DB)",
    envCheck: () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    envHints: ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
  },
  {
    name: "Cloudflare R2",
    envCheck: () =>
      Boolean(process.env.R2_ACCOUNT_ID) &&
      Boolean(process.env.R2_ACCESS_KEY_ID) &&
      Boolean(process.env.R2_SECRET_ACCESS_KEY),
    envHints: ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"],
  },
  {
    name: "Razorpay",
    envCheck: () => Boolean(process.env.RAZORPAY_KEY_ID) && Boolean(process.env.RAZORPAY_KEY_SECRET),
    envHints: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"],
  },
  {
    name: "Gemini AI",
    envCheck: () => Boolean(process.env.GEMINI_API_KEY) || Boolean(process.env.GOOGLE_AI_API_KEY),
    envHints: ["GEMINI_API_KEY", "GOOGLE_AI_API_KEY"],
  },
  {
    name: "OpenRouter",
    envCheck: () => Boolean(process.env.OPENROUTER_API_KEY),
    envHints: ["OPENROUTER_API_KEY"],
  },
  {
    name: "Resend (email)",
    envCheck: () => Boolean(process.env.RESEND_API_KEY),
    envHints: ["RESEND_API_KEY", "EMAIL_FROM"],
  },
  {
    name: "Sentry",
    envCheck: () => Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
    envHints: ["NEXT_PUBLIC_SENTRY_DSN", "SENTRY_AUTH_TOKEN"],
  },
  {
    name: "PostHog",
    envCheck: () => Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY),
    envHints: ["NEXT_PUBLIC_POSTHOG_KEY", "NEXT_PUBLIC_POSTHOG_HOST"],
  },
  {
    name: "Upstash Redis",
    envCheck: () =>
      Boolean(process.env.UPSTASH_REDIS_REST_URL) && Boolean(process.env.UPSTASH_REDIS_REST_TOKEN),
    envHints: ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
  },
];

interface InfraSnapshot {
  db_ms: number | null;
  db_ok: boolean;
  generations_count: number;
  active_sessions_count: number;
  collab_sessions_count: number;
  licenses_count: number;
  users_count: number;
  service_last_activity: Map<string, string | null>;
  recent_webhooks: RecentWebhook[];
}

async function loadInfra(): Promise<InfraSnapshot> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // DB ping (also doubles as the count for users).
  const dbStart = Date.now();
  let dbOk = true;
  let usersCount = 0;
  try {
    const { count, error } = await admin.from("users").select("id", { count: "exact", head: true });
    if (error) dbOk = false;
    usersCount = count ?? 0;
  } catch {
    dbOk = false;
  }
  const dbMs = Date.now() - dbStart;

  // Other counts + last-activity probes — all parallel, all tolerant of failure.
  const [
    generationsCount,
    collabSessionsCount,
    licensesCount,
    activeSessionsCount,
    lastRzpWebhook,
    lastCfWebhook,
    lastReplicateWebhook,
    lastGeneration,
    lastEmailLicense,
    recentWebhooks,
  ] = await Promise.all([
    admin
      .from("generations")
      .select("id", { count: "exact", head: true })
      .then((r: { count: number | null }) => r.count ?? 0)
      .catch(() => 0),
    admin
      .from("collab_sessions")
      .select("id", { count: "exact", head: true })
      .then((r: { count: number | null }) => r.count ?? 0)
      .catch(() => 0),
    admin
      .from("licenses")
      .select("id", { count: "exact", head: true })
      .then((r: { count: number | null }) => r.count ?? 0)
      .catch(() => 0),
    // "Active" CC owner sessions — the closest proxy for active logins we have.
    admin
      .from("owner_sessions")
      .select("id", { count: "exact", head: true })
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .then((r: { count: number | null }) => r.count ?? 0)
      .catch(() => 0),

    // webhook_events uses `source` + `received_at`. Sources: 'cashfree','inngest','other','razorpay','replicate'.
    admin
      .from("webhook_events")
      .select("received_at")
      .eq("source", "razorpay")
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then((r: { data: { received_at: string } | null }) => r.data?.received_at ?? null)
      .catch(() => null),
    admin
      .from("webhook_events")
      .select("received_at")
      .eq("source", "cashfree")
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then((r: { data: { received_at: string } | null }) => r.data?.received_at ?? null)
      .catch(() => null),
    admin
      .from("webhook_events")
      .select("received_at")
      .eq("source", "replicate")
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then((r: { data: { received_at: string } | null }) => r.data?.received_at ?? null)
      .catch(() => null),

    // Last successful Gemini generation = pipeline heartbeat.
    admin
      .from("generations")
      .select("created_at")
      .not("image_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then((r: { data: { created_at: string } | null }) => r.data?.created_at ?? null)
      .catch(() => null),
    // Resend has no native ping — last issued license is the closest proxy
    // (we email both sides on issuance).
    admin
      .from("licenses")
      .select("issued_at")
      .order("issued_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then((r: { data: { issued_at: string } | null }) => r.data?.issued_at ?? null)
      .catch(() => null),

    // 30 most recent webhook events.
    admin
      .from("webhook_events")
      .select("id, source, event_type, received_at, processed_at, processing_error, retry_count")
      .order("received_at", { ascending: false })
      .limit(30)
      .then((r: { data: RecentWebhook[] | null }) => r.data ?? [])
      .catch(() => [] as RecentWebhook[]),
  ]);

  const lastActivity = new Map<string, string | null>();
  // Latest webhook across razorpay + cashfree counts as Razorpay row activity.
  const rzpOrCf =
    [lastRzpWebhook as string | null, lastCfWebhook as string | null]
      .filter((x): x is string => Boolean(x))
      .sort((a, b) => b.localeCompare(a))[0] ?? null;
  lastActivity.set("Supabase (DB)", new Date().toISOString());
  lastActivity.set("Razorpay", rzpOrCf);
  lastActivity.set("Gemini AI", lastGeneration as string | null);
  lastActivity.set("Resend (email)", lastEmailLicense as string | null);
  lastActivity.set("Cloudflare R2", lastGeneration as string | null);
  lastActivity.set("OpenRouter", lastGeneration as string | null);
  // Sentry / PostHog / Upstash have no in-DB heartbeat — we leave them null.
  lastActivity.set("Sentry", null);
  lastActivity.set("PostHog", null);
  lastActivity.set("Upstash Redis", null);
  // Override Replicate hint into Gemini bucket if it's newer.
  if (lastReplicateWebhook && (!lastGeneration || (lastReplicateWebhook as string) > (lastGeneration as string))) {
    lastActivity.set("Gemini AI", lastReplicateWebhook as string);
  }

  return {
    db_ms: dbMs,
    db_ok: dbOk,
    generations_count: generationsCount as number,
    active_sessions_count: activeSessionsCount as number,
    collab_sessions_count: collabSessionsCount as number,
    licenses_count: licensesCount as number,
    users_count: usersCount,
    service_last_activity: lastActivity,
    recent_webhooks: recentWebhooks as RecentWebhook[],
  };
}

function relativeFrom(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export default async function InfraPage({ params }: Props) {
  const { ccSlug } = await params;
  await ensureCCAuth(ccSlug);

  const session = await getCurrentSession();
  void logAudit({ action: "infra.view", sessionId: session?.id ?? null });

  const snap = await loadInfra();
  const totalRows =
    snap.generations_count + snap.collab_sessions_count + snap.licenses_count + snap.users_count;

  return (
    <>
      <PageHeader
        title="Infrastructure"
        subtitle="Service health · env presence · recent webhooks"
      />

      <div className="cc-stack">
        {/* KPIS */}
        <div className="cc-grid cc-grid-4">
          <Kpi
            label="DB latency"
            value={snap.db_ms == null ? "—" : `${snap.db_ms}ms`}
            sub="Supabase ping"
            tone={snap.db_ok ? (snap.db_ms != null && snap.db_ms < 200 ? "ok" : "warn") : "bad"}
          />
          <Kpi
            label="Generations stored"
            value={snap.generations_count.toLocaleString("en-IN")}
            sub="lifetime"
          />
          <Kpi
            label="Active CC sessions"
            value={snap.active_sessions_count.toLocaleString("en-IN")}
            sub="owner logins"
          />
          <Kpi label="Total storage rows" value={totalRows.toLocaleString("en-IN")} sub="users + gens + sessions + licenses" />
        </div>

        {/* SERVICE STATUS */}
        <div className="cc-card" style={{ padding: 0 }}>
          <p className="cc-card-title" style={{ padding: "16px 16px 0 16px" }}>
            Service status
          </p>
          <table className="cc-table">
            <thead>
              <tr>
                <th>Service</th>
                <th style={{ width: 110 }}>Configured</th>
                <th style={{ width: 130 }}>Last activity</th>
                <th style={{ width: 110 }}>Status</th>
                <th>Env keys</th>
              </tr>
            </thead>
            <tbody>
              {SERVICES.map((svc) => {
                const ok = svc.envCheck();
                const last = snap.service_last_activity.get(svc.name) ?? null;
                let tone: "ok" | "warn" | "bad" = ok ? "ok" : "bad";
                // Razorpay specifically — show warn when configured but no webhooks
                // landed in the last 24h. Same for Gemini.
                if (ok && (svc.name === "Razorpay" || svc.name === "Gemini AI")) {
                  if (!last || Date.now() - new Date(last).getTime() > 24 * 60 * 60 * 1000) {
                    tone = "warn";
                  }
                }
                const statusLabel = ok ? (tone === "warn" ? "stale" : "live") : "missing";
                return (
                  <tr key={svc.name}>
                    <td>{svc.name}</td>
                    <td>
                      <span className={`cc-pill ${ok ? "cc-pill-ok" : "cc-pill-bad"}`}>
                        {ok ? "yes" : "no"}
                      </span>
                    </td>
                    <td className="cc-mono-cell" style={{ color: "var(--cc-fg-muted)", fontSize: 11.5 }}>
                      {relativeFrom(last)}
                    </td>
                    <td>
                      <span
                        className={`cc-pill ${
                          tone === "ok" ? "cc-pill-ok" : tone === "warn" ? "cc-pill-warn" : "cc-pill-bad"
                        }`}
                      >
                        {statusLabel}
                      </span>
                    </td>
                    <td className="cc-mono-cell" style={{ fontSize: 11, color: "var(--cc-fg-muted)" }}>
                      {svc.envHints.join(", ")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* RECENT WEBHOOKS */}
        <div className="cc-card" style={{ padding: 0 }}>
          <p className="cc-card-title" style={{ padding: "16px 16px 0 16px" }}>
            Recent webhook events
          </p>
          <table className="cc-table">
            <thead>
              <tr>
                <th style={{ width: 100 }}>Source</th>
                <th>Event</th>
                <th style={{ width: 90 }}>Status</th>
                <th style={{ width: 70 }}>Retries</th>
                <th style={{ width: 130 }}>Received</th>
              </tr>
            </thead>
            <tbody>
              {snap.recent_webhooks.length === 0 ? (
                <tr>
                  <td colSpan={5} className="cc-table-empty">
                    No webhook events recorded yet.
                  </td>
                </tr>
              ) : (
                snap.recent_webhooks.map((w) => {
                  const isErr = Boolean(w.processing_error);
                  const isProcessed = Boolean(w.processed_at);
                  const tone: "ok" | "warn" | "bad" | "info" = isErr ? "bad" : isProcessed ? "ok" : "warn";
                  const label = isErr ? "error" : isProcessed ? "processed" : "queued";
                  return (
                    <tr key={w.id}>
                      <td>
                        <span className="cc-pill cc-pill-info">{w.source}</span>
                      </td>
                      <td className="cc-mono-cell" style={{ fontSize: 12 }}>
                        {w.event_type}
                        {w.processing_error && (
                          <div style={{ color: "var(--cc-bad)", fontSize: 11, marginTop: 2 }}>
                            {w.processing_error.slice(0, 80)}
                          </div>
                        )}
                      </td>
                      <td>
                        <span
                          className={`cc-pill ${
                            tone === "ok"
                              ? "cc-pill-ok"
                              : tone === "warn"
                                ? "cc-pill-warn"
                                : "cc-pill-bad"
                          }`}
                        >
                          {label}
                        </span>
                      </td>
                      <td className="cc-mono-cell" style={{ color: "var(--cc-fg-muted)" }}>
                        {w.retry_count}
                      </td>
                      <td className="cc-mono-cell" style={{ color: "var(--cc-fg-muted)", fontSize: 11.5 }}>
                        {relativeFrom(w.received_at)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="cc-card">
          <p className="cc-mono-cell" style={{ fontSize: 11, color: "var(--cc-fg-muted)", margin: 0 }}>
            Per-service spend dashboards (Vercel · R2 egress · Gemini tokens · OpenRouter · Resend) ship
            next iteration — they need API integrations with each provider.
          </p>
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
