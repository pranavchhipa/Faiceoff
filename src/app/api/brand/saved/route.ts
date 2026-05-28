import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

/**
 * GET /api/brand/saved
 *
 * Returns the authenticated brand's list of saved creator ids (most
 * recently saved first). Powers the heart-state hydration on
 * /brand/discover so the UI knows which cards are already saved.
 *
 * Response: { creator_ids: string[] }
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient() as Admin;

  // Resolve brand id from the auth user. Brands can have only one row per
  // user so single() is safe here; if missing, the brand never finished
  // onboarding — return an empty list rather than 404 so the client UI
  // stays clean.
  const { data: brand } = await admin
    .from("brands")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!brand) {
    return NextResponse.json({ creator_ids: [] });
  }

  const { data, error } = await admin
    .from("brand_saved_creators")
    .select("creator_id, created_at")
    .eq("brand_id", brand.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[brand/saved] read failed", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    creator_ids: (data ?? []).map((r: { creator_id: string }) => r.creator_id),
  });
}
