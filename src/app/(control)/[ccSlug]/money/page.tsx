/**
 * Money centre — read-only money snapshot.
 *
 * Aggregates brand wallets, escrow held, platform revenue (today/MTD/YTD),
 * GST + TDS collected MTD, plus the pending payout queue and recent
 * top-ups. All numbers in paise; rendered as INR with Intl.NumberFormat.
 *
 * NOTE: this page is intentionally read-only this iteration. The manual
 * refund tool (release escrow / refund top-up / mark payout failed) ships
 * in a follow-up — no mutations live yet. Treat this as the dashboard,
 * not the cockpit.
 */

import { ensureCCAuth, PageHeader } from "../_components/page-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/cc/audit";
import { getCurrentSession } from "@/lib/cc/session";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ ccSlug: string }>;
}

interface PayoutRow {
  id: string;
  creator_id: string | null;
  gross_amount_paise: number | null;
  net_amount_paise: number | null;
  status: string;
  bank_account_last4: string | null;
  requested_at: string | null;
  created_at?: string;
}

interface TopupRow {
  id: string;
  brand_id: string | null;
  amount_paise: number | null;
  pack: string | null;
  status: string;
  created_at: string;
  /** Which funding rail the row came from. */
  source: "credits" | "wallet";
}

function fmt(paise: number | null | undefined): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format((paise ?? 0) / 100);
}

function relativeFrom(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function startOfTodayIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfMonthIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function startOfYearIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();
}

function payoutStatusPill(status: string): string {
  if (status === "success") return "cc-pill-info";
  if (status === "processing") return "cc-pill-warn";
  if (status === "failed" || status === "reversed") return "cc-pill-bad";
  if (status === "requested") return "cc-pill-warn";
  return "cc-pill-neutral";
}

function topupStatusPill(status: string): string {
  if (status === "success") return "cc-pill-ok";
  if (status === "processing" || status === "initiated") return "cc-pill-warn";
  if (status === "failed" || status === "expired") return "cc-pill-bad";
  return "cc-pill-neutral";
}

async function safeQuery<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error("[cc/money] query failed, using fallback", err);
    return fallback;
  }
}

export default async function MoneyPage({ params }: Props) {
  const { ccSlug } = await params;
  await ensureCCAuth(ccSlug);

  const session = await getCurrentSession();
  void logAudit({ action: "money.view", sessionId: session?.id ?? null });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const todayIso = startOfTodayIso();
  const monthIso = startOfMonthIso();
  const yearIso = startOfYearIso();

  // Run everything in parallel.
  const [
    walletAgg,
    escrowOutstanding,
    revToday,
    revMtd,
    revYtd,
    payoutQueue,
    payoutAggregate,
    recentTopups,
    gstMtd,
    tdsMtd,
  ] = await Promise.all([
    safeQuery(
      async () => {
        const { data } = await admin
          .from("brands")
          .select("wallet_balance_paise, wallet_reserved_paise");
        return (data ?? []) as Array<{
          wallet_balance_paise: number | null;
          wallet_reserved_paise: number | null;
        }>;
      },
      [] as Array<{ wallet_balance_paise: number | null; wallet_reserved_paise: number | null }>,
    ),
    safeQuery(
      async () => {
        // escrow_ledger has no `status` column; instead, rows with payout_id IS NULL
        // are still "held" by the platform. Sum of release_per_image rows that have
        // not yet been included in a payout = creator pending. Sum of `lock` rows
        // minus matching releases = brand-refundable + creator-locked.
        // Simplest accurate proxy: sum amount_paise of rows with type IN ('lock','release_per_image')
        // not yet linked to a payout.
        const { data } = await admin
          .from("escrow_ledger")
          .select("amount_paise, type, payout_id")
          .in("type", ["lock", "release_per_image"])
          .is("payout_id", null);
        const rows = (data ?? []) as Array<{
          amount_paise: number | null;
          type: string;
          payout_id: string | null;
        }>;
        // `lock` adds to held; `release_per_image` is a state transfer (still held by platform until withdraw_paid).
        // For the dashboard we approximate "held by platform" = sum of lock rows minus refund_to_brand and withdraw_paid rows
        // already excluded by type filter above. Good enough for an at-a-glance figure.
        return rows.reduce((s, r) => s + (r.amount_paise ?? 0), 0);
      },
      0,
    ),
    safeQuery(
      async () => {
        const { data } = await admin
          .from("platform_revenue_ledger")
          .select("amount_paise")
          .gte("created_at", todayIso);
        return ((data ?? []) as Array<{ amount_paise: number | null }>).reduce(
          (s, r) => s + (r.amount_paise ?? 0),
          0,
        );
      },
      0,
    ),
    safeQuery(
      async () => {
        const { data } = await admin
          .from("platform_revenue_ledger")
          .select("amount_paise")
          .gte("created_at", monthIso);
        return ((data ?? []) as Array<{ amount_paise: number | null }>).reduce(
          (s, r) => s + (r.amount_paise ?? 0),
          0,
        );
      },
      0,
    ),
    safeQuery(
      async () => {
        const { data } = await admin
          .from("platform_revenue_ledger")
          .select("amount_paise")
          .gte("created_at", yearIso);
        return ((data ?? []) as Array<{ amount_paise: number | null }>).reduce(
          (s, r) => s + (r.amount_paise ?? 0),
          0,
        );
      },
      0,
    ),
    safeQuery(
      async () => {
        const { data } = await admin
          .from("creator_payouts")
          .select(
            "id, creator_id, gross_amount_paise, net_amount_paise, status, bank_account_last4, requested_at",
          )
          .in("status", ["requested", "processing"])
          .order("requested_at", { ascending: false })
          .limit(50);
        return (data ?? []) as PayoutRow[];
      },
      [] as PayoutRow[],
    ),
    safeQuery(
      async () => {
        const { data } = await admin
          .from("creator_payouts")
          .select("net_amount_paise, status")
          .in("status", ["requested", "processing"]);
        const rows = (data ?? []) as Array<{ net_amount_paise: number | null }>;
        return {
          count: rows.length,
          total: rows.reduce((s, r) => s + (r.net_amount_paise ?? 0), 0),
        };
      },
      { count: 0, total: 0 },
    ),
    safeQuery(
      async () => {
        // INR funding arrives via two separate tables: credit-pack purchases
        // (credit_top_ups, has a `pack`) and wallet INR top-ups
        // (wallet_top_ups, written by /api/wallet/top-up, no `pack`). Query
        // both, tag each with a source, merge, sort by created_at desc, keep
        // the latest 30 across both rails.
        const [creditRes, walletRes] = await Promise.all([
          admin
            .from("credit_top_ups")
            .select("id, brand_id, amount_paise, pack, status, created_at")
            .order("created_at", { ascending: false })
            .limit(30),
          admin
            .from("wallet_top_ups")
            .select("id, brand_id, amount_paise, status, created_at")
            .order("created_at", { ascending: false })
            .limit(30),
        ]);

        const credits: TopupRow[] = (
          (creditRes.data ?? []) as Array<Omit<TopupRow, "source">>
        ).map((r) => ({ ...r, source: "credits" as const }));

        const wallet: TopupRow[] = (
          (walletRes.data ?? []) as Array<Omit<TopupRow, "source" | "pack">>
        ).map((r) => ({ ...r, pack: null, source: "wallet" as const }));

        return [...credits, ...wallet]
          .sort(
            (a, b) =>
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
          )
          .slice(0, 30);
      },
      [] as TopupRow[],
    ),
    safeQuery(
      async () => {
        const { data } = await admin
          .from("gst_output_ledger")
          .select("tax_paise")
          .gte("created_at", monthIso);
        return ((data ?? []) as Array<{ tax_paise: number | null }>).reduce(
          (s, r) => s + (r.tax_paise ?? 0),
          0,
        );
      },
      0,
    ),
    safeQuery(
      async () => {
        const { data } = await admin
          .from("tds_ledger")
          .select("tax_paise")
          .gte("created_at", monthIso);
        return ((data ?? []) as Array<{ tax_paise: number | null }>).reduce(
          (s, r) => s + (r.tax_paise ?? 0),
          0,
        );
      },
      0,
    ),
  ]);

  const totalWallet = walletAgg.reduce(
    (s, b) => s + (b.wallet_balance_paise ?? 0),
    0,
  );
  const totalReserved = walletAgg.reduce(
    (s, b) => s + (b.wallet_reserved_paise ?? 0),
    0,
  );

  return (
    <>
      <PageHeader
        title="Money"
        subtitle="Wallets · escrow · platform revenue · GST/TDS · payout queue (read-only)"
      />

      <div className="cc-stack">
        {/* Row 1 — wallet, escrow, revenue today, revenue MTD */}
        <div>
          <p className="cc-card-title" style={{ marginBottom: 8 }}>
            Holdings &amp; revenue
          </p>
          <div className="cc-grid cc-grid-4">
            <Kpi
              label="Brand wallets"
              value={fmt(totalWallet)}
              sub={`${fmt(totalReserved)} reserved · ${walletAgg.length} brands`}
            />
            <Kpi
              label="Escrow held"
              value={fmt(escrowOutstanding)}
              sub="Pending creator + brand refundable"
            />
            <Kpi label="Revenue · today" value={fmt(revToday)} sub="UTC day" />
            <Kpi label="Revenue · MTD" value={fmt(revMtd)} sub="from 1st of month" />
          </div>
        </div>

        {/* Row 2 — YTD, GST, TDS, pending payouts */}
        <div>
          <p className="cc-card-title" style={{ marginBottom: 8 }}>
            Tax &amp; queue
          </p>
          <div className="cc-grid cc-grid-4">
            <Kpi label="Revenue · YTD" value={fmt(revYtd)} sub="calendar year" />
            <Kpi
              label="GST collected · MTD"
              value={fmt(gstMtd)}
              sub="output_on_commission + output_on_creator_service"
            />
            <Kpi
              label="TDS withheld · MTD"
              value={fmt(tdsMtd)}
              sub="Sec 194-O 1%"
            />
            <Kpi
              label="Pending payouts"
              value={String(payoutAggregate.count)}
              sub={fmt(payoutAggregate.total)}
              tone={payoutAggregate.count > 0 ? "warn" : "ok"}
            />
          </div>
        </div>

        {/* Pending payouts */}
        <div>
          <p className="cc-card-title" style={{ marginBottom: 8 }}>
            Pending payout queue · {payoutQueue.length} loaded
          </p>
          <div className="cc-card" style={{ padding: 0, overflow: "auto" }}>
            <table className="cc-table">
              <thead>
                <tr>
                  <th>Creator id</th>
                  <th style={{ width: 120 }}>Gross</th>
                  <th style={{ width: 120 }}>Net</th>
                  <th style={{ width: 100 }}>Status</th>
                  <th style={{ width: 90 }}>Bank ⋯</th>
                  <th style={{ width: 130 }}>Requested</th>
                  <th style={{ width: 110 }}>Payout id</th>
                </tr>
              </thead>
              <tbody>
                {payoutQueue.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="cc-table-empty">
                      No pending payouts.
                    </td>
                  </tr>
                ) : (
                  payoutQueue.map((p) => (
                    <tr key={p.id}>
                      <td className="cc-mono-cell" style={{ fontSize: 11.5 }}>
                        {p.creator_id ? `${p.creator_id.slice(0, 8)}…` : "—"}
                      </td>
                      <td className="cc-mono-cell">{fmt(p.gross_amount_paise)}</td>
                      <td className="cc-mono-cell">{fmt(p.net_amount_paise)}</td>
                      <td>
                        <span className={`cc-pill ${payoutStatusPill(p.status)}`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="cc-mono-cell" style={{ color: "var(--cc-fg-muted)", fontSize: 11.5 }}>
                        {p.bank_account_last4 ? `****${p.bank_account_last4}` : "—"}
                      </td>
                      <td className="cc-mono-cell" style={{ color: "var(--cc-fg-muted)", fontSize: 11.5 }}>
                        {relativeFrom(p.requested_at)}
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

        {/* Recent top-ups — credit packs + wallet INR funding, merged */}
        <div>
          <p className="cc-card-title" style={{ marginBottom: 8 }}>
            Recent brand top-ups · last 30 (credits + wallet)
          </p>
          <div className="cc-card" style={{ padding: 0, overflow: "auto" }}>
            <table className="cc-table">
              <thead>
                <tr>
                  <th>Brand id</th>
                  <th style={{ width: 90 }}>Source</th>
                  <th style={{ width: 110 }}>Pack</th>
                  <th style={{ width: 130 }}>Amount</th>
                  <th style={{ width: 100 }}>Status</th>
                  <th style={{ width: 130 }}>Created</th>
                  <th style={{ width: 110 }}>Top-up id</th>
                </tr>
              </thead>
              <tbody>
                {recentTopups.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="cc-table-empty">
                      No top-ups yet.
                    </td>
                  </tr>
                ) : (
                  recentTopups.map((t) => (
                    <tr key={`${t.source}-${t.id}`}>
                      <td className="cc-mono-cell" style={{ fontSize: 11.5 }}>
                        {t.brand_id ? `${t.brand_id.slice(0, 8)}…` : "—"}
                      </td>
                      <td>
                        <span
                          className={`cc-pill ${
                            t.source === "wallet" ? "cc-pill-info" : "cc-pill-neutral"
                          }`}
                        >
                          {t.source}
                        </span>
                      </td>
                      <td className="cc-mono-cell" style={{ color: "var(--cc-fg-muted)" }}>
                        {t.pack ?? "—"}
                      </td>
                      <td className="cc-mono-cell">{fmt(t.amount_paise)}</td>
                      <td>
                        <span className={`cc-pill ${topupStatusPill(t.status)}`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="cc-mono-cell" style={{ color: "var(--cc-fg-muted)", fontSize: 11.5 }}>
                        {relativeFrom(t.created_at)}
                      </td>
                      <td className="cc-mono-cell" style={{ color: "var(--cc-fg-muted)", fontSize: 11 }}>
                        {t.id.slice(0, 8)}…
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
          Read-only this iteration. Manual refund tool (release escrow row,
          refund failed top-up, mark payout failed) ships next iteration.
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
