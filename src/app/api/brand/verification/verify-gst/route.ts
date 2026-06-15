// POST /api/brand/verification/verify-gst
//
// Flow B step 2: brand submits { gstin, sessionId, captcha }. We pull the
// official GST details from the GSTVerify API and store them LOCKED:
//   • upsert brand_verifications (by brand_id) with the pulled fields + raw audit
//   • mirror the display fields onto the brands row (read-only "Verified info")
// is_verified is NOT touched here — an operator approves later (Flow B).
//
// Body: { gstin: string, sessionId: string, captcha: string }
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyGstin, isValidGstinFormat } from "@/lib/gst/gstverify-client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient() as Admin;

    const { data: brand } = await admin
      .from("brands")
      .select("id, is_verified, company_name")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!brand)
      return NextResponse.json({ error: "Brand not found" }, { status: 403 });

    if (brand.is_verified) {
      return NextResponse.json(
        { error: "already_verified", message: "Your brand is already verified." },
        { status: 400 },
      );
    }

    let body: { gstin?: string; sessionId?: string; captcha?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const gstin = (body.gstin ?? "").trim().toUpperCase();
    const sessionId = (body.sessionId ?? "").trim();
    const captcha = (body.captcha ?? "").trim();

    if (!isValidGstinFormat(gstin)) {
      return NextResponse.json(
        { error: "Invalid GSTIN format." },
        { status: 400 },
      );
    }
    if (!sessionId || !captcha) {
      return NextResponse.json(
        { error: "Captcha session and answer are required." },
        { status: 400 },
      );
    }

    const result = await verifyGstin({ gstin, sessionId, captcha });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const d = result.details;
    const nowIso = new Date().toISOString();

    // Upsert the verification request with the pulled (locked) GST data. We do
    // NOT set status here — the brand still has to upload the certificate and
    // hit submit. company_name falls back to the brand's existing name.
    const { error: upsertErr } = await admin
      .from("brand_verifications")
      .upsert(
        {
          brand_id: brand.id,
          gst_number: d.gstin,
          pan_number: d.pan,
          company_name: (brand.company_name ?? "").trim() || d.legalName || d.tradeName || null,
          gst_legal_name: d.legalName,
          gst_trade_name: d.tradeName,
          gst_status: d.status,
          gst_address: d.address,
          gst_constitution: d.constitution,
          gst_registration_date: d.registrationDate,
          gst_taxpayer_type: d.taxpayerType,
          gst_api_response: d.raw,
          gst_verified_at: nowIso,
          updated_at: nowIso,
        },
        { onConflict: "brand_id" },
      );

    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    // Mirror the locked display fields onto the brand row. is_verified stays
    // UNCHANGED until an operator approves.
    await admin
      .from("brands")
      .update({
        gst_number: d.gstin,
        pan_number: d.pan,
        gst_legal_name: d.legalName,
        gst_trade_name: d.tradeName,
        gst_status: d.status,
        gst_address: d.address,
        gst_constitution: d.constitution,
        gst_verified_at: nowIso,
      })
      .eq("id", brand.id);

    // Return the pulled details to the client (minus the raw payload).
    return NextResponse.json({
      ok: true,
      details: {
        gstin: d.gstin,
        pan: d.pan,
        legalName: d.legalName,
        tradeName: d.tradeName,
        status: d.status,
        address: d.address,
        constitution: d.constitution,
        registrationDate: d.registrationDate,
        taxpayerType: d.taxpayerType,
        isActive: d.isActive,
      },
    });
  } catch (err) {
    console.error("[brand/verification/verify-gst]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
