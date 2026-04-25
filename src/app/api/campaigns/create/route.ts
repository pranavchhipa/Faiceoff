import { NextResponse } from "next/server";
import { after } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runGenerationsBatch } from "@/lib/ai/run-generation";
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

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

  // --- Pre-flight wallet check (against new two_layer_billing schema) ---
  // The legacy create_campaign_with_escrow RPC was dropped in migration
  // 00025 (it operated on the retired wallet_transactions/user_id model).
  // Inline equivalent below: check available balance, insert collab_session,
  // insert N draft generations. Per-gen credit deduct + wallet reserve
  // happens later inside runGeneration (so partial failures only burn one
  // generation, not the whole campaign).
  const { data: brandBilling, error: brandBillingError } = await admin
    .from("v_brand_billing")
    .select("wallet_available_paise, credits_remaining")
    .eq("brand_id", brand.id)
    .maybeSingle();

  if (brandBillingError || !brandBilling) {
    Sentry.captureException(brandBillingError ?? new Error("billing view missing"), {
      tags: { route: "campaigns/create", phase: "billing_check" },
      extra: { brand_id: brand.id },
    });
    return NextResponse.json(
      { error: "Could not read brand billing balances" },
      { status: 500 },
    );
  }

  const walletAvailable = (brandBilling.wallet_available_paise as number) ?? 0;
  const creditsRemaining = (brandBilling.credits_remaining as number) ?? 0;

  if (walletAvailable < budget_paise) {
    return NextResponse.json(
      {
        error: "Insufficient wallet balance. Please top up your wallet.",
        required_paise: budget_paise,
        available_paise: walletAvailable,
      },
      { status: 402 },
    );
  }

  if (creditsRemaining < count) {
    return NextResponse.json(
      {
        error: "Insufficient credits. Please top up.",
        required_credits: count,
        available_credits: creditsRemaining,
      },
      { status: 402 },
    );
  }

  // --- 1. Insert collab_session (renamed from campaigns in migration 00025) ---
  const { data: sessionRow, error: sessionError } = await admin
    .from("collab_sessions")
    .insert({
      brand_id: brand.id,
      creator_id: creator.id,
      name,
      description,
      budget_paise,
      max_generations: count,
      status: "active",
    })
    .select("id")
    .single();

  if (sessionError || !sessionRow) {
    Sentry.captureException(sessionError ?? new Error("collab_session insert failed"), {
      tags: { route: "campaigns/create", phase: "session_insert" },
      extra: { brand_id: brand.id, creator_id: creator.id },
    });
    return NextResponse.json(
      { error: "Failed to create campaign session" },
      { status: 500 },
    );
  }

  const campaign_id = sessionRow.id as string;

  // --- 2. Insert N draft generation rows ---
  const genRows = Array.from({ length: count }).map(() => ({
    collab_session_id: campaign_id,
    brand_id: brand.id,
    creator_id: creator.id,
    structured_brief: brief as unknown as Json,
    status: "draft" as const,
    cost_paise: price_per_generation_paise,
  }));

  const { data: insertedGens, error: genError } = await admin
    .from("generations")
    .insert(genRows)
    .select("id");

  if (genError || !insertedGens) {
    // Roll back the session row so the brand doesn't see an empty
    // campaign with zero generations sitting in their list.
    await admin.from("collab_sessions").delete().eq("id", campaign_id);
    Sentry.captureException(genError ?? new Error("generations insert failed"), {
      tags: { route: "campaigns/create", phase: "generations_insert" },
      extra: { brand_id: brand.id, campaign_id, count },
    });
    return NextResponse.json(
      { error: "Failed to create generation rows" },
      { status: 500 },
    );
  }

  const generation_ids = (insertedGens as Array<{ id: string }>).map((g) => g.id);

  // Dispatch Gemini generation pipeline in the background. Each generation
  // is fired in parallel via `after()` so the response returns immediately —
  // the brand UI then polls /api/generations/[id] for status updates.
  //
  // Kill switch: IMAGE_PROVIDER=flux skips dispatch (legacy Replicate path
  // is no longer wired into campaigns/create — flag exists for future
  // rollback work, see runbooks/v2-pipeline-rollout.md).
  const provider = process.env.IMAGE_PROVIDER ?? "gemini";
  if (provider === "gemini") {
    after(async () => {
      try {
        await runGenerationsBatch(generation_ids);
      } catch (err) {
        // runGenerationsBatch never throws (uses allSettled), but guard anyway.
        console.error("[campaigns/create] background dispatch failed", err);
        Sentry.captureException(err, {
          tags: { route: "campaigns/create", phase: "background" },
          extra: { campaign_id, generation_ids },
        });
      }
    });
  } else {
    console.warn(
      `[campaigns/create] IMAGE_PROVIDER=${provider} — generations not dispatched. ` +
        `${generation_ids.length} draft generations will need manual replay.`,
    );
  }

  return NextResponse.json({ campaign_id, generation_ids }, { status: 201 });
}
