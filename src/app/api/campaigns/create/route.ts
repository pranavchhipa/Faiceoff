import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/inngest/client";
import { StructuredBriefSchema } from "@/domains/generation/structured-brief";
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

  // --- Parse body ---
  let body: {
    creator_id?: unknown;
    count?: unknown;
    price_per_generation_paise?: unknown;
    structured_brief?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { creator_id, count, price_per_generation_paise, structured_brief } =
    body;

  if (
    !creator_id ||
    typeof creator_id !== "string" ||
    !count ||
    price_per_generation_paise === undefined ||
    price_per_generation_paise === null ||
    !structured_brief
  ) {
    return NextResponse.json(
      {
        error:
          "Missing required fields: creator_id, count, price_per_generation_paise, structured_brief",
      },
      { status: 400 },
    );
  }

  // --- Validate structured_brief ---
  const parsedBrief = StructuredBriefSchema.safeParse(structured_brief);
  if (!parsedBrief.success) {
    return NextResponse.json(
      { error: "Invalid structured_brief", details: parsedBrief.error.flatten() },
      { status: 400 },
    );
  }
  const brief = parsedBrief.data;

  // --- Validate count ---
  if (
    typeof count !== "number" ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 50
  ) {
    return NextResponse.json(
      { error: "count must be an integer between 1 and 50" },
      { status: 400 },
    );
  }

  // --- Validate price ---
  if (
    typeof price_per_generation_paise !== "number" ||
    !Number.isInteger(price_per_generation_paise) ||
    price_per_generation_paise <= 0
  ) {
    return NextResponse.json(
      { error: "price_per_generation_paise must be a positive integer" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // --- Look up brand ---
  const { data: brand } = await admin
    .from("brands")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!brand) {
    return NextResponse.json(
      { error: "Brand profile not found" },
      { status: 403 },
    );
  }

  // --- Look up creator ---
  const { data: creator } = await admin
    .from("creators")
    .select("id, user_id")
    .eq("id", creator_id)
    .eq("is_active", true)
    .maybeSingle();

  if (!creator) {
    return NextResponse.json(
      { error: "Creator not found or inactive" },
      { status: 404 },
    );
  }

  // --- Look up creator's display_name ---
  const { data: creatorUser } = await admin
    .from("users")
    .select("display_name")
    .eq("id", creator.user_id)
    .maybeSingle();

  const creatorName = creatorUser?.display_name ?? "creator";

  // --- Verify creator's category pricing ---
  let categoryQuery = admin
    .from("creator_categories")
    .select("price_per_generation_paise, category")
    .eq("creator_id", creator.id)
    .eq("is_active", true);

  if (brief._meta?.category) {
    categoryQuery = categoryQuery.eq("category", brief._meta.category);
  }

  const { data: creatorCategory } = await categoryQuery.limit(1).maybeSingle();

  if (!creatorCategory) {
    return NextResponse.json(
      { error: "Creator pricing not found for selected category" },
      { status: 400 },
    );
  }

  if (price_per_generation_paise !== creatorCategory.price_per_generation_paise) {
    return NextResponse.json(
      {
        error: "Price mismatch",
        expected_paise: creatorCategory.price_per_generation_paise,
        got_paise: price_per_generation_paise,
      },
      { status: 400 },
    );
  }

  // --- Compute campaign fields ---
  const budget_paise = price_per_generation_paise * count;
  const max_generations = count;
  const dateStr = new Date().toISOString().slice(0, 10);
  const name = `${brief.product_name} × ${creatorName} — ${dateStr}`;
  const aspectLabel = brief.aspect_ratio;
  const description = `${brief.product_name} shoot with ${creatorName}. ${aspectLabel} format, ${count} images.`;

  // --- Wallet balance check ---
  const { data: lastBrandTx } = await admin
    .from("wallet_transactions")
    .select("balance_after_paise")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const brandBalance = lastBrandTx?.balance_after_paise ?? 0;

  if (brandBalance < budget_paise) {
    return NextResponse.json(
      {
        error: "Insufficient wallet balance. Please top up your wallet.",
        required_paise: budget_paise,
        balance_paise: brandBalance,
      },
      { status: 402 },
    );
  }

  // --- Insert campaign ---
  const { data: campaign, error: campError } = await admin
    .from("campaigns")
    .insert({
      brand_id: brand.id,
      creator_id: creator.id,
      name: name.trim(),
      description,
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

  // --- Insert generation rows ---
  const generationRows = Array.from({ length: count }, () => ({
    campaign_id: campaign.id,
    brand_id: brand.id,
    creator_id: creator.id,
    structured_brief: brief as unknown as Json,
    status: "draft" as const,
    cost_paise: price_per_generation_paise,
  }));

  const { data: insertedGenerations, error: genError } = await admin
    .from("generations")
    .insert(generationRows)
    .select("id");

  if (genError || !insertedGenerations) {
    console.error(
      "[campaigns/create] Failed to insert generations for campaign",
      campaign.id,
      genError,
    );
    return NextResponse.json(
      {
        error:
          "Campaign created but generation rows could not be inserted. Contact support.",
        campaign_id: campaign.id,
      },
      { status: 500 },
    );
  }

  // --- Dispatch Inngest events ---
  await inngest.send(
    insertedGenerations.map((g) => ({
      name: "generation/created" as const,
      data: { generation_id: g.id },
    })),
  );

  return NextResponse.json(
    {
      campaign_id: campaign.id,
      generation_ids: insertedGenerations.map((g) => g.id),
    },
    { status: 201 },
  );
}
