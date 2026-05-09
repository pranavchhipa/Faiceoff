/**
 * Pricing & promotions — read-only view of the live pricing surface.
 *
 * Reads:
 *   • credit_packs_catalog — public packs (from src/lib/billing/pack-catalog).
 *   • PLATFORM_COMMISSION_RATE — billing/pricing-engine constant (server-side
 *     env override allowed via PLATFORM_COMMISSION).
 *   • Free signup credits constant (10 — set in migration 00050).
 *   • promo_codes / promo_redemptions — fall back to "—" if absent.
 *
 * Editable in a follow-up; this iteration just surfaces the live values
 * the platform is using right now.
 */

import { ensureCCAuth, PageHeader } from "../_components/page-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/cc/audit";
import { getCurrentSession } from "@/lib/cc/session";
import {
  PLATFORM_COMMISSION_RATE,
  GST_ON_COMMISSION_RATE,
  EXCLUSIVITY_RATE,
  SCOPE_ADDONS_PAISE,
} from "@/lib/billing/pricing-engine";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ ccSlug: string }>;
}

interface PackRow {
  code: string;
  display_name: string;
  credits: number | null;
  bonus_credits: number | null;
  price_paise: number | null;
  is_popular: boolean | null;
  is_active: boolean | null;
  sort_order: number | null;
  marketing_tagline: string | null;
}

interface PromoRow {
  id: string;
  code: string;
  discount_type: string | null;
  discount_value: number | null;
  is_active: boolean | null;
  expires_at: string | null;
  redemption_count: number | null;
}

const FREE_SIGNUP_CREDITS = 10; // hard-set in migration 00050

function fmt(paise: number | null | undefined): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format((paise ?? 0) / 100);
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(0)}%`;
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error("[cc/pricing] query failed, using fallback", err);
    return fallback;
  }
}

export default async function PricingPage({ params }: Props) {
  const { ccSlug } = await params;
  await ensureCCAuth(ccSlug);

  const session = await getCurrentSession();
  void logAudit({ action: "pricing.view", sessionId: session?.id ?? null });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Resolve effective commission rate: env override beats constant.
  const envCommission = Number(process.env.PLATFORM_COMMISSION ?? "");
  const effectiveCommission =
    Number.isFinite(envCommission) && envCommission > 0 && envCommission < 1
      ? envCommission
      : PLATFORM_COMMISSION_RATE;
  const commissionSource = effectiveCommission === PLATFORM_COMMISSION_RATE
    ? "code constant"
    : "env override";

  const monthIso = new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
  ).toISOString();

  const [packs, promos, promoMtdAggregate] = await Promise.all([
    safe(
      async () => {
        const { data } = await admin
          .from("credit_packs_catalog")
          .select(
            "code, display_name, credits, bonus_credits, price_paise, is_popular, is_active, sort_order, marketing_tagline",
          )
          .order("sort_order", { ascending: true });
        return (data ?? []) as PackRow[];
      },
      [] as PackRow[],
    ),
    safe(
      async () => {
        const { data } = await admin
          .from("promo_codes")
          .select(
            "id, code, discount_type, discount_value, is_active, expires_at, redemption_count",
          )
          .order("created_at", { ascending: false })
          .limit(50);
        return (data ?? []) as PromoRow[];
      },
      null as PromoRow[] | null,
    ),
    safe(
      async () => {
        const { data } = await admin
          .from("promo_redemptions")
          .select("discount_paise")
          .gte("created_at", monthIso);
        return ((data ?? []) as Array<{ discount_paise: number | null }>).reduce(
          (s, r) => s + (r.discount_paise ?? 0),
          0,
        );
      },
      null as number | null,
    ),
  ]);

  const activePromos = promos === null ? null : promos.filter((p) => p.is_active);

  return (
    <>
      <PageHeader
        title="Pricing &amp; promotions"
        subtitle="Credit packs · platform commission · GST/scope add-ons · promo codes (read-only)"
      />

      {/* KPI strip */}
      <div className="cc-stack">
        <div>
          <p className="cc-card-title" style={{ marginBottom: 8 }}>
            Live values
          </p>
          <div className="cc-grid cc-grid-4">
            <Kpi
              label="Platform commission"
              value={pct(effectiveCommission)}
              sub={commissionSource}
            />
            <Kpi
              label="GST on commission"
              value={pct(GST_ON_COMMISSION_RATE)}
              sub="constant"
            />
            <Kpi
              label="Free signup credits"
              value={String(FREE_SIGNUP_CREDITS)}
              sub="grant on first login"
            />
            <Kpi
              label="Active promo codes"
              value={activePromos === null ? "—" : String(activePromos.length)}
              sub={
                promoMtdAggregate === null
                  ? "promo_redemptions table not configured"
                  : `${fmt(promoMtdAggregate)} discounted MTD`
              }
            />
          </div>
        </div>

        {/* Credit packs */}
        <div>
          <p className="cc-card-title" style={{ marginBottom: 8 }}>
            Credit packs · credit_packs_catalog
          </p>
          <div className="cc-card" style={{ padding: 0, overflow: "auto" }}>
            <table className="cc-table">
              <thead>
                <tr>
                  <th style={{ width: 110 }}>Code</th>
                  <th>Name</th>
                  <th style={{ width: 90 }}>Credits</th>
                  <th style={{ width: 90 }}>Bonus</th>
                  <th style={{ width: 130 }}>Price</th>
                  <th style={{ width: 130 }}>Per credit</th>
                  <th style={{ width: 80 }}>Active</th>
                  <th style={{ width: 80 }}>Popular</th>
                </tr>
              </thead>
              <tbody>
                {packs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="cc-table-empty">
                      credit_packs_catalog is empty — run seed migration 00033.
                    </td>
                  </tr>
                ) : (
                  packs.map((p) => {
                    const totalCredits =
                      (p.credits ?? 0) + (p.bonus_credits ?? 0);
                    const perCredit =
                      totalCredits > 0
                        ? Math.round((p.price_paise ?? 0) / totalCredits)
                        : 0;
                    return (
                      <tr key={p.code}>
                        <td className="cc-mono-cell">{p.code}</td>
                        <td>
                          {p.display_name}
                          {p.marketing_tagline ? (
                            <span
                              className="cc-mono-cell"
                              style={{
                                display: "block",
                                color: "var(--cc-fg-muted)",
                                fontSize: 11,
                                marginTop: 2,
                              }}
                            >
                              {p.marketing_tagline}
                            </span>
                          ) : null}
                        </td>
                        <td className="cc-mono-cell">{p.credits ?? 0}</td>
                        <td className="cc-mono-cell">
                          {p.bonus_credits ? `+${p.bonus_credits}` : "—"}
                        </td>
                        <td className="cc-mono-cell">{fmt(p.price_paise)}</td>
                        <td className="cc-mono-cell" style={{ color: "var(--cc-fg-muted)" }}>
                          {totalCredits > 0 ? fmt(perCredit) : "—"}
                        </td>
                        <td>
                          <span
                            className={`cc-pill ${p.is_active ? "cc-pill-ok" : "cc-pill-neutral"}`}
                          >
                            {p.is_active ? "yes" : "no"}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`cc-pill ${p.is_popular ? "cc-pill-info" : "cc-pill-neutral"}`}
                          >
                            {p.is_popular ? "yes" : "no"}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Scope add-ons + exclusivity */}
        <div>
          <p className="cc-card-title" style={{ marginBottom: 8 }}>
            Scope add-ons &amp; exclusivity premium
          </p>
          <div className="cc-card" style={{ padding: 0, overflow: "auto" }}>
            <table className="cc-table">
              <thead>
                <tr>
                  <th>Knob</th>
                  <th>Value</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="cc-mono-cell">scope · digital</td>
                  <td className="cc-mono-cell">
                    {fmt(SCOPE_ADDONS_PAISE.digital)}
                  </td>
                  <td style={{ color: "var(--cc-fg-muted)" }}>
                    Online use only — no add-on
                  </td>
                </tr>
                <tr>
                  <td className="cc-mono-cell">scope · digital_print</td>
                  <td className="cc-mono-cell">
                    {fmt(SCOPE_ADDONS_PAISE.digital_print)}
                  </td>
                  <td style={{ color: "var(--cc-fg-muted)" }}>
                    Adds print collateral
                  </td>
                </tr>
                <tr>
                  <td className="cc-mono-cell">
                    scope · digital_print_packaging
                  </td>
                  <td className="cc-mono-cell">
                    {fmt(SCOPE_ADDONS_PAISE.digital_print_packaging)}
                  </td>
                  <td style={{ color: "var(--cc-fg-muted)" }}>
                    Adds product packaging
                  </td>
                </tr>
                <tr>
                  <td className="cc-mono-cell">exclusivity premium</td>
                  <td className="cc-mono-cell">{pct(EXCLUSIVITY_RATE)}</td>
                  <td style={{ color: "var(--cc-fg-muted)" }}>
                    Uplift on (base + scope) when brand books category exclusivity
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Promo codes */}
        <div>
          <p className="cc-card-title" style={{ marginBottom: 8 }}>
            Promo codes
          </p>
          <div className="cc-card" style={{ padding: 0, overflow: "auto" }}>
            <table className="cc-table">
              <thead>
                <tr>
                  <th style={{ width: 140 }}>Code</th>
                  <th style={{ width: 110 }}>Discount</th>
                  <th style={{ width: 110 }}>Active</th>
                  <th style={{ width: 130 }}>Expires</th>
                  <th style={{ width: 100 }}>Redemptions</th>
                  <th>ID</th>
                </tr>
              </thead>
              <tbody>
                {promos === null ? (
                  <tr>
                    <td colSpan={6} className="cc-table-empty">
                      promo_codes table not configured.
                    </td>
                  </tr>
                ) : promos.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="cc-table-empty">
                      No promo codes configured.
                    </td>
                  </tr>
                ) : (
                  promos.map((p) => (
                    <tr key={p.id}>
                      <td className="cc-mono-cell">{p.code}</td>
                      <td className="cc-mono-cell">
                        {p.discount_type === "percent" && p.discount_value != null
                          ? `${p.discount_value}%`
                          : p.discount_type === "flat" && p.discount_value != null
                            ? fmt(p.discount_value)
                            : "—"}
                      </td>
                      <td>
                        <span
                          className={`cc-pill ${p.is_active ? "cc-pill-ok" : "cc-pill-neutral"}`}
                        >
                          {p.is_active ? "yes" : "no"}
                        </span>
                      </td>
                      <td className="cc-mono-cell" style={{ color: "var(--cc-fg-muted)", fontSize: 11.5 }}>
                        {p.expires_at
                          ? new Date(p.expires_at).toISOString().slice(0, 10)
                          : "—"}
                      </td>
                      <td className="cc-mono-cell">
                        {p.redemption_count ?? 0}
                      </td>
                      <td className="cc-mono-cell" style={{ color: "var(--cc-fg-muted)", fontSize: 11 }}>
                        {p.id.slice(0, 8)}…
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div
          className="cc-card"
          style={{
            padding: 12,
            fontSize: 11.5,
            color: "var(--cc-fg-muted)",
            borderStyle: "dashed",
          }}
        >
          Edit-in-place ships next iteration — these are the live values your
          platform is using right now. Pack edits go through{" "}
          <span className="cc-mono-cell">credit_packs_catalog</span>; commission
          via the <span className="cc-mono-cell">PLATFORM_COMMISSION</span> env
          var.
        </div>
      </div>
    </>
  );
}

function Kpi({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="cc-kpi">
      <span className="cc-kpi-label">{label}</span>
      <span className="cc-kpi-value">{value}</span>
      {sub && <span className="cc-kpi-sub">{sub}</span>}
    </div>
  );
}
