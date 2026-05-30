/**
 * Verification detail — operator reviews one creator's Aadhaar + PAN, checks
 * the Instagram follow, and approves / rejects.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureCCAuth } from "../../_components/page-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/cc/audit";
import { getCurrentSession } from "@/lib/cc/session";
import { approveVerification, rejectVerification } from "../actions";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ ccSlug: string; id: string }>;
}

const BUCKET = "kyc-documents";

export default async function VerificationDetailPage({ params }: Props) {
  const { ccSlug, id } = await params;
  await ensureCCAuth(ccSlug);

  const session = await getCurrentSession();
  void logAudit({ action: "verification.open", sessionId: session?.id ?? null, payload: { id } });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: ver } = await admin
    .from("creator_verifications")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!ver) notFound();

  const { data: creator } = await admin
    .from("creators")
    .select("id, user_id, instagram_handle, instagram_followers, is_verified, city, bio, onboarding_step")
    .eq("id", ver.creator_id)
    .maybeSingle();
  const { data: user } = creator
    ? await admin.from("users").select("display_name, email").eq("id", creator.user_id).maybeSingle()
    : { data: null };

  // Short-lived signed URLs for the docs (private bucket).
  const paths = [ver.aadhaar_path, ver.pan_path].filter(Boolean) as string[];
  const signed: Record<string, string> = {};
  if (paths.length) {
    const { data: urls } = await admin.storage.from(BUCKET).createSignedUrls(paths, 60 * 10);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const u of (urls ?? []) as any[]) {
      if (u.signedUrl && u.path) signed[u.path] = u.signedUrl;
    }
  }

  const aadhaarUrl = ver.aadhaar_path ? signed[ver.aadhaar_path] : null;
  const panUrl = ver.pan_path ? signed[ver.pan_path] : null;
  const isPending = ver.status === "pending";

  return (
    <>
      <div className="cc-page-header">
        <div>
          <h1>Verification review</h1>
          <p>
            <Link href={`/${ccSlug}/verifications`} style={{ color: "var(--cc-accent)" }}>
              ← All verifications
            </Link>{" "}
            · {id.slice(0, 8)}…
          </p>
        </div>
        <span className={`cc-pill ${ver.status === "verified" ? "cc-pill-ok" : ver.status === "rejected" ? "cc-pill-bad" : "cc-pill-warn"}`}>
          {ver.status}
        </span>
      </div>

      <div className="cc-stack">
        {/* Creator summary */}
        <div className="cc-card">
          <h3 style={{ margin: 0, fontSize: 13 }}>{user?.display_name ?? "Creator"}</h3>
          <div className="cc-kv" style={{ marginTop: 10, display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 16px", fontSize: 12.5 }}>
            <span style={{ color: "var(--cc-fg-dim)" }}>Email</span>
            <span>{user?.email ?? "—"}</span>
            <span style={{ color: "var(--cc-fg-dim)" }}>Instagram</span>
            <span>
              {creator?.instagram_handle ? `@${creator.instagram_handle}` : "—"}
              {creator?.instagram_followers ? ` · ${creator.instagram_followers.toLocaleString("en-IN")} followers` : ""}
              {"  "}
              <span className={`cc-pill ${ver.instagram_followed ? "cc-pill-ok" : "cc-pill-bad"}`}>
                {ver.instagram_followed ? "follow confirmed" : "not confirmed"}
              </span>
            </span>
            <span style={{ color: "var(--cc-fg-dim)" }}>City</span>
            <span>{creator?.city ?? "—"}</span>
            <span style={{ color: "var(--cc-fg-dim)" }}>Onboarding</span>
            <span>{creator?.onboarding_step ?? "—"}</span>
            <span style={{ color: "var(--cc-fg-dim)" }}>Submitted</span>
            <span>{ver.submitted_at ? new Date(ver.submitted_at).toLocaleString("en-IN") : "—"}</span>
          </div>
        </div>

        {/* Documents */}
        <div className="cc-grid cc-grid-2">
          <DocCard label="Aadhaar" path={ver.aadhaar_path} url={aadhaarUrl} />
          <DocCard label="PAN" path={ver.pan_path} url={panUrl} />
        </div>

        {/* Decision */}
        {isPending ? (
          <div className="cc-card">
            <h3 style={{ margin: 0, fontSize: 13 }}>Decision</h3>
            <p style={{ margin: "4px 0 14px 0", fontSize: 12, color: "var(--cc-fg-dim)" }}>
              Approve grants the gold tick + unlocks payouts. Reject records a reason the creator sees.
            </p>
            <div className="cc-grid cc-grid-2" style={{ alignItems: "start" }}>
              <form action={approveVerification}>
                <input type="hidden" name="verification_id" value={id} />
                <input type="hidden" name="cc_slug" value={ccSlug} />
                <button type="submit" className="cc-btn" style={{ background: "var(--cc-ok)", color: "#06210f", borderColor: "var(--cc-ok)", fontWeight: 700, width: "100%" }}>
                  ✓ Approve & grant gold tick
                </button>
              </form>
              <form action={rejectVerification} className="cc-stack" style={{ gap: 8 }}>
                <input type="hidden" name="verification_id" value={id} />
                <input type="hidden" name="cc_slug" value={ccSlug} />
                <textarea
                  name="reason"
                  rows={2}
                  placeholder="Reason for rejection (creator sees this)…"
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

function DocCard({ label, path, url }: { label: string; path: string | null; url: string | null }) {
  const isPdf = path?.toLowerCase().endsWith(".pdf");
  return (
    <div className="cc-card">
      <h3 style={{ margin: 0, fontSize: 13 }}>{label}</h3>
      {!path ? (
        <p style={{ margin: "8px 0 0 0", fontSize: 12.5, color: "var(--cc-fg-dim)" }}>Not provided.</p>
      ) : isPdf ? (
        <a href={url ?? "#"} target="_blank" rel="noopener noreferrer" className="cc-btn" style={{ marginTop: 10, display: "inline-block", fontSize: 12 }}>
          Open PDF
        </a>
      ) : url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginTop: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={label}
            style={{ width: "100%", maxHeight: 320, objectFit: "contain", borderRadius: 8, border: "1px solid var(--cc-border)", background: "var(--cc-bg-2)" }}
          />
        </a>
      ) : (
        <p style={{ margin: "8px 0 0 0", fontSize: 12.5, color: "var(--cc-fg-dim)" }}>Could not load document.</p>
      )}
    </div>
  );
}
