// POST /api/brand/verification/submit
//
// Flow B final step: the brand has already (1) pulled official GST details via
// /verify-gst and (2) uploaded its GST certificate via /document. This route
// flips the existing brand_verifications row to 'pending' for a Control Centre
// operator to review. No body needed — everything is already persisted.
//
// brands.is_verified stays false until the operator approves.
import { NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitNotification } from "@/lib/notifications/emit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export async function POST() {
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
      return NextResponse.json({ error: "Brand not found" }, { status: 403 });

    if (brand.is_verified) {
      return NextResponse.json(
        { error: "already_verified", message: "Your brand is already verified." },
        { status: 400 },
      );
    }

    const { data: ver } = await admin
      .from("brand_verifications")
      .select("gst_status, gst_certificate_path")
      .eq("brand_id", brand.id)
      .maybeSingle();

    // The certificate is the one hard requirement — it is what the operator
    // actually reads when approving.
    if (!ver?.gst_certificate_path) {
      return NextResponse.json(
        {
          error: "certificate_missing",
          message: "Upload your GST registration certificate before submitting.",
        },
        { status: 400 },
      );
    }

    // The automated GST pull is STRONGLY preferred but not mandatory. It runs
    // against a third-party scraper of the GST portal; when that vendor is
    // down (it returns ALB 502s) an unverified brand could not submit at all,
    // and since verification gates start-payment, a vendor outage quietly
    // froze all new collab revenue. The operator already reviews every
    // submission by hand with the certificate in front of them, so a
    // submission without the auto-pull is reviewable — it just needs to be
    // labelled so the operator knows to verify the GSTIN themselves.
    const autoVerified = Boolean(ver?.gst_status);

    const nowIso = new Date().toISOString();
    const { error: updateErr } = await admin
      .from("brand_verifications")
      .update({
        status: "pending",
        submitted_at: nowIso,
        manual_gst_review: !autoVerified,
        reviewed_by: null,
        reviewed_at: null,
        rejection_reason: null,
        updated_at: nowIso,
      })
      .eq("brand_id", brand.id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    after(async () => {
      await emitNotification(admin, {
        userId: user.id,
        type: "system",
        title: "Submitted for verification",
        body: "Submitted for verification — we'll review your GST + certificate shortly.",
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
