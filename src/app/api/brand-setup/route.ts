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

  const admin = createAdminClient();

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
  const { error: updateError } = await admin
    .from("brands")
    .update({
      company_name: companyName,
      gst_number: gstNumber,
      website_url: websiteUrl,
      industry: industry,
      is_verified: true,
    })
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
