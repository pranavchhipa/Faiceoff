// GET /api/brand/verification — current verification state for the logged-in
// brand. Drives the brand "Get Verified" banner + the /brand/verify page.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient() as Admin;

  const { data: brand } = await admin
    .from("brands")
    .select("id, is_verified")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  const { data: ver } = await admin
    .from("brand_verifications")
    .select(
      "status, gst_number, pan_number, company_name, legal_name, registered_address, submitted_at, reviewed_at, rejection_reason",
    )
    .eq("brand_id", brand.id)
    .maybeSingle();

  return NextResponse.json({
    is_verified: brand.is_verified ?? false,
    status: ver?.status ?? "not_started",
    gst_number: ver?.gst_number ?? null,
    pan_number: ver?.pan_number ?? null,
    company_name: ver?.company_name ?? null,
    legal_name: ver?.legal_name ?? null,
    registered_address: ver?.registered_address ?? null,
    submitted_at: ver?.submitted_at ?? null,
    reviewed_at: ver?.reviewed_at ?? null,
    rejection_reason: ver?.rejection_reason ?? null,
  });
}
