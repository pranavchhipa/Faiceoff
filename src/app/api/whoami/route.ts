import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/whoami
 * Debug endpoint — returns the currently logged-in user + their DB rows.
 * Useful for diagnosing session / role / multi-account issues.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ loggedIn: false });
  }

  const admin = createAdminClient();

  const [
    { data: publicUser },
    { data: creator },
    { data: brand },
    { data: photoCount },
  ] = await Promise.all([
    admin
      .from("users")
      .select("id, email, role, display_name")
      .eq("id", user.id)
      .maybeSingle(),
    admin.from("creators").select("id, onboarding_step").eq("user_id", user.id).maybeSingle(),
    admin.from("brands").select("id, company_name").eq("user_id", user.id).maybeSingle(),
    admin
      .from("creator_reference_photos")
      .select("id", { count: "exact", head: true })
      .eq("creator_id", (await admin.from("creators").select("id").eq("user_id", user.id).maybeSingle()).data?.id ?? "00000000-0000-0000-0000-000000000000"),
  ]);

  return NextResponse.json({
    loggedIn: true,
    auth: {
      id: user.id,
      email: user.email,
      metadata_role: user.user_metadata?.role ?? null,
      metadata_display_name: user.user_metadata?.display_name ?? null,
    },
    public_users_row: publicUser,
    has_creator_row: Boolean(creator),
    creator: creator,
    has_brand_row: Boolean(brand),
    brand: brand,
    photo_count: photoCount ?? 0,
  });
}
