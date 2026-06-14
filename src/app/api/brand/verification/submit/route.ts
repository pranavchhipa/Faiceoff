// POST /api/brand/verification/submit
//
// Brand submits for manual verification by TYPING business details (no document
// upload — unlike creators who upload Aadhaar/PAN files). A brand_verifications
// row is upserted to 'pending' for a Control Centre operator to review.
// brands.is_verified stays false until the operator approves.
//
// JSON body: { gst_number, pan_number, company_name, legal_name?, registered_address? }
import { NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitNotification } from "@/lib/notifications/emit";

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
      .select("id, is_verified")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!brand)
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });

    if (brand.is_verified) {
      return NextResponse.json(
        { error: "already_verified", message: "Your brand is already verified." },
        { status: 400 },
      );
    }

    let body: {
      gst_number?: string;
      pan_number?: string;
      company_name?: string;
      legal_name?: string | null;
      registered_address?: string | null;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const gstNumber = (body.gst_number ?? "").trim();
    const panNumber = (body.pan_number ?? "").trim();
    const companyName = (body.company_name ?? "").trim();
    const legalName = body.legal_name?.trim() || null;
    const registeredAddress = body.registered_address?.trim() || null;

    if (!gstNumber || !panNumber || !companyName) {
      return NextResponse.json(
        {
          error: "missing_fields",
          message: "GST number, PAN number, and company name are required.",
        },
        { status: 400 },
      );
    }

    const nowIso = new Date().toISOString();
    const { error: upsertErr } = await admin
      .from("brand_verifications")
      .upsert(
        {
          brand_id: brand.id,
          status: "pending",
          gst_number: gstNumber,
          pan_number: panNumber,
          company_name: companyName,
          legal_name: legalName,
          registered_address: registeredAddress,
          submitted_at: nowIso,
          reviewed_by: null,
          reviewed_at: null,
          rejection_reason: null,
          updated_at: nowIso,
        },
        { onConflict: "brand_id" },
      );

    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    // Mirror GST + PAN onto the brand row. is_verified stays UNCHANGED (false)
    // until an operator approves.
    await admin
      .from("brands")
      .update({ gst_number: gstNumber, pan_number: panNumber })
      .eq("id", brand.id);

    after(async () => {
      await emitNotification(admin, {
        userId: user.id,
        type: "system",
        title: "Verification submitted",
        body: "We'll review your brand shortly — usually within 1–2 business days.",
        href: "/brand/verify",
      });
    });

    return NextResponse.json({ ok: true, status: "pending" });
  } catch (err) {
    console.error("[brand/verification/submit]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
