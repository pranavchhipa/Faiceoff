// GET /api/creator/verification — current verification state for the logged-in
// creator. Drives the "Get Verified" dashboard card + the /creator/verify page.
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

  const { data: creator } = await admin
    .from("creators")
    .select("id, is_verified, onboarding_step, profile_slug, profile_published")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!creator) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  const { data: ver } = await admin
    .from("creator_verifications")
    .select(
      "status, aadhaar_path, pan_path, instagram_followed, submitted_at, reviewed_at, rejection_reason",
    )
    .eq("creator_id", creator.id)
    .maybeSingle();

  return NextResponse.json({
    is_verified: creator.is_verified ?? false,
    onboarding_complete: creator.onboarding_step === "complete",
    // Whether the gold tick has anywhere public to show. A verified creator
    // with no published profile sees the tick only inside their workspace,
    // which reads as "verification did nothing" — the verify page uses this
    // to point them at profile setup instead.
    profile_published: Boolean(creator.profile_published && creator.profile_slug),
    profile_slug: creator.profile_slug ?? null,
    status: ver?.status ?? "not_started",
    aadhaar_uploaded: !!ver?.aadhaar_path,
    pan_uploaded: !!ver?.pan_path,
    instagram_followed: ver?.instagram_followed ?? false,
    submitted_at: ver?.submitted_at ?? null,
    reviewed_at: ver?.reviewed_at ?? null,
    rejection_reason: ver?.rejection_reason ?? null,
  });
}
