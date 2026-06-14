/**
 * Dispute detail — operator reviews one dispute (the raised reason, the linked
 * generation image, both parties) and resolves it: refund the brand (credit
 * goodwill refund) or close with no action. Mirrors the brand-verifications
 * detail page styling (cc-* tokens).
 *
 * Disputes table (00011): id, generation_id, raised_by, reason, status
 *   ('open' | 'investigating' | 'resolved_refund' | 'resolved_no_action' |
 *   'closed'), resolution_notes, resolved_at, created_at, updated_at.
 * NOTE: there is no resolved_by column — the operator is recorded in the audit
 * log instead.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureCCAuth } from "../../_components/page-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/cc/audit";
import { getCurrentSession } from "@/lib/cc/session";
import { resolveDispute } from "../actions";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ ccSlug: string; id: string }>;
}

function statusPill(status: string): string {
  if (status === "open") return "cc-pill-bad";
  if (status === "investigating") return "cc-pill-warn";
  if (status === "resolved_refund" || status === "resolved_no_action") return "cc-pill-ok";
  if (status === "closed") return "cc-pill-neutral";
  return "cc-pill-info";
}

export default async function DisputeDetailPage({ params }: Props) {
  const { ccSlug, id } = await params;
  await ensureCCAuth(ccSlug);

  const session = await getCurrentSession();
  void logAudit({ action: "dispute.open", sessionId: session?.id ?? null, payload: { id } });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: dispute } = await admin
    .from("disputes")
    .select("id, generation_id, raised_by, reason, status, resolution_notes, resolved_at, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!dispute) notFound();

  // Linked generation (image + denormalised brand/creator ids).
  const { data: gen } = await admin
    .from("generations")
    .select("id, image_url, brand_id, creator_id, status")
    .eq("id", dispute.generation_id)
    .maybeSingle();

  // Parties: who raised it, the brand, the creator.
  const { data: raiser } = await admin
    .from("users")
    .select("id, display_name, email, role")
    .eq("id", dispute.raised_by)
    .maybeSingle();

  const { data: brand } = gen?.brand_id
    ? await admin.from("brands").select("id, user_id, company_name").eq("id", gen.brand_id).maybeSingle()
    : { data: null };
  const { data: brandUser } = brand?.user_id
    ? await admin.from("users").select("display_name, email").eq("id", brand.user_id).maybeSingle()
    : { data: null };

  const { data: creator } = gen?.creator_id
    ? await admin.from("creators").select("id, user_id, display_name").eq("id", gen.creator_id).maybeSingle()
    : { data: null };
  const { data: creatorUser } = creator?.user_id
    ? await admin.from("users").select("display_name, email").eq("id", creator.user_id).maybeSingle()
    : { data: null };

  const isOpen = !["resolved_refund", "resolved_no_action", "closed"].includes(dispute.status);
  const raiserRole = raiser?.role ?? "—";
  const brandLabel = brand?.company_name ?? brandUser?.display_name ?? brandUser?.email ?? "—";
  const creatorLabel = creator?.display_name ?? creatorUser?.display_name ?? creatorUser?.email ?? "—";

  return (
    <>
      <div className="cc-page-header">
        <div>
          <h1>Dispute review</h1>
          <p>
            <Link href={`/${ccSlug}/disputes`} style={{ color: "var(--cc-accent)" }}>
              ← All disputes
            </Link>{" "}
            · {id.slice(0, 8)}…
          </p>
        </div>
        <span className={`cc-pill ${statusPill(dispute.status)}`}>{dispute.status.replace("_", " ")}</span>
      </div>

      <div className="cc-stack">
        {/* Disputed generation + reason */}
        <div className="cc-card">
          <h3 style={{ margin: 0, fontSize: 13 }}>Disputed generation</h3>
          <div style={{ display: "flex", gap: 16, marginTop: 12, alignItems: "flex-start" }}>
            {gen?.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={gen.image_url}
                alt=""
                style={{
                  width: 120,
                  height: 120,
                  objectFit: "cover",
                  borderRadius: 6,
                  border: "1px solid var(--cc-border)",
                  display: "block",
                  flexShrink: 0,
                }}
              />
            ) : (
              <div
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: 6,
                  background: "var(--cc-bg-3)",
                  border: "1px solid var(--cc-border)",
                  flexShrink: 0,
                }}
              />
            )}
            <div className="cc-kv" style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 16px", fontSize: 12.5 }}>
              <span style={{ color: "var(--cc-fg-dim)" }}>Generation id</span>
              <span className="cc-mono-cell">{dispute.generation_id.slice(0, 12)}…</span>
              <span style={{ color: "var(--cc-fg-dim)" }}>Gen status</span>
              <span>{gen?.status ?? "—"}</span>
              <span style={{ color: "var(--cc-fg-dim)" }}>Raised</span>
              <span>{new Date(dispute.created_at).toLocaleString("en-IN")}</span>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <span style={{ color: "var(--cc-fg-dim)", fontSize: 12 }}>Reason given</span>
            <p style={{ margin: "4px 0 0 0", fontSize: 13, whiteSpace: "pre-wrap" }}>{dispute.reason}</p>
          </div>
        </div>

        {/* Parties */}
        <div className="cc-card">
          <h3 style={{ margin: 0, fontSize: 13 }}>Parties</h3>
          <div className="cc-kv" style={{ marginTop: 10, display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px", fontSize: 12.5 }}>
            <span style={{ color: "var(--cc-fg-dim)" }}>Raised by</span>
            <span>
              {raiser?.display_name ?? raiser?.email ?? "—"}{" "}
              <span className="cc-pill cc-pill-neutral" style={{ marginLeft: 4 }}>{raiserRole}</span>
            </span>
            <span style={{ color: "var(--cc-fg-dim)" }}>Brand</span>
            <span>{brandLabel}{brandUser?.email ? ` · ${brandUser.email}` : ""}</span>
            <span style={{ color: "var(--cc-fg-dim)" }}>Creator</span>
            <span>{creatorLabel}{creatorUser?.email ? ` · ${creatorUser.email}` : ""}</span>
          </div>
        </div>

        {/* Decision */}
        {isOpen ? (
          <div className="cc-card">
            <h3 style={{ margin: 0, fontSize: 13 }}>Resolve dispute</h3>
            <p style={{ margin: "4px 0 14px 0", fontSize: 12, color: "var(--cc-fg-dim)" }}>
              Refund credits the brand back {`(${1} credit)`} as a goodwill resolution and notifies both parties.
              No action closes the dispute without moving money. Escrow already paid to the creator is not clawed
              back automatically — handle that manually if needed.
            </p>
            <form action={resolveDispute} className="cc-stack" style={{ gap: 10 }}>
              <input type="hidden" name="dispute_id" value={id} />
              <input type="hidden" name="cc_slug" value={ccSlug} />

              <div>
                <label htmlFor="dispute-outcome" style={{ display: "block", fontSize: 11.5, color: "var(--cc-fg-dim)", marginBottom: 4 }}>
                  Outcome
                </label>
                <select id="dispute-outcome" name="outcome" className="cc-input" style={{ width: "100%", fontSize: 12.5 }} defaultValue="no_action">
                  <option value="refund">Refund — credit the brand back</option>
                  <option value="no_action">No action — close without refund</option>
                </select>
              </div>

              <div>
                <label htmlFor="dispute-notes" style={{ display: "block", fontSize: 11.5, color: "var(--cc-fg-dim)", marginBottom: 4 }}>
                  Resolution notes (both parties see this)
                </label>
                <textarea
                  id="dispute-notes"
                  name="resolution_notes"
                  rows={3}
                  placeholder="What was decided and why…"
                  className="cc-input"
                  style={{ width: "100%", resize: "vertical", fontSize: 12.5 }}
                />
              </div>

              <button
                type="submit"
                className="cc-btn"
                style={{ background: "var(--cc-accent)", color: "#06210f", borderColor: "var(--cc-accent)", fontWeight: 700, width: "100%" }}
              >
                Resolve dispute
              </button>
            </form>
          </div>
        ) : (
          <div className="cc-card">
            <h3 style={{ margin: 0, fontSize: 13 }}>Already resolved</h3>
            <p style={{ margin: "6px 0 0 0", fontSize: 12.5 }}>
              {dispute.status === "resolved_refund"
                ? "Resolved — refund issued"
                : dispute.status === "resolved_no_action"
                  ? "Resolved — no action"
                  : "Closed"}
              {dispute.resolved_at ? ` · ${new Date(dispute.resolved_at).toLocaleString("en-IN")}` : ""}
            </p>
            {dispute.resolution_notes && (
              <p style={{ margin: "6px 0 0 0", fontSize: 12.5, color: "var(--cc-fg-muted)" }}>
                Notes: {dispute.resolution_notes}
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
