import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
  // GST + PAN are NO LONGER collected here — they are pulled + verified through
  // the GSTVerify API on the dedicated /brand/verify page. Onboarding is just a
  // quick profile: company name (required), website + industry (optional).
  let body: {
    company_name?: string;
    website_url?: string | null;
    industry?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const companyName = (body.company_name ?? "").trim();
  const websiteUrl = body.website_url?.trim() || null;
  const industry = body.industry?.trim() || null;

  if (!companyName) {
    return NextResponse.json(
      { error: "Company name is required" },
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

  // --- Update brand row (profile only) ---
  // is_verified stays UNCHANGED (false). GST verification happens on
  // /brand/verify via the GSTVerify API + operator review.
  const { error: updateError } = await admin
    .from("brands")
    .update({
      company_name: companyName,
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

  // --- Ensure a brand_verifications row exists so /brand/verify can fill it ---
  // No GST/PAN is collected here, so we never move the row to 'pending'. If a row
  // already exists (e.g. brand re-edits their profile), only refresh the company
  // name + keep its current verification status untouched. If none exists, seed a
  // 'not_started' row. Never crash on this — the profile already saved fine.
  const nowIso = new Date().toISOString();
  const { data: existingVer } = await admin
    .from("brand_verifications")
    .select("id")
    .eq("brand_id", existingBrand.id)
    .maybeSingle();

  if (existingVer) {
    const { error: verErr } = await admin
      .from("brand_verifications")
      .update({ company_name: companyName, updated_at: nowIso })
      .eq("id", existingVer.id);
    if (verErr) {
      console.warn("[brand-setup] verification update failed", verErr.message);
    }
  } else {
    const { error: verErr } = await admin.from("brand_verifications").insert({
      brand_id: existingBrand.id,
      status: "not_started",
      company_name: companyName,
      updated_at: nowIso,
    });
    if (verErr) {
      console.warn("[brand-setup] verification insert failed", verErr.message);
    }
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
