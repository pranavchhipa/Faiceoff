/**
 * Public license verification — zero-PII shape.
 *
 * Called by the public `/verify/[id]` route. Returns only the fields needed
 * to confirm a license is genuine and active. No emails, phones, GST numbers,
 * or Instagram handles are exposed.
 *
 * Uses the admin client to bypass RLS (the licenses table has a "Public read"
 * policy, but we need the joined user display_name and brand company_name which
 * are on separate tables).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { PublicLicenseStatus, LicenseStatus, LicenseScope } from "./types";
import { LicenseError } from "./license-error";

/**
 * Retrieve a publicly-safe license verification status.
 *
 * Returns only: status, issued_at, expires_at, scope, brand_company_name,
 * creator_display_name, generation_id. No PII.
 *
 * @param licenseId - UUID of the license to verify.
 * @throws `LicenseError("LICENSE_NOT_FOUND")` if the license does not exist.
 */
export async function getPublicLicenseStatus(
  licenseId: string,
): Promise<PublicLicenseStatus> {
  const db = createAdminClient();

  // Join brand and creator user display names.
  // We select only the columns we need — no PII columns are fetched.
  const { data, error } = await db
    .from("licenses")
    .select(
      `
      status,
      issued_at,
      expires_at,
      scope,
      generation_id,
      brands!licenses_brand_id_fkey (
        company_name
      ),
      creators!licenses_creator_id_fkey (
        users!creators_user_id_fkey (
          display_name
        )
      )
    `,
    )
    .eq("id", licenseId)
    .maybeSingle();

  if (error) {
    throw new LicenseError(
      `DB error verifying license: ${error.message}`,
      "DB_ERROR",
    );
  }

  if (!data) {
    throw new LicenseError(
      `License not found: ${licenseId}`,
      "LICENSE_NOT_FOUND",
    );
  }

  // Safely extract joined names — they come back as objects or null
  const brandsData = data.brands as { company_name: string } | null;
  const creatorsData = data.creators as {
    users: { display_name: string } | null;
  } | null;

  const brand_company_name = brandsData?.company_name ?? "Unknown Brand";
  const creator_display_name =
    creatorsData?.users?.display_name ?? "Unknown Creator";

  return {
    status: data.status as LicenseStatus,
    issued_at: data.issued_at as string,
    expires_at: data.expires_at as string,
    scope: data.scope as LicenseScope,
    brand_company_name,
    creator_display_name,
    generation_id: data.generation_id as string,
  };
}
