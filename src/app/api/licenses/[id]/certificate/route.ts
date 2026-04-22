// ─────────────────────────────────────────────────────────────────────────────
// GET /api/licenses/[id]/certificate — stream the license certificate PDF
// Task E14 / Phase 3 Group C
// ─────────────────────────────────────────────────────────────────────────────
//
// If the certificate PDF has not yet been generated (cert_url is null on the
// license row), generates it now via `generateLicenseCertPDF` + `uploadCertPDF`,
// then back-fills the cert_url on the license row.
//
// Streams the PDF from R2 directly (fetches URL, returns arrayBuffer).
// Content-Disposition: inline so it opens in the browser PDF viewer.
//
// Access: brand OR creator party on the license.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getLicense,
  generateLicenseCertPDF,
  uploadCertPDF,
  LicenseError,
} from "@/lib/licenses";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  // ── 1. Auth ─────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ── 2. Resolve caller identity ───────────────────────────────────────────────
  const admin = createAdminClient() as any;
  const [brandRes, creatorRes] = await Promise.all([
    admin.from("brands").select("id").eq("user_id", user.id).maybeSingle(),
    admin.from("creators").select("id, instagram_handle, users!creators_user_id_fkey(display_name)").eq("user_id", user.id).maybeSingle(),
  ]);

  const brandId = (brandRes.data as { id?: string } | null)?.id;
  const creatorId = (creatorRes.data as { id?: string } | null)?.id;

  if (!brandId && !creatorId) {
    return NextResponse.json({ error: "forbidden", reason: "no_profile" }, { status: 403 });
  }

  // ── 3. Fetch license ─────────────────────────────────────────────────────────
  let license;
  try {
    license = await getLicense(id);
  } catch (err) {
    if (err instanceof LicenseError) {
      if (err.code === "LICENSE_NOT_FOUND") {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: err.statusCode },
      );
    }
    console.error("[licenses/[id]/certificate GET] unexpected error", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  // ── 4. Party gate ────────────────────────────────────────────────────────────
  const isBrandParty = brandId && brandId === license.brand_id;
  const isCreatorParty = creatorId && creatorId === license.creator_id;
  if (!isBrandParty && !isCreatorParty) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // ── 5. Ensure cert exists (generate on-demand if missing) ───────────────────
  let certUrl = license.cert_url;
  if (!certUrl) {
    // Need creator + brand info for the cert
    const [creatorDataRes, brandDataRes] = await Promise.all([
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
    ]);

    const creatorRow = creatorDataRes.data as {
      instagram_handle: string | null;
      users: { display_name: string } | null;
    } | null;
    const brandRow = brandDataRes.data as {
      company_name: string;
      gst_number: string | null;
    } | null;

    try {
      const certResult = await generateLicenseCertPDF({
        license,
        creator: {
          display_name: creatorRow?.users?.display_name ?? "Creator",
          instagram_handle: creatorRow?.instagram_handle ?? null,
        },
        brand: {
          company_name: brandRow?.company_name ?? "Brand",
          gst_number: brandRow?.gst_number ?? null,
        },
        generation: { id: license.generation_id },
      });

      const uploaded = await uploadCertPDF({
        buffer: certResult.buffer,
        licenseId: id,
      });

      certUrl = uploaded.url;

      // Back-fill cert_url + sha256 on the license row (non-fatal if it fails)
      try {
        await admin
          .from("licenses")
          .update({
            cert_url: certUrl,
            cert_signature_sha256: certResult.sha256,
          })
          .eq("id", id);
      } catch (updateErr) {
        console.warn("[licenses/[id]/certificate] cert back-fill failed (non-fatal)", updateErr);
      }
    } catch (err) {
      if (err instanceof LicenseError) {
        return NextResponse.json(
          { error: err.code, message: err.message },
          { status: err.statusCode },
        );
      }
      console.error("[licenses/[id]/certificate] cert generation error", err);
      return NextResponse.json(
        { error: "cert_generation_failed", message: String(err) },
        { status: 500 },
      );
    }
  }

  // ── 6. Stream PDF from R2 ────────────────────────────────────────────────────
  try {
    const r2Response = await fetch(certUrl);
    if (!r2Response.ok) {
      console.error("[licenses/[id]/certificate] R2 fetch failed", r2Response.status, certUrl);
      return NextResponse.json(
        { error: "cert_fetch_failed", message: `R2 responded with ${r2Response.status}` },
        { status: 502 },
      );
    }

    const arrayBuffer = await r2Response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="license-${id}.pdf"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[licenses/[id]/certificate] streaming error", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
