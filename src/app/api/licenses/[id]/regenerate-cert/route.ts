/**
 * POST /api/licenses/[id]/regenerate-cert
 *
 * Re-renders the licence certificate PDF using the current cert-pdf template
 * and re-uploads it to R2 at the canonical key (`certs/{licenseId}.pdf`).
 *
 * Use cases:
 *  • Old licences whose cert URL points at the broken S3-endpoint URL.
 *  • Format upgrades — bring older 1-page certs to the new industry-grade
 *    2-page template.
 *  • Disaster recovery if the R2 object is missing.
 *
 * Auth: only the brand or creator party of the licence can trigger this.
 * The cert key in R2 stays the same, so the public URL is also stable.
 */

import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateLicenseCertPDF,
  uploadCertPDF,
} from "@/lib/licenses";
import type { License, LicenseScope } from "@/lib/licenses";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: licenseId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // 1. Load the licence row
  const { data: licRow, error: licErr } = await admin
    .from("licenses")
    .select("*")
    .eq("id", licenseId)
    .maybeSingle();
  if (licErr || !licRow) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const license = licRow as License;

  // 2. Auth: caller must be the brand or creator party
  const [{ data: callerBrand }, { data: callerCreator }] = await Promise.all([
    admin.from("brands").select("id").eq("user_id", user.id).maybeSingle(),
    admin.from("creators").select("id").eq("user_id", user.id).maybeSingle(),
  ]);
  const isParty =
    (callerBrand?.id && callerBrand.id === license.brand_id) ||
    (callerCreator?.id && callerCreator.id === license.creator_id);
  if (!isParty) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // 3. Fetch creator + brand display info + generation image
  const [creatorRes, brandRes, genRes] = await Promise.all([
    admin
      .from("creators")
      .select("instagram_handle, users!creators_user_id_fkey(display_name)")
      .eq("id", license.creator_id)
      .maybeSingle(),
    admin
      .from("brands")
      .select("company_name, gst_number")
      .eq("id", license.brand_id)
      .maybeSingle(),
    admin
      .from("generations")
      .select("image_url")
      .eq("id", license.generation_id)
      .maybeSingle(),
  ]);

  const creatorRow = creatorRes.data as {
    instagram_handle: string | null;
    users: { display_name: string } | null;
  } | null;
  const brandRow = brandRes.data as {
    company_name: string;
    gst_number: string | null;
  } | null;
  const genRow = genRes.data as { image_url: string | null } | null;

  const creator = {
    display_name: creatorRow?.users?.display_name ?? "Creator",
    instagram_handle: creatorRow?.instagram_handle ?? null,
  };
  const brand = {
    company_name: brandRow?.company_name ?? "Brand",
    gst_number: brandRow?.gst_number ?? null,
  };

  // 4. Render the PDF
  let buffer: Buffer;
  let sha256: string;
  try {
    const result = await generateLicenseCertPDF({
      license: {
        ...license,
        scope: license.scope as LicenseScope,
      } as License,
      creator,
      brand,
      generation: {
        id: license.generation_id,
        image_url: genRow?.image_url ?? null,
      },
    });
    buffer = result.buffer;
    sha256 = result.sha256;
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "licenses/regenerate-cert", phase: "render" },
    });
    return NextResponse.json(
      { error: "render_failed", message: String(err) },
      { status: 500 },
    );
  }

  // 5. Upload to R2 (overwrites existing object at canonical key)
  let certUrl: string;
  try {
    const upload = await uploadCertPDF({ buffer, licenseId });
    certUrl = upload.url;
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "licenses/regenerate-cert", phase: "upload" },
    });
    return NextResponse.json(
      { error: "upload_failed", message: String(err) },
      { status: 500 },
    );
  }

  // 6. Update the row with the canonical (now correct) URL + new hash
  const { error: updateErr } = await admin
    .from("licenses")
    .update({
      cert_url: certUrl,
      cert_signature_sha256: sha256,
      updated_at: new Date().toISOString(),
    })
    .eq("id", licenseId);
  if (updateErr) {
    Sentry.captureException(updateErr, {
      tags: { route: "licenses/regenerate-cert", phase: "db_update" },
    });
    // Still return success — the file is in R2, URL on read will work via
    // /api/licenses/[id]/cert which goes through R2 directly.
  }

  return NextResponse.json({
    ok: true,
    license_id: licenseId,
    cert_url: certUrl,
    cert_signature_sha256: sha256,
  });
}
