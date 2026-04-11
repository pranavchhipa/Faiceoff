import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  // --- Auth ---
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // --- Validate body ---
  let body: {
    creator_id?: string;
    name?: string;
    description?: string | null;
    budget_paise?: number;
    max_generations?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { creator_id, name, description, budget_paise, max_generations } = body;

  if (!creator_id || !name || !budget_paise || !max_generations) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // --- Verify user is a brand ---
  const { data: brand, error: brandError } = await admin
    .from("brands")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (brandError || !brand) {
    return NextResponse.json(
      { error: "Brand profile not found" },
      { status: 403 },
    );
  }

  // --- Verify creator exists ---
  const { data: creator, error: creatorError } = await admin
    .from("creators")
    .select("id")
    .eq("id", creator_id)
    .eq("is_active", true)
    .single();

  if (creatorError || !creator) {
    return NextResponse.json(
      { error: "Creator not found or inactive" },
      { status: 404 },
    );
  }

  // --- Create campaign ---
  const { data: campaign, error: campError } = await admin
    .from("campaigns")
    .insert({
      brand_id: brand.id,
      creator_id,
      name: name.trim(),
      description: description ?? null,
      budget_paise,
      max_generations,
      status: "active" as const,
    })
    .select("id")
    .single();

  if (campError || !campaign) {
    return NextResponse.json(
      { error: campError?.message ?? "Failed to create campaign" },
      { status: 500 },
    );
  }

  return NextResponse.json({ campaign_id: campaign.id }, { status: 201 });
}
