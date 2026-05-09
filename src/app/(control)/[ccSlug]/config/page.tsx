/**
 * System configuration — read-only view of feature flags, cron jobs, and
 * sensitive-secret presence. Never displays secret values, only set/unset.
 *
 * Cron list is mirrored from `vercel.json` — kept in sync manually because
 * reading the JSON at request time on serverless is unreliable. If you add a
 * cron to vercel.json, mirror it in CRON_JOBS below.
 *
 * Live toggles + maintenance mode + cron manual-trigger ship next iteration.
 */

import { ensureCCAuth, PageHeader } from "../_components/page-shell";
import { logAudit } from "@/lib/cc/audit";
import { getCurrentSession } from "@/lib/cc/session";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ ccSlug: string }>;
}

// ── Feature flags ─────────────────────────────────────────────────────────
// Boolean flags + string-valued knobs read from process.env. Treat any
// truthy non-empty string as "set"; flags use 'true' / '1' / '0' / 'false'.
interface FlagDef {
  name: string;
  kind: "bool" | "string";
  defaultValue: string;
  description: string;
}

const FEATURE_FLAGS: FlagDef[] = [
  {
    name: "ENABLE_PRODUCT_REFINEMENT",
    kind: "bool",
    defaultValue: "false",
    description: "Stage-2 product refinement pass after Gemini main gen",
  },
  {
    name: "ENABLE_FACE_SIMILARITY",
    kind: "bool",
    defaultValue: "false",
    description: "Reject gens that drift below face-similarity threshold",
  },
  {
    name: "MAINTENANCE_MODE",
    kind: "bool",
    defaultValue: "false",
    description: "Block all non-owner traffic at the edge (not yet implemented)",
  },
  {
    name: "NANO_BANANA_MODEL",
    kind: "string",
    defaultValue: "gemini-3-pro-image-preview",
    description: "Gemini model id used for image generation",
  },
  {
    name: "PROMPT_ASSEMBLER_MODEL",
    kind: "string",
    defaultValue: "meta-llama/llama-3.1-8b-instruct",
    description: "OpenRouter model used to assemble structured briefs into prompts",
  },
  {
    name: "FACE_EMBED_MODEL_VERSION",
    kind: "string",
    defaultValue: "(unset)",
    description: "Replicate ArcFace version pin for face-embedding similarity",
  },
  {
    name: "PLATFORM_COMMISSION",
    kind: "string",
    defaultValue: "0.30",
    description: "Platform's revenue share (0.30 = 30%)",
  },
];

// ── Cron jobs ──────────────────────────────────────────────────────────────
// Mirrored from /vercel.json. Vercel Hobby tier caps cron frequency to once
// per day (CLAUDE.md → Anti-Patterns).
const CRON_JOBS: { name: string; schedule: string; endpoint: string }[] = [
  { name: "auto-approve", schedule: "0 3 * * *", endpoint: "/api/cron/auto-approve" },
  { name: "license-renewals", schedule: "30 18 * * *", endpoint: "/api/cron/license-renewals" },
  { name: "tds-quarterly-reminder", schedule: "30 18 * * *", endpoint: "/api/cron/tds-quarterly-reminder" },
  { name: "poll-replicate", schedule: "0 3 * * *", endpoint: "/api/cron/poll-replicate" },
  { name: "process-rejections", schedule: "30 3 * * *", endpoint: "/api/cron/process-rejections" },
];

// ── Sensitive secrets ──────────────────────────────────────────────────────
// We *only* check presence; never echo the value. If the build has access
// (server-side runtime), `process.env.X` is non-empty when set.
const SENSITIVE_SECRETS: string[] = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_AI_API_KEY",
  "OPENROUTER_API_KEY",
  "HIVE_API_KEY",
  "REPLICATE_API_TOKEN",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "OWNER_TOTP_KEY",
  "OWNER_CONTROL_CENTRE_SLUG",
  "CRON_SECRET",
  "KYC_ENCRYPTION_KEY",
  "UPSTASH_REDIS_REST_TOKEN",
];

// Public env vars (safe to enumerate by name only, count is what we surface).
const PUBLIC_ENV_KEYS: string[] = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_BASE_URL",
  "NEXT_PUBLIC_SENTRY_DSN",
  "NEXT_PUBLIC_POSTHOG_KEY",
  "NEXT_PUBLIC_POSTHOG_HOST",
  "EMAIL_FROM",
  "R2_ACCOUNT_ID",
  "R2_BUCKET_NAME",
  "R2_PUBLIC_URL",
  "RAZORPAY_KEY_ID",
  "UPSTASH_REDIS_REST_URL",
  "SENTRY_AUTH_TOKEN",
];

function readFlagValue(name: string): string | null {
  const v = process.env[name];
  if (v === undefined || v === "") return null;
  return v;
}

function flagSet(name: string, kind: "bool" | "string"): boolean {
  const v = readFlagValue(name);
  if (kind === "bool") return v === "true" || v === "1";
  return Boolean(v);
}

export default async function ConfigPage({ params }: Props) {
  const { ccSlug } = await params;
  await ensureCCAuth(ccSlug);

  const session = await getCurrentSession();
  void logAudit({ action: "config.view", sessionId: session?.id ?? null });

  const setFlagsCount = FEATURE_FLAGS.filter((f) => readFlagValue(f.name) !== null).length;
  const cronCount = CRON_JOBS.length;
  const envSetCount = PUBLIC_ENV_KEYS.filter((k) => readFlagValue(k) !== null).length;
  const envUnsetCount = PUBLIC_ENV_KEYS.length - envSetCount;
  const secretsSet = SENSITIVE_SECRETS.filter((k) => readFlagValue(k) !== null).length;

  return (
    <>
      <PageHeader
        title="System configuration"
        subtitle="Feature flags · cron schedule · env presence (read-only)"
      />

      <div className="cc-stack">
        {/* KPIS */}
        <div className="cc-grid cc-grid-3">
          <Kpi
            label="Feature flags set"
            value={`${setFlagsCount} / ${FEATURE_FLAGS.length}`}
            sub="non-default values"
          />
          <Kpi
            label="Cron jobs"
            value={String(cronCount)}
            sub="from vercel.json"
          />
          <Kpi
            label="Public env keys"
            value={`${envSetCount} / ${PUBLIC_ENV_KEYS.length}`}
            sub={envUnsetCount > 0 ? `${envUnsetCount} unset` : "all set"}
            tone={envUnsetCount === 0 ? "ok" : envUnsetCount > 3 ? "warn" : undefined}
          />
        </div>

        {/* FEATURE FLAGS */}
        <div className="cc-card" style={{ padding: 0 }}>
          <p className="cc-card-title" style={{ padding: "16px 16px 0 16px" }}>
            Feature flags
          </p>
          <table className="cc-table">
            <thead>
              <tr>
                <th>Flag</th>
                <th style={{ width: 200 }}>Value</th>
                <th style={{ width: 90 }}>State</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {FEATURE_FLAGS.map((flag) => {
                const raw = readFlagValue(flag.name);
                const value = raw ?? `(${flag.defaultValue})`;
                const enabled = flagSet(flag.name, flag.kind);
                const tone: "ok" | "warn" | "neutral" | "info" =
                  flag.kind === "bool" ? (enabled ? "ok" : "neutral") : raw ? "info" : "neutral";
                return (
                  <tr key={flag.name}>
                    <td className="cc-mono-cell" style={{ fontSize: 12 }}>
                      {flag.name}
                    </td>
                    <td className="cc-mono-cell" style={{ fontSize: 11.5, color: raw ? "var(--cc-fg)" : "var(--cc-fg-dim)" }}>
                      {value}
                    </td>
                    <td>
                      <span
                        className={`cc-pill ${
                          tone === "ok"
                            ? "cc-pill-ok"
                            : tone === "info"
                              ? "cc-pill-info"
                              : "cc-pill-neutral"
                        }`}
                      >
                        {flag.kind === "bool" ? (enabled ? "on" : "off") : raw ? "set" : "default"}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>{flag.description}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* CRON JOBS */}
        <div className="cc-card" style={{ padding: 0 }}>
          <p className="cc-card-title" style={{ padding: "16px 16px 0 16px" }}>
            Cron jobs
          </p>
          <table className="cc-table">
            <thead>
              <tr>
                <th style={{ width: 200 }}>Name</th>
                <th style={{ width: 130 }}>Schedule</th>
                <th>Endpoint</th>
                <th style={{ width: 110 }}>Last run</th>
                <th style={{ width: 90 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {CRON_JOBS.length === 0 ? (
                <tr>
                  <td colSpan={5} className="cc-table-empty">
                    No cron jobs configured.
                  </td>
                </tr>
              ) : (
                CRON_JOBS.map((c) => (
                  <tr key={c.name}>
                    <td className="cc-mono-cell" style={{ fontSize: 12 }}>
                      {c.name}
                    </td>
                    <td className="cc-mono-cell" style={{ fontSize: 11.5, color: "var(--cc-fg-muted)" }}>
                      {c.schedule}
                    </td>
                    <td className="cc-mono-cell" style={{ fontSize: 11.5 }}>
                      {c.endpoint}
                    </td>
                    <td className="cc-mono-cell" style={{ fontSize: 11.5, color: "var(--cc-fg-dim)" }}>
                      —
                    </td>
                    <td>
                      <span className="cc-pill cc-pill-info">scheduled</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* SENSITIVE SECRETS */}
        <div className="cc-card" style={{ padding: 0 }}>
          <p className="cc-card-title" style={{ padding: "16px 16px 0 16px" }}>
            Sensitive secrets · {secretsSet} / {SENSITIVE_SECRETS.length} set
          </p>
          <table className="cc-table">
            <thead>
              <tr>
                <th>Key</th>
                <th style={{ width: 110 }}>Set?</th>
              </tr>
            </thead>
            <tbody>
              {SENSITIVE_SECRETS.map((key) => {
                const isSet = readFlagValue(key) !== null;
                return (
                  <tr key={key}>
                    <td className="cc-mono-cell" style={{ fontSize: 12 }}>
                      {key}
                    </td>
                    <td>
                      <span className={`cc-pill ${isSet ? "cc-pill-ok" : "cc-pill-bad"}`}>
                        {isSet ? "set" : "unset"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="cc-card">
          <p className="cc-mono-cell" style={{ fontSize: 11, color: "var(--cc-fg-muted)", margin: 0 }}>
            Live feature-flag toggles, maintenance mode kill-switch, and cron manual-trigger ship next
            iteration. For now this view is read-only — change values in Vercel project env settings.
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
