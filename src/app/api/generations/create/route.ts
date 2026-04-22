import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/inngest/client";
import type { Json } from "@/types/supabase";

/**
 * Aspect ratios supported by the v2 pipeline (Nano Banana Pro / Kontext Max).
 * Kept in sync with src/domains/generation/types.ts#AspectRatio.
 */
const ALLOWED_ASPECT_RATIOS = ["1:1", "9:16", "16:9", "4:5", "3:2"] as const;
type AllowedAspectRatio = (typeof ALLOWED_ASPECT_RATIOS)[number];

function normalizeAspectRatio(input: unknown): AllowedAspectRatio {
  return typeof input === "string" &&
    (ALLOWED_ASPECT_RATIOS as readonly string[]).includes(input)
    ? (input as AllowedAspectRatio)
    : "1:1";
}

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

  // Normalize aspect_ratio on the brief before it's persisted. The pipeline
  // reads brief.aspect_ratio and defaults to "1:1" if missing — this is
  // defense-in-depth so only known values can flow through.
  const normalizedBrief: Record<string, unknown> = {
    ...structured_brief,
    aspect_ratio: normalizeAspectRatio(
      (structured_brief as Record<string, unknown>).aspect_ratio,
    ),
  };

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
  const briefCategory = normalizedBrief.category as string | undefined;

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

  // --- Check brand's credit balance ---
  // Campaign budget is a cap on what this campaign can spend, but it doesn't
  // guarantee the brand actually has the funds. Post Chunk C, the running
  // balance lives on `brands.credits_balance_paise` (see migration 00020).
  // `credits_reserved_paise` is the escrow hold on in-flight generations;
  // spendable = balance - reserved, clamped to zero.
  //
  // Supabase types in src/types/supabase.ts don't yet know about the new
  // credit columns — use a loose-typed handle. Types will self-fix on next
  // regen.
  const adminAny = admin as unknown as {
    from(table: string): {
      select(cols: string): {
        eq(col: string, val: string): {
          maybeSingle(): Promise<{
            data: Record<string, number | string | null> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
  const { data: brandCreditRow } = await adminAny
    .from("brands")
    .select("credits_balance_paise, credits_reserved_paise")
    .eq("id", brand.id)
    .maybeSingle();

  const creditsBalance =
    (brandCreditRow?.credits_balance_paise as number | undefined) ?? 0;
  const creditsReserved =
    (brandCreditRow?.credits_reserved_paise as number | undefined) ?? 0;
  const brandBalance = Math.max(0, creditsBalance - creditsReserved);

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
      structured_brief: normalizedBrief as unknown as Json,
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
