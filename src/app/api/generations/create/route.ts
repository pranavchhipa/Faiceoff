import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/inngest/client";
import type { Json } from "@/types/supabase";

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
  let body: { campaign_id?: string; structured_brief?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { campaign_id, structured_brief } = body;

  if (!campaign_id || typeof campaign_id !== "string") {
    return NextResponse.json(
      { error: "campaign_id is required" },
      { status: 400 },
    );
  }

  if (
    !structured_brief ||
    typeof structured_brief !== "object" ||
    Array.isArray(structured_brief)
  ) {
    return NextResponse.json(
      { error: "structured_brief must be a JSON object" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // --- Verify user is the brand owner of the campaign ---
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

  const { data: campaign, error: campaignError } = await admin
    .from("campaigns")
    .select("*")
    .eq("id", campaign_id)
    .eq("brand_id", brand.id)
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json(
      { error: "Campaign not found or you are not the owner" },
      { status: 404 },
    );
  }

  // --- Check campaign status ---
  if (campaign.status !== "active") {
    return NextResponse.json(
      { error: "Campaign is not active" },
      { status: 400 },
    );
  }

  if (campaign.generation_count >= campaign.max_generations) {
    return NextResponse.json(
      { error: "Campaign has reached maximum generations" },
      { status: 400 },
    );
  }

  // --- Check budget against creator price ---
  // Try to match the category from structured_brief, fall back to first active category
  const briefCategory = structured_brief.category as string | undefined;

  let categoryQuery = admin
    .from("creator_categories")
    .select("price_per_generation_paise, category")
    .eq("creator_id", campaign.creator_id)
    .eq("is_active", true);

  if (briefCategory) {
    categoryQuery = categoryQuery.eq("category", briefCategory);
  }

  const { data: creatorCategory, error: categoryError } = await categoryQuery
    .limit(1)
    .single();

  if (categoryError || !creatorCategory) {
    return NextResponse.json(
      { error: "Creator pricing not found for selected category" },
      { status: 400 },
    );
  }

  const projectedSpend =
    campaign.spent_paise + creatorCategory.price_per_generation_paise;

  if (projectedSpend > campaign.budget_paise) {
    return NextResponse.json(
      { error: "Insufficient campaign budget for this generation" },
      { status: 400 },
    );
  }

  // --- Check brand's wallet balance ---
  // Campaign budget is a cap on what this campaign can spend, but it doesn't
  // guarantee the brand actually has the funds in their wallet. Check the
  // running balance so we don't accept generations the brand can't pay for.
  const { data: lastBrandTx } = await admin
    .from("wallet_transactions")
    .select("balance_after_paise")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const brandBalance = lastBrandTx?.balance_after_paise ?? 0;

  if (brandBalance < creatorCategory.price_per_generation_paise) {
    return NextResponse.json(
      {
        error: "Insufficient wallet balance. Please top up your wallet.",
        required_paise: creatorCategory.price_per_generation_paise,
        balance_paise: brandBalance,
      },
      { status: 402 },
    );
  }

  // --- Create generation row ---
  const { data: generation, error: genError } = await admin
    .from("generations")
    .insert({
      campaign_id: campaign.id,
      brand_id: brand.id,
      creator_id: campaign.creator_id,
      structured_brief: structured_brief as unknown as Json,
      status: "draft",
      cost_paise: creatorCategory.price_per_generation_paise,
    })
    .select("id")
    .single();

  if (genError || !generation) {
    return NextResponse.json(
      { error: "Failed to create generation" },
      { status: 500 },
    );
  }

  // --- Send Inngest event ---
  await inngest.send({
    name: "generation/created",
    data: { generation_id: generation.id },
  });

  return NextResponse.json({ generation_id: generation.id }, { status: 201 });
}
