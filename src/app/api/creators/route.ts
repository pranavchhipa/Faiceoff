import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/creators
 *
 * Returns all active creators with their display name, categories, and pricing.
 * Uses admin client to bypass RLS (users table restricts cross-user reads).
 * Caller must be authenticated.
 */
export async function GET() {
  // Verify the caller is authenticated
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("creators")
    .select(
      `
      id,
      bio,
      instagram_handle,
      instagram_followers,
      user_id,
      users!inner (
        display_name,
        avatar_url
      ),
      creator_categories (
        category,
        price_per_generation_paise,
        is_active
      )
    `
    )
    .eq("is_active", true);

  if (error) {
    console.error("[api/creators] Query error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Shape the response
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const creators = (data ?? []).map((c: any) => ({
    id: c.id,
    bio: c.bio,
    instagram_handle: c.instagram_handle,
    instagram_followers: c.instagram_followers,
    display_name: c.users?.display_name ?? "Creator",
    avatar_url: c.users?.avatar_url ?? null,
    categories: (c.creator_categories ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((cc: any) => cc.is_active)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((cc: any) => ({
        category: cc.category,
        price_per_generation_paise: cc.price_per_generation_paise,
      })),
  }));

  return NextResponse.json({ creators });
}
