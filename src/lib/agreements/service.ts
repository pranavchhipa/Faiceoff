/**
 * Collaboration Agreement service — orchestration over the `collab_agreements`
 * table. All writes use the admin (service-role) client passed in by the API
 * route; reads for public verification create their own admin client.
 *
 * Lifecycle:
 *   createDraftAgreementOnAccept  — creator signs at accept → 'pending_brand'
 *   finalizeAgreementOnPayment    — brand signs at payment  → 'active' + PDF
 *   cancelAgreementForRequest     — request declined/expired → 'cancelled'
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { buildAgreementTerms } from "./terms";
import { generateCollabAgreementPDF } from "./agreement-pdf";
import { uploadAgreementPDF, normalizeAgreementUrl } from "./storage";
import { computeShares } from "./terms";
import { AGREEMENT_VERSION } from "./clauses";
import {
  sendCreatorAgreementSigned,
  sendBrandAgreementSigned,
} from "@/lib/email/transactional";
import { emitNotification } from "@/lib/notifications/emit";
import type {
  CollabAgreement,
  AgreementWithParties,
  PublicAgreementStatus,
} from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

/** Snapshot fields needed from a collab_requests row to draft an agreement. */
export interface RequestSnapshot {
  id: string;
  brand_id: string;
  creator_id: string;
  package_tier: string;
  package_price_paise: number;
  final_images: number;
  gen_credits?: number | null;
  usage_scope: string;
  license_duration_days: number;
  product_name: string;
}

// ── Create draft on creator accept ───────────────────────────────────────────

/**
 * Create (or re-sign) the agreement when the creator accepts the request.
 * Captures the creator's electronic signature. Idempotent on the unique
 * (collab_request_id) constraint — re-accepting fills the creator signature if
 * it was somehow missing, but never overwrites an existing signature.
 *
 * Never throws — agreement creation must not block the accept flow. Returns the
 * agreement id on success, or null on failure (logged).
 */
export async function createDraftAgreementOnAccept(args: {
  admin: Admin;
  request: RequestSnapshot;
  creatorSignedName: string;
  creatorSignedIp: string | null;
}): Promise<string | null> {
  const { admin, request, creatorSignedName, creatorSignedIp } = args;

  try {
    // Already exists? (idempotent re-accept / retry)
    const { data: existing } = await admin
      .from("collab_agreements")
      .select("id, creator_signed_name, status")
      .eq("collab_request_id", request.id)
      .maybeSingle();

    if (existing) {
      if (!existing.creator_signed_name) {
        await admin
          .from("collab_agreements")
          .update({
            creator_signed_name: creatorSignedName,
            creator_signed_at: new Date().toISOString(),
            creator_signed_ip: creatorSignedIp,
          })
          .eq("id", existing.id);
      }
      return existing.id as string;
    }

    const { creator_share_paise, platform_share_paise } = computeShares(
      request.package_price_paise,
    );

    const { data: inserted, error } = await admin
      .from("collab_agreements")
      .insert({
        collab_request_id: request.id,
        brand_id: request.brand_id,
        creator_id: request.creator_id,
        agreement_version: AGREEMENT_VERSION,
        package_tier: request.package_tier,
        package_price_paise: request.package_price_paise,
        final_images: request.final_images,
        usage_scope: request.usage_scope,
        license_duration_days: request.license_duration_days,
        product_name: request.product_name,
        creator_share_paise,
        platform_share_paise,
        creator_signed_name: creatorSignedName,
        creator_signed_at: new Date().toISOString(),
        creator_signed_ip: creatorSignedIp,
        status: "pending_brand",
      })
      .select("id")
      .single();

    if (error) {
      console.error("[agreements] draft create failed", error);
      return null;
    }
    return inserted.id as string;
  } catch (err) {
    console.error("[agreements] draft create threw", err);
    return null;
  }
}

// ── Finalize on brand payment ────────────────────────────────────────────────

/**
 * Record the brand's signature, link the collab session, and flip the
 * agreement to 'active'. FAST + synchronous — call this inline in the
 * confirm-payment path before responding so the collab detail card shows an
 * active, dual-signed agreement immediately.
 *
 * Does NOT render the PDF (that is slow) — defer `renderAndStorePDF` to
 * `after()`. Idempotent + never throws. Returns the (post-update) agreement row
 * so the caller can hand it to the deferred PDF render.
 */
export async function signBrandAndActivate(args: {
  admin: Admin;
  requestId: string;
  sessionId: string;
  brandSignedName: string;
  brandSignedIp: string | null;
}): Promise<CollabAgreement | null> {
  const { admin, requestId, sessionId, brandSignedName, brandSignedIp } = args;

  try {
    const { data: agreement } = await admin
      .from("collab_agreements")
      .select("*")
      .eq("collab_request_id", requestId)
      .maybeSingle();

    if (!agreement) {
      console.warn("[agreements] activate: no agreement for request", requestId);
      return null;
    }

    // Already finalized with a PDF — nothing to do.
    if (agreement.status === "active" && agreement.pdf_url) {
      return agreement as CollabAgreement;
    }

    const brandUpdate: Record<string, unknown> = {
      collab_session_id: sessionId,
      status: "active",
    };
    // Only set the brand signature once (idempotent on retries / webhook).
    if (!agreement.brand_signed_name) {
      brandUpdate.brand_signed_name = brandSignedName;
      brandUpdate.brand_signed_at = new Date().toISOString();
      brandUpdate.brand_signed_ip = brandSignedIp;
    }

    const { data: updated } = await admin
      .from("collab_agreements")
      .update(brandUpdate)
      .eq("id", agreement.id)
      .select("*")
      .single();

    return (updated ?? { ...agreement, ...brandUpdate }) as CollabAgreement;
  } catch (err) {
    console.error("[agreements] activate threw", err);
    return null;
  }
}

/**
 * Full finalize (activate + render PDF) in one call. Kept for callers that want
 * a single synchronous step (e.g. backfills). The hot payment path should use
 * `signBrandAndActivate` inline + `renderAndStorePDF` in after() instead.
 */
export async function finalizeAgreementOnPayment(args: {
  admin: Admin;
  requestId: string;
  sessionId: string;
  brandSignedName: string;
  brandSignedIp: string | null;
}): Promise<{ ok: boolean; agreementId: string | null }> {
  const row = await signBrandAndActivate(args);
  if (!row) return { ok: false, agreementId: null };
  if (!(row.status === "active" && row.pdf_url)) {
    await renderAndStorePDF(args.admin, row);
  }
  return { ok: true, agreementId: row.id };
}

/**
 * Render the agreement PDF and persist its URL + SHA-256. Fetches party display
 * fields. Best-effort: logs and swallows errors so it never breaks the caller.
 * Safe to run inside `after()`.
 */
export async function renderAndStorePDF(admin: Admin, row: CollabAgreement): Promise<void> {
  try {
    const [creatorRes, brandRes] = await Promise.all([
      admin.from("creators").select("user_id, instagram_handle").eq("id", row.creator_id).maybeSingle(),
      admin.from("brands").select("company_name, gst_number").eq("id", row.brand_id).maybeSingle(),
    ]);

    let creatorName = "Creator";
    if (creatorRes.data?.user_id) {
      const { data: cu } = await admin
        .from("users").select("display_name").eq("id", creatorRes.data.user_id).maybeSingle();
      creatorName = cu?.display_name ?? "Creator";
    }

    const terms = buildAgreementTerms({
      package_tier: row.package_tier,
      package_price_paise: row.package_price_paise,
      final_images: row.final_images,
      usage_scope: row.usage_scope,
      license_duration_days: row.license_duration_days,
      product_name: row.product_name,
    });

    const { buffer, sha256 } = await generateCollabAgreementPDF({
      agreement: row,
      terms,
      creator: {
        display_name: creatorName,
        instagram_handle: creatorRes.data?.instagram_handle ?? null,
      },
      brand: {
        company_name: brandRes.data?.company_name ?? "Brand",
        gst_number: brandRes.data?.gst_number ?? null,
      },
    });

    const { url } = await uploadAgreementPDF({ buffer, agreementId: row.id });

    await admin
      .from("collab_agreements")
      .update({ pdf_url: url, pdf_sha256: sha256 })
      .eq("id", row.id);
  } catch (err) {
    console.error("[agreements] PDF render/store failed (non-fatal)", err);
  }
}

/**
 * Email + in-app notify BOTH parties that the Collaboration Agreement is signed
 * and active. Best-effort, never throws. Call inside after() right after the
 * agreement transitions to active (alongside renderAndStorePDF).
 */
export async function notifyAgreementActivated(
  admin: Admin,
  agreement: CollabAgreement,
): Promise<void> {
  try {
    const [creatorRes, brandRes] = await Promise.all([
      admin.from("creators").select("user_id").eq("id", agreement.creator_id).maybeSingle(),
      admin.from("brands").select("company_name, user_id").eq("id", agreement.brand_id).maybeSingle(),
    ]);

    const brandName = brandRes.data?.company_name ?? "the brand";
    const sessionId = agreement.collab_session_id ?? "";

    const [creatorUser, brandUser] = await Promise.all([
      creatorRes.data?.user_id
        ? admin.from("users").select("email, display_name").eq("id", creatorRes.data.user_id).maybeSingle()
        : Promise.resolve({ data: null }),
      brandRes.data?.user_id
        ? admin.from("users").select("email").eq("id", brandRes.data.user_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const creatorName = creatorUser.data?.display_name ?? "Creator";

    // ── Creator: email + in-app ──
    if (creatorUser.data?.email) {
      await sendCreatorAgreementSigned({
        to: creatorUser.data.email,
        creatorName,
        brandName,
        productName: agreement.product_name,
        collabSessionId: sessionId,
        agreementId: agreement.id,
      });
    }
    if (creatorRes.data?.user_id) {
      await emitNotification(admin, {
        userId: creatorRes.data.user_id,
        type: "collab_agreement",
        title: `Agreement signed with ${brandName}`,
        body: `Your Collaboration Agreement for "${agreement.product_name}" is active.`,
        href: sessionId ? `/creator/collabs/${sessionId}` : "/creator/collabs",
      });
    }

    // ── Brand: email + in-app ──
    if (brandUser.data?.email) {
      await sendBrandAgreementSigned({
        to: brandUser.data.email,
        brandName,
        creatorName,
        productName: agreement.product_name,
        collabSessionId: sessionId,
        agreementId: agreement.id,
      });
    }
    if (brandRes.data?.user_id) {
      await emitNotification(admin, {
        userId: brandRes.data.user_id,
        type: "collab_agreement",
        title: `Agreement active with ${creatorName}`,
        body: `Your Collaboration Agreement for "${agreement.product_name}" is signed — Studio is unlocked.`,
        href: sessionId ? `/brand/collabs/${sessionId}` : "/brand/collabs",
      });
    }
  } catch (err) {
    console.error("[agreements] notifyAgreementActivated failed (non-fatal)", err);
  }
}

/**
 * Regenerate + restore the PDF for an existing agreement (e.g. if the first
 * render failed at payment time). Returns the public URL or null.
 */
export async function regenerateAgreementPDF(
  admin: Admin,
  agreementId: string,
): Promise<string | null> {
  const { data: row } = await admin
    .from("collab_agreements")
    .select("*")
    .eq("id", agreementId)
    .maybeSingle();
  if (!row) return null;
  await renderAndStorePDF(admin, row as CollabAgreement);
  const { data: fresh } = await admin
    .from("collab_agreements")
    .select("pdf_url")
    .eq("id", agreementId)
    .maybeSingle();
  return (fresh?.pdf_url as string | null) ?? null;
}

// ── Cancel on decline / expire ───────────────────────────────────────────────

/** Mark a still-pending agreement cancelled (request declined / expired). */
export async function cancelAgreementForRequest(
  admin: Admin,
  requestId: string,
): Promise<void> {
  try {
    await admin
      .from("collab_agreements")
      .update({ status: "cancelled" })
      .eq("collab_request_id", requestId)
      .eq("status", "pending_brand");
  } catch (err) {
    console.warn("[agreements] cancel threw", err);
  }
}

// ── Reads ────────────────────────────────────────────────────────────────────

/** Fetch the agreement for a collab session (for the collab detail card). */
export async function getAgreementForSession(
  admin: Admin,
  sessionId: string,
): Promise<CollabAgreement | null> {
  const { data } = await admin
    .from("collab_agreements")
    .select("*")
    .eq("collab_session_id", sessionId)
    .maybeSingle();
  if (!data) return null;
  return { ...data, pdf_url: normalizeAgreementUrl(data.pdf_url, data.id) };
}

/** Fetch an agreement by id with party names. Caller enforces authorization. */
export async function getAgreementWithParties(
  admin: Admin,
  id: string,
): Promise<AgreementWithParties | null> {
  const { data } = await admin
    .from("collab_agreements")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;

  const [creatorRes, brandRes] = await Promise.all([
    admin.from("creators").select("user_id").eq("id", data.creator_id).maybeSingle(),
    admin.from("brands").select("company_name").eq("id", data.brand_id).maybeSingle(),
  ]);
  let creator_display_name = "Creator";
  if (creatorRes.data?.user_id) {
    const { data: cu } = await admin
      .from("users").select("display_name").eq("id", creatorRes.data.user_id).maybeSingle();
    creator_display_name = cu?.display_name ?? "Creator";
  }

  return {
    ...data,
    pdf_url: normalizeAgreementUrl(data.pdf_url, data.id),
    creator_display_name,
    brand_company_name: brandRes.data?.company_name ?? "Brand",
  };
}

// ── Public verify (zero-PII) ─────────────────────────────────────────────────

/** Retrieve a publicly-safe agreement verification status. Null if not found. */
export async function getPublicAgreementStatus(
  id: string,
): Promise<PublicAgreementStatus | null> {
  const admin = createAdminClient() as Admin;

  const { data } = await admin
    .from("collab_agreements")
    .select(`
      status, agreement_version, product_name, usage_scope, license_duration_days,
      package_tier, package_price_paise, final_images,
      creator_signed_at, brand_signed_at, brand_id, creator_id
    `)
    .eq("id", id)
    .maybeSingle();

  if (!data) return null;

  const [creatorRes, brandRes] = await Promise.all([
    admin.from("creators").select("user_id").eq("id", data.creator_id).maybeSingle(),
    admin.from("brands").select("company_name").eq("id", data.brand_id).maybeSingle(),
  ]);
  let creator_display_name = "Creator";
  if (creatorRes.data?.user_id) {
    const { data: cu } = await admin
      .from("users").select("display_name").eq("id", creatorRes.data.user_id).maybeSingle();
    creator_display_name = cu?.display_name ?? "Creator";
  }

  const terms = buildAgreementTerms({
    package_tier: data.package_tier,
    package_price_paise: data.package_price_paise,
    final_images: data.final_images,
    usage_scope: data.usage_scope,
    license_duration_days: data.license_duration_days,
    product_name: data.product_name,
  });

  return {
    status: data.status,
    agreement_version: data.agreement_version,
    brand_company_name: brandRes.data?.company_name ?? "Brand",
    creator_display_name,
    product_name: data.product_name,
    usage_label: terms.usage_label,
    term_label: terms.term_label,
    creator_signed_at: data.creator_signed_at,
    brand_signed_at: data.brand_signed_at,
    effective_at: data.status === "active" ? data.brand_signed_at : null,
  };
}
