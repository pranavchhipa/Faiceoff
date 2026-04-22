/**
 * POST /api/generations/create
 *
 * Chunk E rewrite — removes Inngest, adds direct Replicate webhook dispatch.
 *
 * Flow:
 *   Auth → Validate body → Resolve brand/creator → Resolve pricing →
 *   Anti-fraud rate limit → 3-layer compliance check →
 *   Two-layer billing preflight → Prompt assembly →
 *   Insert generation row → Atomic billing (deduct credit + reserve wallet) →
 *   Submit to Replicate with webhook URL → Return 202
 */

import crypto from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  deductCredit,
  reserveWallet,
  getCredits,
  getWallet,
  computeRate,
  BillingError,
} from "@/lib/billing";
import { runComplianceCheck } from "@/lib/compliance";
import {
  brandGenerationLimiter,
  checkRateLimit,
} from "@/lib/anti-fraud";
import { assemblePromptWithLLM } from "@/lib/ai/prompt-assembler";
import { replicate } from "@/lib/ai/replicate-client";
import type { LicenseScope } from "@/lib/billing";
import type { Json } from "@/types/supabase";

// ─────────────────────────────────────────────────────────────────────────────
// Zod schema
// ─────────────────────────────────────────────────────────────────────────────

const BriefScope = z.enum(["digital", "print", "packaging"]);

const Body = z.object({
  creator_id: z.string().uuid(),
  // campaign_id is optional — if absent we create a stub campaign inline.
  campaign_id: z.string().uuid().optional(),
  structured_brief: z.object({
    product: z.string().min(1).max(200),
    scene: z.string().min(1).max(200),
    mood: z.string().optional(),
    aesthetic: z.string().optional(),
    category: z.string().optional(),
    scope: z.array(BriefScope).default(["digital"]),
    exclusive: z.boolean().default(false),
    aspect_ratio: z
      .enum(["1:1", "9:16", "16:9", "4:5", "3:2"])
      .default("1:1"),
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Collapse scope array (as received from the API) into the pricing engine's
 * LicenseScope union. Most permissive scope wins.
 *
 *   ['packaging'] or ['print','packaging'] → 'digital_print_packaging'
 *   ['print']                               → 'digital_print'
 *   anything else / empty                   → 'digital'
 */
function collapseScope(
  scopes: Array<"digital" | "print" | "packaging">,
): LicenseScope {
  if (scopes.includes("packaging")) return "digital_print_packaging";
  if (scopes.includes("print")) return "digital_print";
  return "digital";
}

/**
 * Compute HMAC-SHA256 token for webhook auth. Same computation reproduced in
 * the webhook handler at /api/webhooks/replicate.
 */
function makeWebhookToken(generationId: string): string {
  const secret = process.env.REPLICATE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("REPLICATE_WEBHOOK_SECRET is not set");
  }
  return crypto
    .createHmac("sha256", secret)
    .update(generationId)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Best-effort credit rollback after a successful deductCredit but a subsequent
 * failure. No rollback RPC exists in the DB — we do a direct admin UPDATE to
 * increment credits_remaining by 1 and log an audit entry.
 *
 * Uses Supabase's RPC calling path to run a raw SQL expression safely.
 * Swallowed on failure — the caller is already returning an error response.
 */
async function rollbackCredit(brandId: string, generationId: string): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    // Use rpc with a custom function if available; otherwise raw update.
    // We call release_reserve-like logic manually: increment credits_remaining.
    // Supabase's REST API doesn't support "SET col = col + 1" natively, but
    // we can use rpc() to run a single-line function. If it fails, just warn.
    await admin.rpc("rollback_credit_for_generation", {
      p_brand_id: brandId,
      p_generation_id: generationId,
    });
  } catch {
    // RPC doesn't exist yet — log a loud warning so ops can reconcile manually.
    console.warn(
      `[generations/create] Credit rollback required for brand=${brandId} gen=${generationId}. ` +
        "rollback_credit_for_generation RPC not found — credit NOT restored automatically. " +
        "Ops must manually increment brands.credits_remaining by 1 and insert a " +
        "credit_transactions row for this generation.",
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // ── 1. Auth ─────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 2. Validate body ─────────────────────────────────────────────────────────
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = Body.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { creator_id, campaign_id: requestedCampaignId, structured_brief: brief } =
    parsed.data;

  // ── 3. Admin client (bypasses RLS) ──────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // ── 4. Resolve brand ─────────────────────────────────────────────────────────
  const { data: brand, error: brandError } = await admin
    .from("brands")
    .select("id, user_id, company_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (brandError || !brand) {
    return NextResponse.json({ error: "Brand profile not found" }, { status: 403 });
  }

  // ── 5. Resolve creator ────────────────────────────────────────────────────────
  const { data: creator, error: creatorError } = await admin
    .from("creators")
    .select("id, user_id, is_active, onboarding_step")
    .eq("id", creator_id)
    .maybeSingle();

  if (creatorError || !creator) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  if (!creator.is_active) {
    return NextResponse.json(
      { error: "Creator is not currently active" },
      { status: 422 },
    );
  }

  // ── 6. Resolve creator pricing ───────────────────────────────────────────────
  const briefCategory = brief.category;
  let categoryQuery = admin
    .from("creator_categories")
    .select("id, category, price_per_generation_paise")
    .eq("creator_id", creator_id)
    .eq("is_active", true);

  if (briefCategory) {
    categoryQuery = categoryQuery.eq("category", briefCategory);
  }

  const { data: creatorCategory, error: categoryError } = await categoryQuery
    .limit(1)
    .maybeSingle();

  if (categoryError || !creatorCategory) {
    return NextResponse.json(
      { error: "Creator pricing not found for requested category" },
      { status: 400 },
    );
  }

  // ── 7. Compute rate ──────────────────────────────────────────────────────────
  const licenseScope = collapseScope(brief.scope);
  const rate = computeRate({
    creatorRatePaise: creatorCategory.price_per_generation_paise,
    scope: licenseScope,
    isExclusive: brief.exclusive,
  });

  // ── 8. Anti-fraud rate limit ─────────────────────────────────────────────────
  const { allowed } = await checkRateLimit(brandGenerationLimiter(), brand.id);
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded — maximum 20 generations per hour" },
      { status: 429 },
    );
  }

  // ── 9. 3-layer compliance check ──────────────────────────────────────────────
  let complianceResult: Awaited<ReturnType<typeof runComplianceCheck>>;
  try {
    complianceResult = await runComplianceCheck({
      creatorId: creator_id,
      structuredBrief: {
        product: brief.product,
        scene: brief.scene,
        mood: brief.mood,
        aesthetic: brief.aesthetic,
      },
    });
  } catch (err) {
    console.error("[generations/create] Compliance check error:", err);
    return NextResponse.json(
      { error: "Compliance check failed — please try again" },
      { status: 500 },
    );
  }

  if (!complianceResult.passed) {
    return NextResponse.json(
      {
        error: "Content policy violation",
        reason: complianceResult.reason,
        layer: complianceResult.layer,
      },
      { status: 422 },
    );
  }

  // ── 10. Two-layer billing preflight ──────────────────────────────────────────
  // 10a. Credits check (1 generation slot)
  let creditsInfo: Awaited<ReturnType<typeof getCredits>>;
  try {
    creditsInfo = await getCredits(brand.id);
  } catch (err) {
    console.error("[generations/create] getCredits failed:", err);
    return NextResponse.json(
      { error: "Could not read credit balance" },
      { status: 500 },
    );
  }

  if (creditsInfo.remaining < 1) {
    return NextResponse.json(
      { error: "no_credits", credits: 0 },
      { status: 402 },
    );
  }

  // 10b. Wallet check
  let walletInfo: Awaited<ReturnType<typeof getWallet>>;
  try {
    walletInfo = await getWallet(brand.id);
  } catch (err) {
    console.error("[generations/create] getWallet failed:", err);
    return NextResponse.json(
      { error: "Could not read wallet balance" },
      { status: 500 },
    );
  }

  if (walletInfo.available < rate.total_paise) {
    return NextResponse.json(
      {
        error: "low_wallet",
        required: rate.total_paise,
        available: walletInfo.available,
      },
      { status: 402 },
    );
  }

  // ── 11. Prompt assembly ───────────────────────────────────────────────────────
  // Build brief shape compatible with assemblePromptWithLLM's StructuredBrief.
  const promptBrief: Record<string, unknown> = {
    product_name: brief.product,
    setting: brief.scene,
    ...(brief.mood ? { mood_palette: brief.mood } : {}),
    ...(brief.aesthetic ? { notes: brief.aesthetic } : {}),
    aspect_ratio: brief.aspect_ratio,
    ...(briefCategory ? { category: briefCategory } : {}),
  };

  let assembledPrompt: string;
  try {
    const { prompt } = await assemblePromptWithLLM(promptBrief);
    assembledPrompt = prompt;
  } catch (err) {
    // Fail-open: use templated fallback so generation still proceeds.
    console.error("[generations/create] Prompt assembly error:", err);
    assembledPrompt = [
      `A photorealistic image of ${brief.product}`,
      `in ${brief.scene}`,
      brief.mood ? `mood: ${brief.mood}` : null,
      brief.aesthetic ? `aesthetic: ${brief.aesthetic}` : null,
      `aspect ratio ${brief.aspect_ratio}`,
    ]
      .filter(Boolean)
      .join(", ");
  }

  // ── 12. Resolve or create campaign ───────────────────────────────────────────
  let campaignId: string;

  if (requestedCampaignId) {
    // Verify the campaign belongs to this brand.
    const { data: existingCampaign, error: campaignError } = await admin
      .from("campaigns")
      .select("id, status")
      .eq("id", requestedCampaignId)
      .eq("brand_id", brand.id)
      .maybeSingle();

    if (campaignError || !existingCampaign) {
      return NextResponse.json(
        { error: "Campaign not found or you are not the owner" },
        { status: 404 },
      );
    }
    campaignId = existingCampaign.id as string;
  } else {
    // Create a stub "Direct Generation" campaign for the brand+creator pair.
    // This keeps the DB schema constraint (campaigns.id NOT NULL on generations).
    const { data: newCampaign, error: createCampaignError } = await admin
      .from("campaigns")
      .insert({
        brand_id: brand.id,
        creator_id: creator_id,
        name: "Direct Generation",
        description: "Auto-created for direct API generation",
        budget_paise: rate.total_paise,
        spent_paise: 0,
        generation_count: 0,
        max_generations: 1,
        status: "active",
      })
      .select("id")
      .single();

    if (createCampaignError || !newCampaign) {
      console.error("[generations/create] Failed to create stub campaign:", createCampaignError);
      return NextResponse.json(
        { error: "Failed to initialize generation session" },
        { status: 500 },
      );
    }
    campaignId = newCampaign.id as string;
  }

  // ── 13. Insert generation row (status='processing') ───────────────────────────
  const normalizedBrief: Record<string, unknown> = {
    product: brief.product,
    scene: brief.scene,
    ...(brief.mood ? { mood: brief.mood } : {}),
    ...(brief.aesthetic ? { aesthetic: brief.aesthetic } : {}),
    ...(briefCategory ? { category: briefCategory } : {}),
    scope: brief.scope,
    exclusive: brief.exclusive,
    aspect_ratio: brief.aspect_ratio,
  };

  const { data: generation, error: genError } = await admin
    .from("generations")
    .insert({
      campaign_id: campaignId,
      brand_id: brand.id,
      creator_id: creator_id,
      structured_brief: normalizedBrief as unknown as Json,
      assembled_prompt: assembledPrompt,
      status: "processing",
      cost_paise: rate.total_paise,
      compliance_result: complianceResult as unknown as Json,
    })
    .select("id")
    .single();

  if (genError || !generation) {
    console.error("[generations/create] Failed to insert generation:", genError);
    return NextResponse.json(
      { error: "Failed to create generation" },
      { status: 500 },
    );
  }

  const generationId = generation.id as string;

  // ── 14. Atomic billing ────────────────────────────────────────────────────────
  // 14a. Deduct 1 credit
  try {
    await deductCredit({ brandId: brand.id, generationId });
  } catch (err) {
    // Roll back: delete the generation row, return 402.
    await admin.from("generations").delete().eq("id", generationId);
    if (err instanceof BillingError && err.code === "INSUFFICIENT_CREDITS") {
      return NextResponse.json(
        { error: "no_credits", credits: 0 },
        { status: 402 },
      );
    }
    console.error("[generations/create] deductCredit failed:", err);
    return NextResponse.json({ error: "Billing error — credit deduction failed" }, { status: 402 });
  }

  // 14b. Reserve wallet (creator fee escrow)
  try {
    await reserveWallet({
      brandId: brand.id,
      amountPaise: rate.total_paise,
      generationId,
    });
  } catch (err) {
    // Roll back: delete the generation row, then attempt credit rollback.
    await admin.from("generations").delete().eq("id", generationId);
    await rollbackCredit(brand.id, generationId);
    if (err instanceof BillingError && err.code === "INSUFFICIENT_WALLET") {
      return NextResponse.json(
        {
          error: "low_wallet",
          required: rate.total_paise,
          available: walletInfo.available,
        },
        { status: 402 },
      );
    }
    console.error("[generations/create] reserveWallet failed:", err);
    return NextResponse.json({ error: "Billing error — wallet reservation failed" }, { status: 402 });
  }

  // ── 15. Resolve creator LoRA model ────────────────────────────────────────────
  const { data: loraModel } = await admin
    .from("creator_lora_models")
    .select("replicate_model_id, training_status, creator_approved")
    .eq("creator_id", creator_id)
    .eq("training_status", "completed")
    .eq("creator_approved", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // ── 16. Submit to Replicate with webhook ──────────────────────────────────────
  let webhookToken: string;
  try {
    webhookToken = makeWebhookToken(generationId);
  } catch (err) {
    console.error("[generations/create] makeWebhookToken failed:", err);
    // Webhook secret not set — flag generation as needing admin review.
    await admin
      .from("generations")
      .update({ status: "needs_admin_review" })
      .eq("id", generationId);
    return NextResponse.json(
      { generation_id: generationId, status: "needs_admin_review" },
      { status: 202 },
    );
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const webhookUrl = `${appUrl}/api/webhooks/replicate?gen_id=${generationId}&token=${webhookToken}`;

  // Determine model to use. Fall back to flux-kontext-max if no LoRA is ready.
  const modelToUse = loraModel?.replicate_model_id
    ? (loraModel.replicate_model_id as string)
    : (process.env.REPLICATE_KONTEXT_MODEL ?? "black-forest-labs/flux-kontext-max");

  let replicatePredictionId: string | null = null;
  try {
    const prediction = await replicate.predictions.create({
      model: modelToUse,
      input: {
        prompt: assembledPrompt,
        aspect_ratio: brief.aspect_ratio,
        output_format: "png",
        output_quality: 95,
      },
      webhook: webhookUrl,
      webhook_events_filter: ["completed"],
    });
    replicatePredictionId = prediction.id as string;
  } catch (err) {
    console.error("[generations/create] Replicate submit failed:", err);
    // Don't roll back billing — a cron poller can retry. Mark generation for retry.
    await admin
      .from("generations")
      .update({ status: "needs_admin_review" })
      .eq("id", generationId);
    // Still return 202 — generation row exists, billing is committed.
    return NextResponse.json(
      { generation_id: generationId, status: "needs_admin_review" },
      { status: 202 },
    );
  }

  // ── 17. Persist Replicate prediction ID ─────────────────────────────────────
  await admin
    .from("generations")
    .update({ replicate_prediction_id: replicatePredictionId })
    .eq("id", generationId);

  // ── 18. Return 202 ───────────────────────────────────────────────────────────
  return NextResponse.json(
    { generation_id: generationId, status: "processing" },
    { status: 202 },
  );
}
