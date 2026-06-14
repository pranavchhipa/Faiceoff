import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const GST_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/;

export async function POST(request: Request) {
  // --- Auth ---
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // --- Validate body ---
  let body: {
    company_name?: string;
    gst_number?: string | null;
    pan_number?: string | null;
    legal_name?: string | null;
    registered_address?: string | null;
    website_url?: string | null;
    industry?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const companyName = (body.company_name ?? "").trim();
  const gstNumber = body.gst_number?.trim() || null;
  const panNumber = body.pan_number?.trim() || null;
  const legalName = body.legal_name?.trim() || null;
  const registeredAddress = body.registered_address?.trim() || null;
  const websiteUrl = body.website_url?.trim() || null;
  const industry = body.industry?.trim() || null;

  if (!companyName) {
    return NextResponse.json(
      { error: "Company name is required" },
      { status: 400 },
    );
  }

  if (gstNumber && !GST_REGEX.test(gstNumber)) {
    return NextResponse.json(
      { error: "Invalid GST format" },
      { status: 400 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // --- Verify brand row exists for this user ---
  const { data: existingBrand, error: findError } = await admin
    .from("brands")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (findError) {
    return NextResponse.json(
      { error: findError.message },
      { status: 500 },
    );
  }

  if (!existingBrand) {
    return NextResponse.json(
      { error: "Brand profile not found. Please sign up as a brand first." },
      { status: 404 },
    );
  }

  // --- Update brand row ---
  // is_verified stays UNCHANGED (false). An operator manually verifies the
  // brand through the Control Centre via the brand_verifications request below.
  const { error: updateError } = await admin
    .from("brands")
    .update({
      company_name: companyName,
      gst_number: gstNumber,
      pan_number: panNumber,
      website_url: websiteUrl,
      industry: industry,
    })
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 },
    );
  }

  // --- Land the brand in the manual-review queue ---
  // If GST + PAN are present, submit as 'pending'. Otherwise create a
  // 'not_started' row so the brand still surfaces in the Control Centre and the
  // dashboard banner can nudge them to finish verifying. Never crash on this.
  const hasDetails = !!gstNumber && !!panNumber;
  const nowIso = new Date().toISOString();
  const { error: verErr } = await admin.from("brand_verifications").upsert(
    {
      brand_id: existingBrand.id,
      status: hasDetails ? "pending" : "not_started",
      gst_number: gstNumber,
      pan_number: panNumber,
      company_name: companyName,
      legal_name: legalName,
      registered_address: registeredAddress,
      submitted_at: hasDetails ? nowIso : null,
      reviewed_by: null,
      reviewed_at: null,
      rejection_reason: null,
      updated_at: nowIso,
    },
    { onConflict: "brand_id" },
  );

  if (verErr) {
    // Non-fatal: the brand profile saved fine; verification row can be retried
    // from /brand/verify. Log and move on.
    console.warn("[brand-setup] verification upsert failed", verErr.message);
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
