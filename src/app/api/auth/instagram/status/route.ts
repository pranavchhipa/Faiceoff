import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

// GET /api/auth/instagram/status
// Returns the connected creator's IG profile snapshot (safe, no token).
// Onboarding + settings UI polls this to render the connected-state card.
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient() as Admin;
  const { data: creator } = await admin
    .from("creators")
    .select(
      "instagram_verified, instagram_handle, instagram_followers, instagram_account_type, instagram_profile_pic_url, instagram_media_count, instagram_insights, instagram_last_synced_at, instagram_connected_at, instagram_token_expires_at",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (!creator) {
    return NextResponse.json({ verified: false, manual: null });
  }

  return NextResponse.json({
    verified: Boolean(creator.instagram_verified),
    handle: creator.instagram_handle ?? null,
    followers: creator.instagram_followers ?? null,
    account_type: creator.instagram_account_type ?? null,
    profile_pic_url: creator.instagram_profile_pic_url ?? null,
    media_count: creator.instagram_media_count ?? null,
    insights: creator.instagram_insights ?? null,
    last_synced_at: creator.instagram_last_synced_at ?? null,
    connected_at: creator.instagram_connected_at ?? null,
    token_expires_at: creator.instagram_token_expires_at ?? null,
  });
}
