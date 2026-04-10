import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Get creator record
  const { data: creator, error: creatorErr } = await admin
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (creatorErr || !creator) {
    return NextResponse.json(
      { error: "Creator profile not found" },
      { status: 404 },
    );
  }

  // Get categories with pricing
  const { data: categories, error: catErr } = await admin
    .from("creator_categories")
    .select("id, category, price_per_generation_paise")
    .eq("creator_id", creator.id);

  if (catErr) {
    return NextResponse.json({ error: catErr.message }, { status: 500 });
  }

  return NextResponse.json({ categories: categories ?? [] });
}
