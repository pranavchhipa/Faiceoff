import { NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runDemoGeneration } from "@/lib/profile/run-demo-generation";
import {
  isValidCategory,
  FREE_REGENERATIONS_PER_CATEGORY,
  type DemoCategoryKey,
} from "@/lib/profile/demo-prompts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

/**
 * POST /api/creator/profile/regenerate
 *
 * Body: { category: string }
 *
 * - Archives the current visible demo for this (creator, category)
 * - Inserts a new pending row with incremented regeneration_count
 * - Fires after() → runDemoGeneration with a rotated variantIndex
 * - Enforces free quota:
 *     count < 3       → free
 *     count >= 3      → blocked (until creator-wallet credits ship)
 *
 * The variant index is `regeneration_count % 3` so successive regens cycle
 * through the 3 prompt variants for visual diversity.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { category?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isValidCategory(body.category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }
  const category = body.category as DemoCategoryKey;

  const admin = createAdminClient() as Admin;

  const { data: creator } = await admin
    .from("creators")
    .select("id, selected_categories")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!creator) {
    return NextResponse.json({ error: "Creator profile not found" }, { status: 404 });
  }
  const selected: string[] = creator.selected_categories ?? [];
  if (!selected.includes(category)) {
    return NextResponse.json(
      { error: "Category not in your selected list" },
      { status: 400 },
    );
  }

  // Find the current visible row
  const { data: current } = await admin
    .from("creator_demo_samples")
    .select("id, regeneration_count, status")
    .eq("creator_id", creator.id)
    .eq("category", category)
    .eq("is_visible", true)
    .maybeSingle();

  // Blocking edge: while a generation is in-flight, deny duplicate regen
  if (current && current.status === "pending") {
    return NextResponse.json(
      { error: "A demo is already generating for this category. Wait until it finishes." },
      { status: 409 },
    );
  }

  const previousCount: number = current?.regeneration_count ?? 0;
  // Retrying a FAILED sample is a system fault, not the creator's choice —
  // don't burn a regen credit on it. Only count "ready → regen" cycles.
  const isFailedRetry = current?.status === "failed";
  const nextCount = isFailedRetry ? previousCount : previousCount + 1;

  // Free quota check — block beyond 3 for MVP. (Future: deduct 1 credit
  // from creator wallet once that exists.)
  if (nextCount > FREE_REGENERATIONS_PER_CATEGORY) {
    return NextResponse.json(
      {
        error: "regeneration_limit_reached",
        detail: `You've used your ${FREE_REGENERATIONS_PER_CATEGORY} free regenerations for this category. Contact support@faiceoff.com to reset.`,
        free_quota: FREE_REGENERATIONS_PER_CATEGORY,
        used: previousCount,
      },
      { status: 402 },
    );
  }

  // Archive the current row (keep for audit + verify lookups)
  if (current) {
    await admin
      .from("creator_demo_samples")
      .update({ is_visible: false })
      .eq("id", current.id);
  }

  // Insert new pending row with the bumped count
  const { data: inserted, error: insErr } = await admin
    .from("creator_demo_samples")
    .insert({
      creator_id: creator.id,
      category,
      status: "pending",
      regeneration_count: nextCount,
    })
    .select("id")
    .single();
  if (insErr || !inserted) {
    return NextResponse.json(
      { error: insErr?.message ?? "Failed to queue regeneration" },
      { status: 500 },
    );
  }

  // Rotate through the 3 prompt variants
  const variantIndex = nextCount % 3;

  after(async () => {
    try {
      await runDemoGeneration(admin, {
        demoSampleId: inserted.id,
        creatorId: creator.id,
        category,
        variantIndex,
      });
    } catch (err) {
      console.error("[profile/regenerate] runDemoGeneration crashed", err);
    }
  });

  return NextResponse.json({
    success: true,
    sample_id: inserted.id,
    category,
    regeneration_count: nextCount,
    free_remaining: FREE_REGENERATIONS_PER_CATEGORY - nextCount,
  });
}
