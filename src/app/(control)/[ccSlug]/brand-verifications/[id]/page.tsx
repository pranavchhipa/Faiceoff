/**
 * Brand verification detail — operator reviews one brand's GST details (pulled
 * from the GSTVerify API), the uploaded GST certificate, and approves / rejects.
 *
 * GST fields are locked, API-pulled values (legal name, trade name, status,
 * address, constitution, etc.). The certificate lives in the private
 * 'brand-documents' bucket and is rendered via a short-lived signed URL, mirroring
 * how the creator verification detail page renders kyc-documents.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureCCAuth } from "../../_components/page-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/cc/audit";
import { getCurrentSession } from "@/lib/cc/session";
import { approveBrandVerification, rejectBrandVerification } from "../actions";

export const dynamic = "force-dynamic";

const BRAND_DOCS_BUCKET = "brand-documents";

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

  // Short-lived signed URL for the uploaded GST certificate (private bucket).
  let certUrl: string | null = null;
  if (ver.gst_certificate_path) {
    const { data: signed } = await admin.storage
      .from(BRAND_DOCS_BUCKET)
      .createSignedUrl(ver.gst_certificate_path, 600);
    certUrl = signed?.signedUrl ?? null;
  }

  const gstStatusRaw = (ver.gst_status ?? "").toString();
  const gstStatusLc = gstStatusRaw.toLowerCase();
  const gstStatusClass = gstStatusLc === "active"
    ? "cc-pill-ok"
    : gstStatusLc === "cancelled" || gstStatusLc === "suspended" || gstStatusLc === "inactive"
      ? "cc-pill-bad"
      : "cc-pill-warn";

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

        {/* GST — pulled from GSTVerify (locked, API-pulled fields) */}
        <div className="cc-card">
          <h3 style={{ margin: 0, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            GST (pulled from GSTVerify)
            <span className="cc-pill cc-pill-neutral" style={{ fontSize: 10, fontWeight: 600 }}>locked</span>
          </h3>
          <div className="cc-kv" style={{ marginTop: 10, display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px", fontSize: 12.5 }}>
            <span style={{ color: "var(--cc-fg-dim)" }}>GST number</span>
            <span>{ver.gst_number ?? "—"}</span>
            <span style={{ color: "var(--cc-fg-dim)" }}>Status</span>
            <span>
              {gstStatusRaw ? (
                <span className={`cc-pill ${gstStatusClass}`}>{gstStatusRaw}</span>
              ) : (
                "—"
              )}
            </span>
            <span style={{ color: "var(--cc-fg-dim)" }}>Legal name</span>
            <span>{ver.gst_legal_name ?? "—"}</span>
            <span style={{ color: "var(--cc-fg-dim)" }}>Trade name</span>
            <span>{ver.gst_trade_name ?? "—"}</span>
            <span style={{ color: "var(--cc-fg-dim)" }}>PAN number</span>
            <span>{ver.pan_number ?? "—"}</span>
            <span style={{ color: "var(--cc-fg-dim)" }}>Constitution</span>
            <span>{ver.gst_constitution ?? "—"}</span>
            <span style={{ color: "var(--cc-fg-dim)" }}>Taxpayer type</span>
            <span>{ver.gst_taxpayer_type ?? "—"}</span>
            <span style={{ color: "var(--cc-fg-dim)" }}>Registration date</span>
            <span>{ver.gst_registration_date ?? "—"}</span>
            <span style={{ color: "var(--cc-fg-dim)" }}>Registered address</span>
            <span style={{ whiteSpace: "pre-wrap" }}>{ver.gst_address ?? "—"}</span>
          </div>
        </div>

        {/* GST certificate (uploaded → private bucket → signed URL) */}
        <div className="cc-card">
          <h3 style={{ margin: 0, fontSize: 13 }}>GST certificate</h3>
          {!ver.gst_certificate_path ? (
            <p style={{ margin: "8px 0 0 0", fontSize: 12.5, color: "var(--cc-fg-dim)" }}>Not uploaded.</p>
          ) : ver.gst_certificate_path.toLowerCase().endsWith(".pdf") ? (
            <a
              href={certUrl ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="cc-btn"
              style={{ marginTop: 10, display: "inline-block", fontSize: 12 }}
            >
              Open certificate
            </a>
          ) : certUrl ? (
            <a href={certUrl} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginTop: 10 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={certUrl}
                alt="GST certificate"
                style={{ width: "100%", maxHeight: 360, objectFit: "contain", borderRadius: 8, border: "1px solid var(--cc-border)", background: "var(--cc-bg-2)" }}
              />
            </a>
          ) : (
            <p style={{ margin: "8px 0 0 0", fontSize: 12.5, color: "var(--cc-fg-dim)" }}>Could not load certificate.</p>
          )}
        </div>

        {/* Raw GSTVerify API response (audit) */}
        {ver.gst_api_response != null && (
          <div className="cc-card">
            <details>
              <summary style={{ cursor: "pointer", fontSize: 12.5, color: "var(--cc-fg-dim)", userSelect: "none" }}>
                Raw GSTVerify API response (audit)
              </summary>
              <pre
                style={{
                  marginTop: 10,
                  padding: 12,
                  fontSize: 11.5,
                  lineHeight: 1.5,
                  overflowX: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  background: "var(--cc-bg-2)",
                  border: "1px solid var(--cc-border)",
                  borderRadius: 8,
                  color: "var(--cc-fg)",
                }}
              >
                {JSON.stringify(ver.gst_api_response, null, 2)}
              </pre>
            </details>
          </div>
        )}

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
