import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
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
    campaign_name?: unknown;
    count?: unknown;
    price_per_generation_paise?: unknown;
    structured_brief?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { creator_id, campaign_name, count, price_per_generation_paise, structured_brief } =
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

  // --- Require _meta.category (prevents non-deterministic category lookup) ---
  if (!brief._meta?.category) {
    return NextResponse.json(
      { error: "structured_brief._meta.category is required" },
      { status: 400 },
    );
  }
  const category = brief._meta.category;

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

  // --- Verify creator's category pricing (deterministic: requires _meta.category) ---
  const { data: creatorCategory } = await admin
    .from("creator_categories")
    .select("price_per_generation_paise, category")
    .eq("creator_id", creator.id)
    .eq("category", category)
    .eq("is_active", true)
    .maybeSingle();

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
  const dateStr = new Date().toISOString().slice(0, 10);
  const providedName =
    typeof campaign_name === "string" ? campaign_name.trim().slice(0, 80) : "";
  const name = providedName || `${brief.product_name} × ${creatorName} — ${dateStr}`;
  const aspectLabel = brief.aspect_ratio;
  const description = `${brief.product_name} shoot with ${creatorName}. ${aspectLabel} format, ${count} images.`;

  // --- Atomically create campaign + escrow via RPC ---
  const { data: rpcData, error: rpcError } = await admin.rpc(
    "create_campaign_with_escrow",
    {
      p_brand_id: brand.id,
      p_user_id: user.id,
      p_creator_id: creator.id,
      p_name: name,
      p_description: description,
      p_budget_paise: budget_paise,
      p_max_generations: count,
      p_price_per_generation_paise: price_per_generation_paise,
      p_structured_brief: brief as unknown as Json,
    },
  );

  if (rpcError) {
    // Match "insufficient_balance:" prefix to return 402 instead of 500.
    if (rpcError.message?.startsWith("insufficient_balance:")) {
      return NextResponse.json(
        {
          error: "Insufficient wallet balance. Please top up your wallet.",
          required_paise: budget_paise,
        },
        { status: 402 },
      );
    }
    Sentry.captureException(rpcError, {
      tags: { route: "campaigns/create" },
      extra: { brand_id: brand.id, creator_id: creator.id },
    });
    return NextResponse.json(
      { error: "Failed to create campaign" },
      { status: 500 },
    );
  }

  const { campaign_id, generation_ids } = rpcData as {
    campaign_id: string;
    generation_ids: string[];
    balance_after_paise: number;
  };

  // Dispatch Inngest events — one per generation. Done OUTSIDE the RPC so a
  // failed send doesn't roll back the campaign. Use batch form.
  await inngest.send(
    generation_ids.map((id) => ({
      name: "generation/created" as const,
      data: { generation_id: id },
    })),
  );

  return NextResponse.json({ campaign_id, generation_ids }, { status: 201 });
}
