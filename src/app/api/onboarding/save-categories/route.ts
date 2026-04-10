import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { categories } = await request.json();

  if (!Array.isArray(categories) || categories.length === 0) {
    return NextResponse.json(
      { error: "At least one category is required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Get creator ID
  const { data: creator, error: creatorErr } = await admin
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (creatorErr || !creator) {
    return NextResponse.json(
      { error: "Creator profile not found" },
      { status: 404 }
    );
  }

  // Delete existing categories
  await admin
    .from("creator_categories")
    .delete()
    .eq("creator_id", creator.id);

  // Insert new categories
  const inserts = categories.map(
    (cat: { category: string; price_paise: number }) => ({
      creator_id: creator.id,
      category: cat.category,
      price_per_generation_paise: cat.price_paise,
      subcategories: [],
      is_active: true,
    })
  );

  const { error: insertErr } = await admin
    .from("creator_categories")
    .insert(inserts);

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Advance step
  await admin
    .from("creators")
    .update({ onboarding_step: "compliance" })
    .eq("user_id", user.id);

  return NextResponse.json({ success: true });
}
