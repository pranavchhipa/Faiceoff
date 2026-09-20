/**
 * Generation detail — everything that produced one image, on one screen.
 *
 * Sections:
 *   1. The output — full-size image, plus the upscaled variant when it differs.
 *   2. The brief — structured_brief rendered as readable key/value rows (these
 *      are the Studio settings the brand actually picked), not a JSON dump.
 *   3. The prompt — assembled_prompt, copyable.
 *   4. Pipeline facts — version, attempts, retries, quality scores, OCR
 *      validation, stage-2 trigger, failure reason, compliance result.
 *   5. Creator decision — the approvals row, including rejection feedback.
 *   6. Licence — the licenses row and a link to the certificate.
 *   7. Links back to the collab / creator / brand inside the Control Centre.
 *
 * Read-only. Operator actions on wedged generations live in ../../moderation.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureCCAuth } from "../../_components/page-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/cc/audit";
import { getCurrentSession } from "@/lib/cc/session";
import { CopyBlock } from "../copy-block";
import {
  fmtMoney,
  fmtDateTime,
  relativeFrom,
  statusPillClass,
  approvalPillClass,
  humanKey,
  isHttpUrl,
} from "../shared";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ ccSlug: string; id: string }>;
}

/** Brief keys rendered specially or intentionally skipped from the generic pass. */
const BRIEF_IMAGE_KEYS = new Set(["product_image_url"]);

export default async function GenerationDetailPage({ params }: Props) {
  const { ccSlug, id } = await params;
  await ensureCCAuth(ccSlug);

  const session = await getCurrentSession();
  void logAudit({ action: "generation.open", sessionId: session?.id ?? null, payload: { id } });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: gen } = await admin.from("generations").select("*").eq("id", id).maybeSingle();
  if (!gen) notFound();

  const [creatorRes, brandRes, collabRes, approvalRes, licenseRes] = await Promise.all([
    gen.creator_id
      ? admin
          .from("creators")
          .select("id, user_id, instagram_handle, is_verified, city")
          .eq("id", gen.creator_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    gen.brand_id
      ? admin
          .from("brands")
          .select("id, user_id, company_name, is_verified")
          .eq("id", gen.brand_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    gen.collab_session_id
      ? admin
          .from("collab_sessions")
          .select("id, name, status, package_tier, package_price_paise, approved_count, final_images_target")
          .eq("id", gen.collab_session_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from("approvals")
      .select("id, status, feedback, decided_at, expires_at, created_at")
      .eq("generation_id", id)
      .maybeSingle(),
    admin
      .from("licenses")
      .select("id, status, scope, issued_at, expires_at, cert_url, amount_paid_paise, creator_share_paise, platform_share_paise")
      .eq("generation_id", id)
      .maybeSingle(),
  ]);

  const creator = creatorRes.data;
  const brand = brandRes.data;
  const collab = collabRes.data;
  const approval = approvalRes.data;
  const license = licenseRes.data;

  const profileUserIds = [creator?.user_id, brand?.user_id].filter(Boolean) as string[];
  const { data: profileUsers } = profileUserIds.length
    ? await admin.from("users").select("id, display_name, email").in("id", profileUserIds)
    : { data: [] };
  const userById = new Map<string, { display_name: string | null; email: string | null }>(
    ((profileUsers ?? []) as Array<{ id: string; display_name: string | null; email: string | null }>).map((u) => [
      u.id,
      { display_name: u.display_name, email: u.email },
    ]),
  );

  const creatorUser = creator?.user_id ? userById.get(creator.user_id) : null;
  const brandUser = brand?.user_id ? userById.get(brand.user_id) : null;
  const creatorName =
    creatorUser?.display_name ??
    (creator?.instagram_handle ? `@${creator.instagram_handle}` : null) ??
    (creator?.id ? `${creator.id.slice(0, 8)}…` : "—");
  const brandName =
    (brand?.company_name && brand.company_name.trim()) ||
    brandUser?.display_name ||
    (brand?.id ? `${brand.id.slice(0, 8)}…` : "—");

  const brief = (gen.structured_brief ?? {}) as Record<string, unknown>;
  const briefEntries = Object.entries(brief).filter(([k]) => !BRIEF_IMAGE_KEYS.has(k));
  const productImage = isHttpUrl(brief.product_image_url) ? (brief.product_image_url as string) : null;

  const hasUpscale = !!gen.upscaled_url && gen.upscaled_url !== gen.image_url;

  return (
    <>
      <div className="cc-page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1>Generation</h1>
          <p>
            <Link href={`/${ccSlug}/generations`} style={{ color: "var(--cc-accent)" }}>
              ← All generations
            </Link>{" "}
            · <span className="cc-monospace">{gen.id}</span> · {relativeFrom(gen.created_at)}
          </p>
        </div>
        <span className={`cc-pill ${statusPillClass(gen.status)}`}>{String(gen.status).replace(/_/g, " ")}</span>
      </div>

      <div className="cc-stack">
        {/* ── 1. Output ─────────────────────────────────────────────────── */}
        <div className="cc-card">
          <p className="cc-card-title">Output</p>
          {gen.image_url ? (
            <div className={hasUpscale ? "cc-grid cc-grid-2" : ""}>
              <ImageFrame label="Delivered image" url={gen.image_url} />
              {hasUpscale && <ImageFrame label="Upscaled variant" url={gen.upscaled_url} />}
            </div>
          ) : (
            <div
              style={{
                border: "1px dashed var(--cc-border-strong)",
                borderRadius: 4,
                padding: "28px 20px",
                textAlign: "center",
              }}
            >
              <p className="cc-monospace" style={{ margin: 0, fontSize: 10, letterSpacing: "0.16em", color: "var(--cc-fg-dim)" }}>
                NO IMAGE PRODUCED
              </p>
              <p style={{ margin: "8px 0 0 0", fontSize: 13, color: gen.failure_reason ? "var(--cc-bad)" : "var(--cc-fg-muted)" }}>
                {gen.failure_reason ??
                  (gen.status === "failed"
                    ? "Failed — no reason recorded (pre-00077 row, or the sweep killed it)."
                    : `Status is "${gen.status}" — nothing has been rendered yet.`)}
              </p>
            </div>
          )}

          <div
            className="cc-mono-cell"
            style={{ marginTop: 12, display: "grid", gridTemplateColumns: "auto 1fr", gap: "5px 16px", fontSize: 12 }}
          >
            <span style={{ color: "var(--cc-fg-dim)" }}>Cost</span>
            <span>{fmtMoney(gen.cost_paise)}</span>
            <span style={{ color: "var(--cc-fg-dim)" }}>Created</span>
            <span>{fmtDateTime(gen.created_at)}</span>
            <span style={{ color: "var(--cc-fg-dim)" }}>Last updated</span>
            <span>{fmtDateTime(gen.updated_at)}</span>
            {gen.delivery_url && (
              <>
                <span style={{ color: "var(--cc-fg-dim)" }}>Delivery URL</span>
                <a href={gen.delivery_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--cc-accent)", wordBreak: "break-all" }}>
                  {gen.delivery_url}
                </a>
              </>
            )}
          </div>
        </div>

        {/* ── 2. The brief the brand submitted ──────────────────────────── */}
        <div className="cc-card">
          <p className="cc-card-title">Studio brief — what the brand asked for</p>
          {briefEntries.length === 0 && !productImage ? (
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--cc-fg-dim)" }}>No brief recorded on this generation.</p>
          ) : (
            <>
              {productImage && (
                <div style={{ marginBottom: 14 }}>
                  <p className="cc-card-title" style={{ marginBottom: 6 }}>
                    Product image
                  </p>
                  <a href={productImage} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={productImage}
                      alt="product"
                      style={{
                        maxWidth: 200,
                        maxHeight: 200,
                        objectFit: "contain",
                        borderRadius: 4,
                        border: "1px solid var(--cc-border)",
                        background: "var(--cc-bg)",
                      }}
                    />
                  </a>
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "minmax(120px, 220px) 1fr", gap: "1px 0" }}>
                {briefEntries.map(([key, value]) => (
                  <BriefRow key={key} label={humanKey(key)} value={value} />
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── 3. The prompt actually sent to the model ──────────────────── */}
        <div className="cc-card">
          {gen.assembled_prompt ? (
            <CopyBlock label="Assembled prompt — final text sent to the model" text={String(gen.assembled_prompt)} maxHeight={360} />
          ) : (
            <>
              <p className="cc-card-title">Assembled prompt</p>
              <p style={{ margin: 0, fontSize: 12.5, color: "var(--cc-fg-dim)" }}>
                Not assembled — this generation never reached the prompt stage.
              </p>
            </>
          )}
        </div>

        {/* ── 4. Pipeline facts ─────────────────────────────────────────── */}
        <div className="cc-card">
          <p className="cc-card-title">Pipeline</p>
          <div
            className="cc-mono-cell"
            style={{ display: "grid", gridTemplateColumns: "minmax(120px, 220px) 1fr", gap: "5px 0", fontSize: 12.5 }}
          >
            <Fact label="Pipeline version" value={gen.pipeline_version} />
            <Fact label="Inference attempts" value={gen.generation_attempts} />
            <Fact label="Retry count" value={gen.retry_count} />
            <Fact label="Free retry" value={gen.is_free_retry === true ? "yes" : gen.is_free_retry === false ? "no" : null} />
            <Fact label="Stage 2 triggered by" value={gen.stage2_triggered_by} />
            <Fact label="Provider prediction id" value={gen.provider_prediction_id} />
            <Fact label="Failure reason" value={gen.failure_reason} bad />
          </div>

          {gen.quality_scores && (
            <div style={{ marginTop: 14 }}>
              <CopyBlock label="Quality scores" text={JSON.stringify(gen.quality_scores, null, 2)} maxHeight={220} />
            </div>
          )}
          {gen.ocr_validation_result && (
            <div style={{ marginTop: 14 }}>
              <CopyBlock label="OCR validation result" text={JSON.stringify(gen.ocr_validation_result, null, 2)} maxHeight={220} />
            </div>
          )}
          {gen.compliance_result && (
            <div style={{ marginTop: 14 }}>
              <CopyBlock label="Compliance result" text={JSON.stringify(gen.compliance_result, null, 2)} maxHeight={220} />
            </div>
          )}
        </div>

        {/* ── 5. Creator decision ───────────────────────────────────────── */}
        <div className="cc-card">
          <p className="cc-card-title">Creator decision</p>
          {!approval ? (
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--cc-fg-dim)" }}>
              Never sent to the creator — no approval row exists for this generation.
            </p>
          ) : (
            <>
              <div className="cc-row" style={{ marginBottom: 10 }}>
                <span className={`cc-pill ${approvalPillClass(approval.status)}`}>{approval.status}</span>
                <span style={{ fontSize: 12.5, color: "var(--cc-fg-muted)" }}>
                  by {creatorName}
                  {approval.decided_at ? ` · ${fmtDateTime(approval.decided_at)}` : ""}
                </span>
              </div>
              <div
                className="cc-mono-cell"
                style={{ display: "grid", gridTemplateColumns: "minmax(120px, 220px) 1fr", gap: "5px 0", fontSize: 12.5 }}
              >
                <Fact label="Sent to creator" value={fmtDateTime(approval.created_at)} />
                <Fact label="Decision deadline" value={fmtDateTime(approval.expires_at)} />
                <Fact label="Decided" value={approval.decided_at ? fmtDateTime(approval.decided_at) : "not yet"} />
              </div>
              {approval.feedback && (
                <div style={{ marginTop: 12 }}>
                  <p className="cc-card-title" style={{ marginBottom: 6 }}>
                    Creator feedback
                  </p>
                  <p
                    style={{
                      margin: 0,
                      padding: "10px 12px",
                      background: "var(--cc-bg)",
                      border: "1px solid var(--cc-border)",
                      borderRadius: 4,
                      fontSize: 12.5,
                      color: approval.status === "rejected" ? "var(--cc-bad)" : "var(--cc-fg)",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {approval.feedback}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── 6. Licence ────────────────────────────────────────────────── */}
        <div className="cc-card">
          <p className="cc-card-title">Licence</p>
          {!license ? (
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--cc-fg-dim)" }}>
              No licence issued. A licence is only minted when the creator approves the image.
            </p>
          ) : (
            <>
              <div className="cc-row" style={{ marginBottom: 10 }}>
                <span className={`cc-pill ${license.status === "active" ? "cc-pill-ok" : "cc-pill-neutral"}`}>
                  {license.status ?? "—"}
                </span>
                <span className="cc-monospace" style={{ fontSize: 11.5, color: "var(--cc-fg-muted)" }}>
                  {license.id}
                </span>
              </div>
              <div
                className="cc-mono-cell"
                style={{ display: "grid", gridTemplateColumns: "minmax(120px, 220px) 1fr", gap: "5px 0", fontSize: 12.5 }}
              >
                <Fact label="Scope" value={license.scope} />
                <Fact label="Issued" value={fmtDateTime(license.issued_at)} />
                <Fact label="Expires" value={fmtDateTime(license.expires_at)} />
                <Fact label="Brand paid" value={fmtMoney(license.amount_paid_paise)} />
                <Fact label="Creator share" value={fmtMoney(license.creator_share_paise)} />
                <Fact label="Platform share" value={fmtMoney(license.platform_share_paise)} />
              </div>
              {license.cert_url && (
                <a
                  href={license.cert_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cc-btn"
                  style={{ marginTop: 12, display: "inline-flex" }}
                >
                  Open certificate PDF
                </a>
              )}
            </>
          )}
        </div>

        {/* ── 7. Who / where ────────────────────────────────────────────── */}
        <div className="cc-grid cc-grid-3">
          <div className="cc-card">
            <p className="cc-card-title">Creator</p>
            <p style={{ margin: "0 0 4px 0", fontSize: 13 }}>{creatorName}</p>
            <p style={{ margin: 0, fontSize: 11.5, color: "var(--cc-fg-muted)" }}>
              {creatorUser?.email ?? "—"}
              {creator?.city ? ` · ${creator.city}` : ""}
            </p>
            {creator?.is_verified && (
              <span className="cc-pill cc-pill-ok" style={{ marginTop: 8 }}>
                Verified ✓
              </span>
            )}
            {creator?.user_id && (
              <Link
                href={`/${ccSlug}/users/${creator.user_id}`}
                className="cc-btn"
                style={{ marginTop: 10, display: "inline-flex", fontSize: 11 }}
              >
                Open creator →
              </Link>
            )}
          </div>

          <div className="cc-card">
            <p className="cc-card-title">Brand</p>
            <p style={{ margin: "0 0 4px 0", fontSize: 13 }}>{brandName}</p>
            <p style={{ margin: 0, fontSize: 11.5, color: "var(--cc-fg-muted)" }}>{brandUser?.email ?? "—"}</p>
            {brand?.is_verified && (
              <span className="cc-pill cc-pill-ok" style={{ marginTop: 8 }}>
                Verified ✓
              </span>
            )}
            {brand?.user_id && (
              <Link
                href={`/${ccSlug}/users/${brand.user_id}`}
                className="cc-btn"
                style={{ marginTop: 10, display: "inline-flex", fontSize: 11 }}
              >
                Open brand →
              </Link>
            )}
          </div>

          <div className="cc-card">
            <p className="cc-card-title">Collab</p>
            {!collab ? (
              <p style={{ margin: 0, fontSize: 12.5, color: "var(--cc-fg-dim)" }}>Not linked to a collab session.</p>
            ) : (
              <>
                <p style={{ margin: "0 0 4px 0", fontSize: 13 }}>{collab.name ?? `${collab.id.slice(0, 8)}…`}</p>
                <p className="cc-mono-cell" style={{ margin: 0, fontSize: 11.5, color: "var(--cc-fg-muted)" }}>
                  {collab.package_tier ?? "—"} · {fmtMoney(collab.package_price_paise)} ·{" "}
                  {collab.approved_count ?? 0}
                  {collab.final_images_target ? `/${collab.final_images_target}` : ""} approved
                </p>
                <span className={`cc-pill ${collab.status === "active" ? "cc-pill-ok" : "cc-pill-neutral"}`} style={{ marginTop: 8 }}>
                  {collab.status}
                </span>
                <div className="cc-row" style={{ marginTop: 10, flexWrap: "wrap" }}>
                  <Link href={`/${ccSlug}/collabs`} className="cc-btn" style={{ fontSize: 11 }}>
                    All collabs →
                  </Link>
                  <Link
                    href={`/${ccSlug}/generations?collab=${collab.id}`}
                    className="cc-btn"
                    style={{ fontSize: 11 }}
                  >
                    All images in this collab →
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function ImageFrame({ label, url }: { label: string; url: string }) {
  return (
    <div>
      <p className="cc-card-title" style={{ marginBottom: 6 }}>
        {label}
      </p>
      <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: "block" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={label}
          style={{
            width: "100%",
            maxHeight: 520,
            objectFit: "contain",
            borderRadius: 4,
            border: "1px solid var(--cc-border)",
            background: "var(--cc-bg)",
          }}
        />
      </a>
    </div>
  );
}

/** One key/value row inside a facts grid. */
function Fact({ label, value, bad }: { label: string; value: unknown; bad?: boolean }) {
  const empty = value == null || value === "";
  return (
    <>
      <span style={{ color: "var(--cc-fg-dim)", padding: "3px 0" }}>{label}</span>
      <span style={{ padding: "3px 0", color: empty ? "var(--cc-fg-dim)" : bad ? "var(--cc-bad)" : "var(--cc-fg)", wordBreak: "break-word" }}>
        {empty ? "—" : String(value)}
      </span>
    </>
  );
}

/**
 * One brief field. Scalars render inline; objects/arrays (label_bbox etc.)
 * render as compact JSON so nothing in the brief is silently dropped.
 */
function BriefRow({ label, value }: { label: string; value: unknown }) {
  let rendered: React.ReactNode;

  if (value == null || value === "") {
    rendered = <span style={{ color: "var(--cc-fg-dim)" }}>—</span>;
  } else if (typeof value === "boolean") {
    rendered = <span className={`cc-pill ${value ? "cc-pill-info" : "cc-pill-neutral"}`}>{value ? "on" : "off"}</span>;
  } else if (typeof value === "object") {
    rendered = (
      <code
        style={{
          fontFamily: "var(--cc-mono)",
          fontSize: 11.5,
          color: "var(--cc-fg-muted)",
          wordBreak: "break-word",
        }}
      >
        {JSON.stringify(value)}
      </code>
    );
  } else if (isHttpUrl(value)) {
    rendered = (
      <a href={value} target="_blank" rel="noopener noreferrer" style={{ color: "var(--cc-accent)", wordBreak: "break-all" }}>
        {value}
      </a>
    );
  } else {
    rendered = <span style={{ whiteSpace: "pre-wrap" }}>{String(value)}</span>;
  }

  return (
    <>
      <span
        style={{
          color: "var(--cc-fg-dim)",
          fontSize: 12,
          padding: "7px 12px 7px 0",
          borderBottom: "1px solid var(--cc-border)",
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 12.5, padding: "7px 0", borderBottom: "1px solid var(--cc-border)" }}>{rendered}</span>
    </>
  );
}
