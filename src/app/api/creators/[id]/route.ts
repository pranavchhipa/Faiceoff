import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/creators/:id
 *
 * Returns a single active creator's profile with categories.
 * Uses admin client to bypass RLS on users table.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Verify caller is authenticated
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
      kyc_status,
      user_id,
      users!inner (
        display_name,
        avatar_url
      ),
      creator_categories (
        id,
        category,
        subcategories,
        price_per_generation_paise,
        is_active
      )
    `
    )
    .eq("id", id)
    .eq("is_active", true)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Creator not found or is no longer available." },
      { status: 404 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any;
  const creator = {
    id: d.id,
    bio: d.bio,
    instagram_handle: d.instagram_handle,
    instagram_followers: d.instagram_followers,
    kyc_status: d.kyc_status,
    display_name: d.users?.display_name ?? "Creator",
    avatar_url: d.users?.avatar_url ?? null,
    categories: (d.creator_categories ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((cc: any) => cc.is_active)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((cc: any) => ({
        id: cc.id,
        category: cc.category,
        subcategories: cc.subcategories,
        price_per_generation_paise: cc.price_per_generation_paise,
        is_active: cc.is_active,
      })),
  };

  return NextResponse.json({ creator });
}
