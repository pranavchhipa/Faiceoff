import { NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runGenerationsBatch } from "@/lib/ai/run-generation";
import { StructuredBriefSchema } from "@/domains/generation/structured-brief";
import { rateLimit } from "@/lib/redis/rate-limiter";
import { track } from "@/lib/observability/analytics";
import type { Json } from "@/types/supabase";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

// CRITICAL: image generation runs inside after() and takes 20-40s. Without
// this, Vercel kills the function at the default ~10s — the generation never
// finishes and the row stays stuck in 'generating'. 60s is the Vercel Hobby
// tier max (raise to 300 on Pro for high-detail / multi-stage gens).
export const maxDuration = 60;

// POST /api/collabs/[id]/generate
// Creates one generation for an active collab session, deducting 1 gen credit.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: collabId } = await params;

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limit: 10 generations per minute per user
  const rl = await rateLimit(`collab-generate:${user.id}`, 10, "1 m");
  if (!rl.success) return NextResponse.json({ error: "Too many requests. Slow down." }, { status: 429 });

  const admin = createAdminClient() as Admin;

  // Load session + verify brand ownership
  const { data: session } = await admin
    .from("collab_sessions")
    .select("id, status, brand_id, creator_id, gen_credits_total, gen_credits_used, final_images_target, approved_count, name")
    .eq("id", collabId)
    .maybeSingle();

  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (session.status !== "active") return NextResponse.json({ error: "Collab is not active" }, { status: 400 });

  const { data: brand } = await admin.from("brands").select("id").eq("user_id", user.id).maybeSingle();
  if (!brand || brand.id !== session.brand_id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Per-collab cap check (so brand can't exceed package iterations limit)
  const collabCapLeft = (session.gen_credits_total ?? 0) - (session.gen_credits_used ?? 0);
  if (collabCapLeft <= 0) return NextResponse.json({ error: "Per-collab generation limit reached. All package iterations used." }, { status: 400 });

  // Global wallet check (single-pool model)
  const { data: brandWallet } = await admin
    .from("brands")
    .select("credits_remaining")
    .eq("id", brand.id)
    .maybeSingle();
  const globalCredits = (brandWallet?.credits_remaining ?? 0) as number;
  if (globalCredits < 1) {
    return NextResponse.json({ error: "Out of credits. Top up to continue generating." }, { status: 400 });
  }

  // Parse + validate brief
  let rawBrief: unknown;
  try {
    const body = await request.json();
    rawBrief = body.structured_brief;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = StructuredBriefSchema.safeParse(rawBrief);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid brief", details: parsed.error.flatten() }, { status: 400 });
  }

  const brief = {
    ...parsed.data,
    _meta: { creator_id: session.creator_id },
  };

  // Fetch creator's active category for cost reference (cheapest active category)
  const { data: categories } = await admin
    .from("creator_categories")
    .select("price_per_generation_paise")
    .eq("creator_id", session.creator_id)
    .eq("is_active", true)
    .order("price_per_generation_paise", { ascending: true })
    .limit(1);

  const costPaise = categories?.[0]?.price_per_generation_paise ?? 0;

  // Atomically deduct from BOTH:
  //  1) brands.credits_remaining (global wallet — single-pool source of truth)
  //  2) collab_sessions.gen_credits_used (per-collab progress + cap counter)
  // Use optimistic concurrency on each so concurrent requests don't double-spend.

  const { data: globalUpd, error: globalErr } = await admin
    .from("brands")
    .update({ credits_remaining: globalCredits - 1 })
    .eq("id", brand.id)
    .eq("credits_remaining", globalCredits) // optimistic
    .select("id")
    .maybeSingle();
  if (globalErr || !globalUpd) {
    return NextResponse.json({ error: "Wallet update conflict, please retry" }, { status: 409 });
  }

  const { error: creditErr } = await admin
    .from("collab_sessions")
    .update({ gen_credits_used: session.gen_credits_used + 1 })
    .eq("id", collabId)
    .eq("gen_credits_used", session.gen_credits_used); // optimistic concurrency

  if (creditErr) {
    // Rollback the global deduction so balance stays correct
    await admin
      .from("brands")
      .update({ credits_remaining: globalCredits })
      .eq("id", brand.id);
    return NextResponse.json({ error: "Credit reservation failed, please retry" }, { status: 409 });
  }

  // Audit: log the spend in credit_transactions
  await admin.from("credit_transactions").insert({
    brand_id: brand.id,
    type: "spend",
    credits: -1,
    balance_after: globalCredits - 1,
    reference_type: "collab_session",
    reference_id: collabId,
    description: `Generation in collab "${session.name}"`,
  }).then(() => null).catch((e: unknown) => {
    console.error("[collabs/generate] ledger insert failed (non-fatal)", e);
  });

  // Insert draft generation
  const { data: gen, error: genErr } = await admin
    .from("generations")
    .insert({
      collab_session_id: collabId,
      brand_id: session.brand_id,
      creator_id: session.creator_id,
      status: "draft",
      structured_brief: brief as Json,
      cost_paise: costPaise,
      retry_count: 0,
      pipeline_version: "v3",
    })
    .select("id")
    .single();

  if (genErr || !gen) {
    // Rollback BOTH counters
    await admin
      .from("collab_sessions")
      .update({ gen_credits_used: session.gen_credits_used })
      .eq("id", collabId);
    await admin
      .from("brands")
      .update({ credits_remaining: globalCredits })
      .eq("id", brand.id);
    return NextResponse.json({ error: "Failed to create generation" }, { status: 500 });
  }

  track("generation_started", {
    collab_session_id: collabId,
    generation_id: gen.id,
    collab_cap_left: collabCapLeft - 1,
    global_credits_left: globalCredits - 1,
  }, user.id);

  // Phase 6 telemetry — pack_text engagement signal. The Studio's auto-fill
  // (Phase 6b) is supposed to drive this to ~0% over time; if it stays high
  // we know the vision call isn't being trusted.
  const packTextLen = typeof brief.pack_text === "string" ? brief.pack_text.trim().length : 0;
  if (packTextLen === 0) {
    track("pack_text_left_empty", { generation_id: gen.id }, user.id);
  } else {
    track(
      "pack_text_manually_edited",
      { generation_id: gen.id, text_length: packTextLen },
      user.id,
    );
  }

  after(async () => {
    try {
      await runGenerationsBatch([gen.id]);
    } catch (err) {
      console.error("[collab-generate] runGenerationsBatch failed", err);
    }
  });

  return NextResponse.json({ generation_id: gen.id }, { status: 201 });
}
