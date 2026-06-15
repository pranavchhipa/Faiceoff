// GET /api/brand/verification — current verification state for the logged-in
// brand. Drives the brand "Get Verified" banner + the /brand/verify page.
//
// Flow B: returns the official GST fields pulled from the GSTVerify API (locked
// display values), whether a certificate has been uploaded, the review status,
// and any rejection reason.
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
    return NextResponse.json({ error: "Brand not found" }, { status: 403 });
  }

  const { data: ver } = await admin
    .from("brand_verifications")
    .select(
      "status, gst_number, pan_number, gst_legal_name, gst_trade_name, gst_status, gst_address, gst_constitution, gst_certificate_path, submitted_at, reviewed_at, rejection_reason",
    )
    .eq("brand_id", brand.id)
    .maybeSingle();

  return NextResponse.json({
    is_verified: brand.is_verified ?? false,
    status: ver?.status ?? "not_started",
    gst_number: ver?.gst_number ?? null,
    pan_number: ver?.pan_number ?? null,
    gst_legal_name: ver?.gst_legal_name ?? null,
    gst_trade_name: ver?.gst_trade_name ?? null,
    gst_status: ver?.gst_status ?? null,
    gst_address: ver?.gst_address ?? null,
    gst_constitution: ver?.gst_constitution ?? null,
    has_certificate: !!ver?.gst_certificate_path,
    submitted_at: ver?.submitted_at ?? null,
    reviewed_at: ver?.reviewed_at ?? null,
    rejection_reason: ver?.rejection_reason ?? null,
  });
}
