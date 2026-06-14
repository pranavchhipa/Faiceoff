/**
 * Payouts — Control Centre manual creator payout queue.
 *
 * Creators request a payout (creator_payouts row, status 'requested'). RazorpayX
 * automated payouts are not wired yet, so an operator transfers the money MANUALLY
 * via the RazorpayX dashboard using the bank details shown here, then marks the
 * payout paid (records the UTR) or rejects it (releases the locked escrow).
 *
 * SENSITIVE: the full creator bank account number is decrypted SERVER-SIDE here
 * (decryptAccountNumber) so the operator can complete the transfer. It is rendered
 * once per row and never leaves the server boundary as plaintext anywhere else.
 */

import { ensureCCAuth, PageHeader } from "../_components/page-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/cc/audit";
import { getCurrentSession } from "@/lib/cc/session";
import { decryptAccountNumber } from "@/lib/kyc/bank-crypto";
import { markPayoutPaid, rejectPayout } from "./actions";

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
  completed_at: string | null;
}

interface CreatorBank {
  id: string;
  user_id: string | null;
  bank_account_holder_name: string | null;
  bank_account_number_encrypted: string | null;
  bank_ifsc: string | null;
  bank_added_at: string | null;
}

interface UserRow {
  id: string;
  display_name: string | null;
  email: string | null;
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

function payoutStatusPill(status: string): string {
  if (status === "success") return "cc-pill-ok";
  if (status === "processing" || status === "requested") return "cc-pill-warn";
  if (status === "failed" || status === "reversed") return "cc-pill-bad";
  return "cc-pill-neutral";
}

export default async function PayoutsPage({ params }: Props) {
  const { ccSlug } = await params;
  await ensureCCAuth(ccSlug);

  const session = await getCurrentSession();
  void logAudit({ action: "payouts.view", sessionId: session?.id ?? null });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Pending queue (oldest first — operator works top-down) + a recent-paid list.
  const [queueRes, paidRes] = await Promise.all([
    admin
      .from("creator_payouts")
      .select(
        "id, creator_id, gross_amount_paise, net_amount_paise, status, bank_account_last4, requested_at, completed_at",
      )
      .in("status", ["requested", "processing"])
      .order("requested_at", { ascending: true, nullsFirst: false })
      .limit(100),
    admin
      .from("creator_payouts")
      .select(
        "id, creator_id, gross_amount_paise, net_amount_paise, status, bank_account_last4, requested_at, completed_at",
      )
      .eq("status", "success")
      .order("completed_at", { ascending: false, nullsFirst: false })
      .limit(10),
  ]);

  const queue = (queueRes.data ?? []) as PayoutRow[];
  const recentPaid = (paidRes.data ?? []) as PayoutRow[];

  // Hydrate creator bank details (queue only) + their user display name/email.
  const creatorIds = Array.from(
    new Set(queue.map((p) => p.creator_id).filter((x): x is string => Boolean(x))),
  );
  const { data: creators } = creatorIds.length
    ? await admin
        .from("creators")
        .select(
          "id, user_id, bank_account_holder_name, bank_account_number_encrypted, bank_ifsc, bank_added_at",
        )
        .in("id", creatorIds)
    : { data: [] };
  const creatorRows = (creators ?? []) as CreatorBank[];

  const userIds = creatorRows
    .map((c) => c.user_id)
    .filter((x): x is string => Boolean(x));
  const { data: users } = userIds.length
    ? await admin.from("users").select("id, display_name, email").in("id", userIds)
    : { data: [] };
  const userRows = (users ?? []) as UserRow[];

  const userMap = new Map(userRows.map((u) => [u.id, u]));
  const creatorMap = new Map(
    creatorRows.map((c) => [
      c.id,
      { ...c, user: c.user_id ? userMap.get(c.user_id) ?? null : null },
    ]),
  );

  const pendingTotal = queue.reduce((s, p) => s + (p.net_amount_paise ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Payouts"
        subtitle={`${queue.length} pending · ${fmt(pendingTotal)} to disburse · transfer via RazorpayX then mark paid`}
      />

      <div className="cc-stack">
        <div className="cc-grid cc-grid-3">
          <Kpi
            label="Pending payouts"
            value={String(queue.length)}
            tone={queue.length > 0 ? "warn" : "ok"}
          />
          <Kpi label="Total to disburse" value={fmt(pendingTotal)} />
          <Kpi label="Recently paid" value={String(recentPaid.length)} tone="ok" />
        </div>

        {/* Pending payout queue — each row carries the bank details + action forms */}
        <div>
          <p className="cc-card-title" style={{ marginBottom: 8 }}>
            Pending payout requests · {queue.length} loaded
          </p>

          {queue.length === 0 ? (
            <div
              className="cc-card"
              style={{
                padding: 28,
                textAlign: "center",
                color: "var(--cc-fg-muted)",
                fontSize: 12.5,
                borderStyle: "dashed",
              }}
            >
              No pending payouts. When a creator requests a withdrawal it lands here
              for manual RazorpayX disbursement.
            </div>
          ) : (
            <div className="cc-stack">
              {queue.map((p) => {
                const creator = p.creator_id ? creatorMap.get(p.creator_id) : null;
                const name =
                  creator?.user?.display_name ??
                  creator?.bank_account_holder_name ??
                  "Creator";
                const email = creator?.user?.email ?? "—";
                // SERVER-SIDE decrypt — full account number for the operator to pay.
                const fullAccount = decryptAccountNumber(
                  creator?.bank_account_number_encrypted,
                );

                return (
                  <div key={p.id} className="cc-card">
                    {/* Header: who + amount */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: 16,
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <h3 style={{ margin: 0, fontSize: 14 }}>{name}</h3>
                        <div style={{ fontSize: 11.5, color: "var(--cc-fg-dim)", marginTop: 2 }}>
                          {email}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--cc-fg-muted)", marginTop: 4 }}>
                          Requested {relativeFrom(p.requested_at)} · payout {p.id.slice(0, 8)}…
                          {p.creator_id ? ` · creator ${p.creator_id.slice(0, 8)}…` : ""}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--cc-fg-dim)" }}>
                          Amount to pay
                        </div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: "var(--cc-accent)" }}>
                          {fmt(p.net_amount_paise)}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--cc-fg-muted)" }}>
                          gross {fmt(p.gross_amount_paise)}
                        </div>
                        <span className={`cc-pill ${payoutStatusPill(p.status)}`} style={{ marginTop: 4 }}>
                          {p.status}
                        </span>
                      </div>
                    </div>

                    {/* Bank details — sensitive, full account number decrypted server-side */}
                    <div
                      style={{
                        marginTop: 14,
                        padding: 12,
                        borderRadius: 8,
                        background: "var(--cc-bg-2)",
                        border: "1px solid var(--cc-border)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10.5,
                          letterSpacing: "0.14em",
                          textTransform: "uppercase",
                          color: "var(--cc-warn)",
                          marginBottom: 10,
                        }}
                      >
                        Bank transfer details · sensitive
                      </div>
                      <div
                        className="cc-kv"
                        style={{
                          display: "grid",
                          gridTemplateColumns: "auto 1fr",
                          gap: "8px 16px",
                          fontSize: 12.5,
                        }}
                      >
                        <span style={{ color: "var(--cc-fg-dim)" }}>Account holder</span>
                        <span>{creator?.bank_account_holder_name ?? "—"}</span>
                        <span style={{ color: "var(--cc-fg-dim)" }}>Account number</span>
                        <span className="cc-mono-cell" style={{ fontSize: 13, color: "var(--cc-fg)", letterSpacing: "0.04em" }}>
                          {fullAccount
                            ? fullAccount
                            : p.bank_account_last4
                              ? `•••• ${p.bank_account_last4} (full number unavailable)`
                              : "— not on file —"}
                        </span>
                        <span style={{ color: "var(--cc-fg-dim)" }}>IFSC</span>
                        <span className="cc-mono-cell" style={{ fontSize: 12.5 }}>
                          {creator?.bank_ifsc ?? "—"}
                        </span>
                        <span style={{ color: "var(--cc-fg-dim)" }}>Bank added</span>
                        <span style={{ color: "var(--cc-fg-muted)" }}>
                          {creator?.bank_added_at
                            ? new Date(creator.bank_added_at).toLocaleString("en-IN")
                            : "—"}
                        </span>
                      </div>
                    </div>

                    {/* Actions: mark paid (UTR) | reject (reason) */}
                    <div
                      className="cc-grid cc-grid-2"
                      style={{ marginTop: 14, alignItems: "start" }}
                    >
                      <form action={markPayoutPaid} className="cc-stack" style={{ gap: 8 }}>
                        <input type="hidden" name="payout_id" value={p.id} />
                        <input type="hidden" name="cc_slug" value={ccSlug} />
                        <input
                          type="text"
                          name="utr"
                          placeholder="UTR / payment reference (optional)"
                          className="cc-input"
                          style={{ width: "100%", fontSize: 12.5 }}
                        />
                        <button
                          type="submit"
                          className="cc-btn"
                          style={{
                            background: "var(--cc-ok)",
                            color: "#06210f",
                            borderColor: "var(--cc-ok)",
                            fontWeight: 700,
                            width: "100%",
                          }}
                        >
                          ✓ Mark paid
                        </button>
                      </form>
                      <form action={rejectPayout} className="cc-stack" style={{ gap: 8 }}>
                        <input type="hidden" name="payout_id" value={p.id} />
                        <input type="hidden" name="cc_slug" value={ccSlug} />
                        <textarea
                          name="reason"
                          rows={2}
                          placeholder="Reason (creator sees this; releases escrow)…"
                          className="cc-input"
                          style={{ width: "100%", resize: "vertical", fontSize: 12.5 }}
                        />
                        <button
                          type="submit"
                          className="cc-btn"
                          style={{
                            borderColor: "var(--cc-bad)",
                            color: "var(--cc-bad)",
                            fontWeight: 700,
                            width: "100%",
                          }}
                        >
                          Reject
                        </button>
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recently paid — reference only */}
        <div>
          <p className="cc-card-title" style={{ marginBottom: 8 }}>
            Recently paid · last {recentPaid.length}
          </p>
          <div className="cc-card" style={{ padding: 0, overflow: "auto" }}>
            <table className="cc-table">
              <thead>
                <tr>
                  <th>Creator id</th>
                  <th style={{ width: 130 }}>Net paid</th>
                  <th style={{ width: 100 }}>Status</th>
                  <th style={{ width: 90 }}>Bank</th>
                  <th style={{ width: 140 }}>Completed</th>
                  <th style={{ width: 110 }}>Payout id</th>
                </tr>
              </thead>
              <tbody>
                {recentPaid.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="cc-table-empty">
                      No payouts marked paid yet.
                    </td>
                  </tr>
                ) : (
                  recentPaid.map((p) => (
                    <tr key={p.id}>
                      <td className="cc-mono-cell" style={{ fontSize: 11.5 }}>
                        {p.creator_id ? `${p.creator_id.slice(0, 8)}…` : "—"}
                      </td>
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
                        {relativeFrom(p.completed_at)}
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
      </div>
    </>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
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
    </div>
  );
}
