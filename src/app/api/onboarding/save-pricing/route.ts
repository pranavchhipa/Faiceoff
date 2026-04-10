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

  const { prices } = await request.json();

  if (!prices || typeof prices !== "object") {
    return NextResponse.json(
      { error: "Prices object is required" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Get creator record to verify ownership
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

  // Update each category price
  for (const [categoryId, paise] of Object.entries(prices)) {
    const { error: updateErr } = await admin
      .from("creator_categories")
      .update({ price_per_generation_paise: paise as number })
      .eq("id", categoryId)
      .eq("creator_id", creator.id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
