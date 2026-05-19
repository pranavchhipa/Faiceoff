import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncCreatorInstagram } from "@/lib/instagram/sync";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

// POST /api/auth/instagram/sync — manual resync trigger.
// Used by the "Refresh" button in /creator/settings and onboarding when
// a connected creator wants the latest follower count / insights.
export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient() as Admin;

  const { data: creator } = await admin
    .from("creators")
    .select(
      "id, instagram_user_id, instagram_access_token, instagram_token_expires_at, instagram_verified",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (!creator) {
    return NextResponse.json(
      { error: "Creator profile not found" },
      { status: 404 },
    );
  }

  if (!creator.instagram_verified) {
    return NextResponse.json(
      { error: "Instagram not connected" },
      { status: 400 },
    );
  }

  const result = await syncCreatorInstagram(admin, creator);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    profile: result.profile,
    insights: result.insights,
    token_refreshed: result.tokenRefreshed ?? false,
  });
}
