/**
 * License service — issue, renew, revoke, and list per-generation licenses.
 *
 * Each approved generation triggers `issueLicense`, which:
 *   1. Inserts a `licenses` row.
 *   2. Generates a certificate PDF.
 *   3. Uploads it to R2.
 *   4. Back-fills cert_url + cert_signature_sha256 on the license row.
 *   5. Updates the generation row with license_id + cert_url.
 *
 * All DB writes use the admin client (bypasses RLS).
 * All amounts are in paise (1 INR = 100 paise).
 *
 * IMPORTANT: This system is distinct from `license_requests` (Chunk C).
 * Never modify the old request-based system from this module.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { generateLicenseCertPDF } from "./cert-pdf";
import { uploadCertPDF } from "./cert-storage";
import { LicenseError } from "./license-error";
import type {
  GetExpiringSoonInput,
  IssueLicenseInput,
  IssueLicenseResult,
  License,
  LicenseStatus,
  LicenseWithParties,
  ListBrandLicensesInput,
  ListCreatorLicensesInput,
  PaginatedLicenses,
  RenewLicenseInput,
  RevokeLicenseInput,
} from "./types";

// ── Internal helpers ───────────────────────────────────────────────────────

/** Compute days until a given ISO timestamp (negative = already expired). */
function daysToExpiry(expiresAt: string): number {
  const now = Date.now();
  const exp = new Date(expiresAt).getTime();
  return Math.round((exp - now) / (1000 * 60 * 60 * 24));
}

/** Add 12 calendar months to a Date, returning an ISO string. */
function addTwelveMonths(from: Date): string {
  const d = new Date(from);
  d.setMonth(d.getMonth() + 12);
  return d.toISOString();
}

// ── issueLicense ──────────────────────────────────────────────────────────

/**
 * Issue a new per-generation license.
 *
 * Idempotent on `generation_id` UNIQUE — if a license already exists for this
 * generation, returns the existing row without re-generating the cert.
 *
 * Steps:
 * 1. INSERT licenses row (expires_at = now + 12 months, auto_renew=true).
 * 2. Fetch creator/brand display fields for the cert.
 * 3. Generate cert PDF.
 * 4. Upload to R2.
 * 5. UPDATE licenses SET cert_url, cert_signature_sha256.
 * 6. UPDATE generations SET license_id, cert_url.
 *
 * @returns `{ license, cert_url }`.
 */
export async function issueLicense(
  input: IssueLicenseInput,
): Promise<IssueLicenseResult> {
  const db = createAdminClient();
  const now = new Date();
  const expiresAt = addTwelveMonths(now);

  // 1. INSERT — idempotent via UNIQUE on generation_id
  const { data: inserted, error: insertErr } = await db
    .from("licenses")
    .insert({
      generation_id: input.generationId,
      brand_id: input.brandId,
      creator_id: input.creatorId,
      scope: input.scope,
      is_category_exclusive: input.isExclusive,
      exclusive_category: input.exclusiveCategory ?? null,
      exclusive_until: input.exclusiveUntil ?? null,
      amount_paid_paise: input.amountPaidPaise,
      creator_share_paise: input.creatorSharePaise,
      platform_share_paise: input.platformSharePaise,
      issued_at: now.toISOString(),
      expires_at: expiresAt,
      auto_renew: true,
      status: "active",
    })
    .select()
    .single();

  // Handle idempotency: if unique violation (generation_id), fetch existing
  if (insertErr) {
    // Supabase/PG unique violation code
    if (insertErr.code === "23505") {
      const { data: existing, error: fetchErr } = await db
        .from("licenses")
        .select("*")
        .eq("generation_id", input.generationId)
        .maybeSingle();

      if (fetchErr || !existing) {
        throw new LicenseError(
          `License already exists but could not be fetched: ${fetchErr?.message ?? "not found"}`,
          "DB_ERROR",
        );
      }

      const license = existing as License;
      return { license, cert_url: license.cert_url ?? "" };
    }

    throw new LicenseError(
      `Failed to insert license: ${insertErr.message}`,
      "DB_ERROR",
    );
  }

  const license = inserted as License;

  // 2. Fetch creator + brand display fields for the cert
  const [creatorResult, brandResult] = await Promise.all([
    db
      .from("creators")
      .select("instagram_handle, users!creators_user_id_fkey(display_name)")
      .eq("id", input.creatorId)
      .maybeSingle(),
    db
      .from("brands")
      .select("company_name, gst_number")
      .eq("id", input.brandId)
      .maybeSingle(),
  ]);

  const creatorRow = creatorResult.data as {
    instagram_handle: string | null;
    users: { display_name: string } | null;
  } | null;

  const brandRow = brandResult.data as {
    company_name: string;
    gst_number: string | null;
  } | null;

  const creator = {
    display_name: creatorRow?.users?.display_name ?? "Creator",
    instagram_handle: creatorRow?.instagram_handle ?? null,
  };

  const brand = {
    company_name: brandRow?.company_name ?? "Brand",
    gst_number: brandRow?.gst_number ?? null,
  };

  // 3. Generate cert PDF
  let certBuffer: Buffer;
  let certSha256: string;
  try {
    const certResult = await generateLicenseCertPDF({
      license,
      creator,
      brand,
      generation: { id: input.generationId },
    });
    certBuffer = certResult.buffer;
    certSha256 = certResult.sha256;
  } catch (cause) {
    throw new LicenseError(
      `Cert PDF generation failed for license ${license.id}: ${String(cause)}`,
      "CERT_GENERATION_FAILED",
    );
  }

  // 4. Upload to R2
  const { url: certUrl } = await uploadCertPDF({
    buffer: certBuffer,
    licenseId: license.id,
  });

  // 5. UPDATE licenses row with cert fields
  const { error: certUpdateErr } = await db
    .from("licenses")
    .update({
      cert_url: certUrl,
      cert_signature_sha256: certSha256,
    })
    .eq("id", license.id);

  if (certUpdateErr) {
    // Non-fatal: cert uploaded but DB not updated. Log and continue.
    console.error(
      `[license-service] Failed to update cert fields on license ${license.id}:`,
      certUpdateErr.message,
    );
  }

  // 6. UPDATE generations row with license_id + cert_url
  const { error: genUpdateErr } = await db
    .from("generations")
    .update({
      license_id: license.id,
      cert_url: certUrl,
    })
    .eq("id", input.generationId);

  if (genUpdateErr) {
    console.error(
      `[license-service] Failed to update generation ${input.generationId} with license_id:`,
      genUpdateErr.message,
    );
  }

  const finalLicense: License = {
    ...license,
    cert_url: certUrl,
    cert_signature_sha256: certSha256,
  };

  return { license: finalLicense, cert_url: certUrl };
}

// ── renewLicense ──────────────────────────────────────────────────────────

/**
 * Renew an active license by extending its expiry 12 months.
 *
 * Validates:
 * - status === 'active'
 * - expires_at within the next 30 days (caller passes `daysWindow` default 30)
 *
 * NOTE: Charging the renewal amount is the caller's responsibility.
 * This function only updates the DB record.
 *
 * @param input - `{ licenseId }`.
 * @returns Updated license row.
 */
export async function renewLicense(
  input: RenewLicenseInput,
): Promise<License> {
  const db = createAdminClient();

  const { data, error: fetchErr } = await db
    .from("licenses")
    .select("*")
    .eq("id", input.licenseId)
    .maybeSingle();

  if (fetchErr) {
    throw new LicenseError(
      `DB error fetching license: ${fetchErr.message}`,
      "DB_ERROR",
    );
  }

  if (!data) {
    throw new LicenseError(
      `License not found: ${input.licenseId}`,
      "LICENSE_NOT_FOUND",
    );
  }

  const license = data as License;

  if (license.status !== "active") {
    throw new LicenseError(
      `Cannot renew license ${input.licenseId} — status is '${license.status}', must be 'active'`,
      "LICENSE_NOT_ACTIVE",
    );
  }

  const days = daysToExpiry(license.expires_at);
  if (days > 30) {
    throw new LicenseError(
      `License ${input.licenseId} expires in ${days} days — renewal only allowed within 30 days of expiry`,
      "LICENSE_NOT_EXPIRING_SOON",
    );
  }

  // Extend from current expires_at (not now) to preserve the full 12 months
  const newExpiresAt = addTwelveMonths(new Date(license.expires_at));

  const { data: updated, error: updateErr } = await db
    .from("licenses")
    .update({
      expires_at: newExpiresAt,
      renewed_count: license.renewed_count + 1,
    })
    .eq("id", input.licenseId)
    .select()
    .single();

  if (updateErr || !updated) {
    throw new LicenseError(
      `Failed to renew license: ${updateErr?.message ?? "no data returned"}`,
      "DB_ERROR",
    );
  }

  return updated as License;
}

// ── revokeLicense ─────────────────────────────────────────────────────────

/**
 * Revoke a license. Only the creator who issued it can revoke.
 *
 * Note: per spec, revocation stops new generations but does not retroactively
 * invalidate content already delivered. That semantic is enforced at the
 * generation-creation layer, not here.
 *
 * @param input - `{ licenseId, reason, revokedByCreatorId }`.
 * @returns Updated license row (status='revoked').
 */
export async function revokeLicense(
  input: RevokeLicenseInput,
): Promise<License> {
  const db = createAdminClient();

  const { data, error: fetchErr } = await db
    .from("licenses")
    .select("*")
    .eq("id", input.licenseId)
    .maybeSingle();

  if (fetchErr) {
    throw new LicenseError(
      `DB error fetching license: ${fetchErr.message}`,
      "DB_ERROR",
    );
  }

  if (!data) {
    throw new LicenseError(
      `License not found: ${input.licenseId}`,
      "LICENSE_NOT_FOUND",
    );
  }

  const license = data as License;

  // Authz: only the license's creator may revoke
  if (license.creator_id !== input.revokedByCreatorId) {
    throw new LicenseError(
      `Creator ${input.revokedByCreatorId} is not authorized to revoke license ${input.licenseId}`,
      "REVOKE_FORBIDDEN",
    );
  }

  if (license.status === "revoked") {
    // Already revoked — return as-is (idempotent)
    return license;
  }

  const { data: updated, error: updateErr } = await db
    .from("licenses")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      revocation_reason: input.reason,
    })
    .eq("id", input.licenseId)
    .select()
    .single();

  if (updateErr || !updated) {
    throw new LicenseError(
      `Failed to revoke license: ${updateErr?.message ?? "no data returned"}`,
      "DB_ERROR",
    );
  }

  return updated as License;
}

// ── listBrandLicenses ─────────────────────────────────────────────────────

/**
 * List licenses belonging to a brand, with creator display name joined.
 *
 * @param input - `{ brandId, status?, page=1, pageSize=20 }`.
 * @returns Paginated list of `LicenseWithParties`.
 */
export async function listBrandLicenses(
  input: ListBrandLicensesInput,
): Promise<PaginatedLicenses> {
  const { brandId, status, page = 1, pageSize = 20 } = input;
  const db = createAdminClient();

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = db
    .from("licenses")
    .select(
      `
      *,
      creators!licenses_creator_id_fkey (
        users!creators_user_id_fkey (display_name)
      ),
      brands!licenses_brand_id_fkey (company_name)
    `,
      { count: "exact" },
    )
    .eq("brand_id", brandId);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error, count } = await query
    .order("issued_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw new LicenseError(
      `Failed to list brand licenses: ${error.message}`,
      "DB_ERROR",
    );
  }

  const total = count ?? 0;

  const licenses: LicenseWithParties[] = (data ?? []).map((row) => {
    const r = row as License & {
      creators: { users: { display_name: string } | null } | null;
      brands: { company_name: string } | null;
    };
    return {
      ...r,
      creator_display_name: r.creators?.users?.display_name ?? "Unknown Creator",
      brand_company_name: r.brands?.company_name ?? "Unknown Brand",
      days_to_expiry: daysToExpiry(r.expires_at),
    };
  });

  return {
    data: licenses,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// ── listCreatorLicenses ───────────────────────────────────────────────────

/**
 * List licenses where the creator is the licensor, with brand name joined.
 *
 * @param input - `{ creatorId, status?, page=1, pageSize=20 }`.
 * @returns Paginated list of `LicenseWithParties`.
 */
export async function listCreatorLicenses(
  input: ListCreatorLicensesInput,
): Promise<PaginatedLicenses> {
  const { creatorId, status, page = 1, pageSize = 20 } = input;
  const db = createAdminClient();

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = db
    .from("licenses")
    .select(
      `
      *,
      creators!licenses_creator_id_fkey (
        users!creators_user_id_fkey (display_name)
      ),
      brands!licenses_brand_id_fkey (company_name)
    `,
      { count: "exact" },
    )
    .eq("creator_id", creatorId);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error, count } = await query
    .order("issued_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw new LicenseError(
      `Failed to list creator licenses: ${error.message}`,
      "DB_ERROR",
    );
  }

  const total = count ?? 0;

  const licenses: LicenseWithParties[] = (data ?? []).map((row) => {
    const r = row as License & {
      creators: { users: { display_name: string } | null } | null;
      brands: { company_name: string } | null;
    };
    return {
      ...r,
      creator_display_name: r.creators?.users?.display_name ?? "Unknown Creator",
      brand_company_name: r.brands?.company_name ?? "Unknown Brand",
      days_to_expiry: daysToExpiry(r.expires_at),
    };
  });

  return {
    data: licenses,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// ── getLicense ────────────────────────────────────────────────────────────

/**
 * Fetch a single license with joined brand + creator display names.
 *
 * @param licenseId - UUID of the license.
 * @returns Full `LicenseWithParties`.
 */
export async function getLicense(licenseId: string): Promise<LicenseWithParties> {
  const db = createAdminClient();

  const { data, error } = await db
    .from("licenses")
    .select(
      `
      *,
      creators!licenses_creator_id_fkey (
        users!creators_user_id_fkey (display_name)
      ),
      brands!licenses_brand_id_fkey (company_name)
    `,
    )
    .eq("id", licenseId)
    .maybeSingle();

  if (error) {
    throw new LicenseError(
      `DB error fetching license: ${error.message}`,
      "DB_ERROR",
    );
  }

  if (!data) {
    throw new LicenseError(
      `License not found: ${licenseId}`,
      "LICENSE_NOT_FOUND",
    );
  }

  const r = data as License & {
    creators: { users: { display_name: string } | null } | null;
    brands: { company_name: string } | null;
  };

  return {
    ...r,
    creator_display_name: r.creators?.users?.display_name ?? "Unknown Creator",
    brand_company_name: r.brands?.company_name ?? "Unknown Brand",
    days_to_expiry: daysToExpiry(r.expires_at),
  };
}

// ── getExpiringSoon ───────────────────────────────────────────────────────

/**
 * Return active licenses expiring within `daysWindow` that have `auto_renew=true`.
 *
 * Used by `/api/cron/license-renewals` to drive automated renewal.
 *
 * @param input - `{ daysWindow=30 }`.
 * @returns Array of license rows (no join).
 */
export async function getExpiringSoon(
  input: GetExpiringSoonInput = {},
): Promise<License[]> {
  const { daysWindow = 30 } = input;
  const db = createAdminClient();

  const windowEnd = new Date();
  windowEnd.setDate(windowEnd.getDate() + daysWindow);

  const { data, error } = await db
    .from("licenses")
    .select("*")
    .eq("status", "active" satisfies LicenseStatus)
    .eq("auto_renew", true)
    .lte("expires_at", windowEnd.toISOString())
    .order("expires_at", { ascending: true });

  if (error) {
    throw new LicenseError(
      `Failed to query expiring licenses: ${error.message}`,
      "DB_ERROR",
    );
  }

  return (data ?? []) as License[];
}
