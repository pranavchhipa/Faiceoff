/**
 * Brand verification detail — operator reviews one brand's typed GST + PAN +
 * company details and approves / rejects.
 *
 * Unlike creators, brands submit TYPED business values (no document uploads),
 * so we render the text values cleanly — no signed-URL doc rendering.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureCCAuth } from "../../_components/page-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/cc/audit";
import { getCurrentSession } from "@/lib/cc/session";
import { approveBrandVerification, rejectBrandVerification } from "../actions";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ ccSlug: string; id: string }>;
}

export default async function BrandVerificationDetailPage({ params }: Props) {
  const { ccSlug, id } = await params;
  await ensureCCAuth(ccSlug);

  const session = await getCurrentSession();
  void logAudit({ action: "brand_verification.open", sessionId: session?.id ?? null, payload: { id } });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: ver } = await admin
    .from("brand_verifications")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!ver) notFound();

  const { data: brand } = await admin
    .from("brands")
    .select("id, user_id, company_name, gst_number, is_verified")
    .eq("id", ver.brand_id)
    .maybeSingle();
  const { data: user } = brand
    ? await admin.from("users").select("display_name, email").eq("id", brand.user_id).maybeSingle()
    : { data: null };

  const isPending = ver.status === "pending";
  const brandName = ver.company_name ?? brand?.company_name ?? user?.display_name ?? "Brand";

  return (
    <>
      <div className="cc-page-header">
        <div>
          <h1>Brand verification review</h1>
          <p>
            <Link href={`/${ccSlug}/brand-verifications`} style={{ color: "var(--cc-accent)" }}>
              ← All brand verifications
            </Link>{" "}
            · {id.slice(0, 8)}…
          </p>
        </div>
        <span className={`cc-pill ${ver.status === "verified" ? "cc-pill-ok" : ver.status === "rejected" ? "cc-pill-bad" : "cc-pill-warn"}`}>
          {ver.status}
        </span>
      </div>

      <div className="cc-stack">
        {/* Brand summary */}
        <div className="cc-card">
          <h3 style={{ margin: 0, fontSize: 13 }}>{brandName}</h3>
          <div className="cc-kv" style={{ marginTop: 10, display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 16px", fontSize: 12.5 }}>
            <span style={{ color: "var(--cc-fg-dim)" }}>Email</span>
            <span>{user?.email ?? "—"}</span>
            <span style={{ color: "var(--cc-fg-dim)" }}>Brand verified</span>
            <span>
              <span className={`cc-pill ${brand?.is_verified ? "cc-pill-ok" : "cc-pill-neutral"}`}>
                {brand?.is_verified ? "verified" : "unverified"}
              </span>
            </span>
            <span style={{ color: "var(--cc-fg-dim)" }}>Submitted</span>
            <span>{ver.submitted_at ? new Date(ver.submitted_at).toLocaleString("en-IN") : "—"}</span>
          </div>
        </div>

        {/* Submitted business details (typed values, no documents) */}
        <div className="cc-card">
          <h3 style={{ margin: 0, fontSize: 13 }}>Submitted business details</h3>
          <div className="cc-kv" style={{ marginTop: 10, display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px", fontSize: 12.5 }}>
            <span style={{ color: "var(--cc-fg-dim)" }}>GST number</span>
            <span>{ver.gst_number ?? "—"}</span>
            <span style={{ color: "var(--cc-fg-dim)" }}>PAN number</span>
            <span>{ver.pan_number ?? "—"}</span>
            <span style={{ color: "var(--cc-fg-dim)" }}>Company name</span>
            <span>{ver.company_name ?? "—"}</span>
            <span style={{ color: "var(--cc-fg-dim)" }}>Legal name</span>
            <span>{ver.legal_name ?? "—"}</span>
            <span style={{ color: "var(--cc-fg-dim)" }}>Registered address</span>
            <span style={{ whiteSpace: "pre-wrap" }}>{ver.registered_address ?? "—"}</span>
          </div>
        </div>

        {/* Decision */}
        {isPending ? (
          <div className="cc-card">
            <h3 style={{ margin: 0, fontSize: 13 }}>Decision</h3>
            <p style={{ margin: "4px 0 14px 0", fontSize: 12, color: "var(--cc-fg-dim)" }}>
              Approve marks the brand verified + unblocks collaborating with creators. Reject records a reason the brand sees.
            </p>
            <div className="cc-grid cc-grid-2" style={{ alignItems: "start" }}>
              <form action={approveBrandVerification}>
                <input type="hidden" name="verification_id" value={id} />
                <input type="hidden" name="cc_slug" value={ccSlug} />
                <button type="submit" className="cc-btn" style={{ background: "var(--cc-ok)", color: "#06210f", borderColor: "var(--cc-ok)", fontWeight: 700, width: "100%" }}>
                  ✓ Approve & verify brand
                </button>
              </form>
              <form action={rejectBrandVerification} className="cc-stack" style={{ gap: 8 }}>
                <input type="hidden" name="verification_id" value={id} />
                <input type="hidden" name="cc_slug" value={ccSlug} />
                <textarea
                  name="reason"
                  rows={2}
                  placeholder="Reason for rejection (brand sees this)…"
                  className="cc-input"
                  style={{ width: "100%", resize: "vertical", fontSize: 12.5 }}
                />
                <button type="submit" className="cc-btn" style={{ borderColor: "var(--cc-bad)", color: "var(--cc-bad)", fontWeight: 700 }}>
                  Reject
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="cc-card">
            <h3 style={{ margin: 0, fontSize: 13 }}>Already reviewed</h3>
            <p style={{ margin: "6px 0 0 0", fontSize: 12.5 }}>
              {ver.status === "verified" ? "Approved" : "Rejected"}
              {ver.reviewed_at ? ` · ${new Date(ver.reviewed_at).toLocaleString("en-IN")}` : ""}
              {ver.reviewed_by ? ` · by ${ver.reviewed_by}` : ""}
            </p>
            {ver.rejection_reason && (
              <p style={{ margin: "6px 0 0 0", fontSize: 12.5, color: "var(--cc-bad)" }}>
                Reason: {ver.rejection_reason}
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
