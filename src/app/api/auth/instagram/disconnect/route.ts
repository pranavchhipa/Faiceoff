import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

// POST /api/auth/instagram/disconnect — nulls out IG connection columns.
// Does NOT call IG to revoke; user must do that from Instagram settings
// if they want full revocation. Our row just stops referencing the token.
export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient() as Admin;

  const { data: creator } = await admin
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!creator) {
    return NextResponse.json(
      { error: "Creator profile not found" },
      { status: 404 },
    );
  }

  const { error: upErr } = await admin
    .from("creators")
    .update({
      instagram_user_id: null,
      instagram_access_token: null,
      instagram_token_expires_at: null,
      instagram_connected_at: null,
      instagram_account_type: null,
      instagram_profile_pic_url: null,
      instagram_media_count: null,
      instagram_insights: null,
      instagram_last_synced_at: null,
      instagram_verified: false,
      // Keep instagram_handle + instagram_followers (manual entry remains
      // valid even after disconnect)
    })
    .eq("id", creator.id);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
