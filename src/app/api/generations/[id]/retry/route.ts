/**
 * POST /api/generations/[id]/retry
 *
 * Brand action: image not satisfactory, request ONE iteration with text feedback.
 *
 * Pricing (final model — credit-only, single retry):
 *   - Each retry costs 1 CREDIT (deducted at request time)
 *   - Brand has only 1 retry per generation slot. retry_count > 0 → 409
 *   - On Gemini failure, the credit is auto-refunded by run-iteration.ts
 *
 * Body: { iteration_notes: string (1-500 chars) }
 *
 * Effect:
 *   - Old generation: status = 'discarded' (no refund — retry supersedes it)
 *   - New generation: 'draft' with structured_brief.iteration_notes +
 *     structured_brief.previous_image_url; cost_paise = 0; retry_count = 1
 *   - Background: runIteration() — image-to-image edit via Gemini
 *   - Returns: new_generation_id
 */

import { NextResponse, after } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runIteration } from "@/lib/ai/run-generation";
import type { Json } from "@/types/supabase";

// The retry iteration runs Gemini in after() (20-40s). Without this, Vercel
// kills the function at the default ~10s and the retry stays stuck. 60s = Hobby
// tier max.
export const maxDuration = 60;

const MAX_NOTES_LEN = 500;
const MIN_NOTES_LEN = 1;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // ── Auth ──
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse + validate body ──
  let iterationNotes: string;
  try {
    const body = await request.json();
    const raw = body?.iteration_notes;
    if (typeof raw !== "string") {
      return NextResponse.json(
        { error: "iteration_notes is required (string)" },
        { status: 400 },
      );
    }
    iterationNotes = raw.trim();
    if (iterationNotes.length < MIN_NOTES_LEN) {
      return NextResponse.json(
        { error: "Tell us what to change (can't be empty)" },
        { status: 400 },
      );
    }
    if (iterationNotes.length > MAX_NOTES_LEN) {
      return NextResponse.json(
        { error: `Keep it under ${MAX_NOTES_LEN} characters` },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // ── Verify brand ownership ──
  const { data: brand } = await admin
    .from("brands")
    .select("id, credits_remaining")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 403 });
  }

  // ── Load original generation ──
  const { data: original } = await admin
    .from("generations")
    .select(
      `id, status, brand_id, creator_id, collab_session_id, structured_brief,
       cost_paise, retry_count, image_url`,
    )
    .eq("id", id)
    .eq("brand_id", brand.id)
    .maybeSingle();

  if (!original) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (original.status !== "ready_for_brand_review") {
    return NextResponse.json(
      {
        error: `Cannot retry — generation is in ${original.status}`,
        status: original.status,
      },
      { status: 409 },
    );
  }

  // ── Hard cap: only 1 retry allowed ──
  const oldRetryCount = (original.retry_count as number) ?? 0;
  if (oldRetryCount > 0) {
    return NextResponse.json(
      {
        error: "You've already used your retry on this image. Send to creator or discard.",
      },
      { status: 409 },
    );
  }

  // ── Need the previous image to send back to Gemini ──
  if (!original.image_url) {
    return NextResponse.json(
      { error: "Cannot retry — original image is missing" },
      { status: 409 },
    );
  }

  // ── Pre-flight credit check ──
  const credits = (brand.credits_remaining ?? 0) as number;
  if (credits < 1) {
    return NextResponse.json(
      {
        error: "Insufficient credits for retry. Please top up.",
        required_credits: 1,
        available_credits: credits,
      },
      { status: 402 },
    );
  }

  // ── Atomic credit deduction (optimistic concurrency) ──
  const { data: deducted, error: deductErr } = await admin
    .from("brands")
    .update({ credits_remaining: credits - 1 })
    .eq("id", brand.id)
    .eq("credits_remaining", credits)
    .select("id")
    .maybeSingle();

  if (deductErr || !deducted) {
    return NextResponse.json(
      { error: "Wallet update conflict, please retry" },
      { status: 409 },
    );
  }

  // Audit ledger row (non-fatal)
  await admin
    .from("credit_transactions")
    .insert({
      brand_id: brand.id,
      type: "spend",
      credits: -1,
      balance_after: credits - 1,
      reference_type: "generation",
      reference_id: id,
      description: "Retry — 1 iteration with brand feedback",
    })
    .then(() => null)
    .catch((e: unknown) => {
      console.error("[retry] ledger insert failed (non-fatal)", e);
    });

  // ── Atomic discard of original (idempotency guard) ──
  const { data: discarded, error: discardErr } = await admin
    .from("generations")
    .update({ status: "discarded" })
    .eq("id", id)
    .eq("brand_id", brand.id)
    .eq("status", "ready_for_brand_review")
    .select("id")
    .maybeSingle();

  if (discardErr || !discarded) {
    // Roll back the credit deduction
    await admin
      .from("brands")
      .update({ credits_remaining: credits })
      .eq("id", brand.id);
    return NextResponse.json(
      {
        error:
          "Could not discard original — concurrent action may be in flight",
      },
      { status: 409 },
    );
  }

  // ── Create the retry row ──
  // Brief carries:
  //   - all original brief fields (so we still have product_image_url, aspect_ratio, etc.)
  //   - iteration_notes — the brand's textarea content
  //   - previous_image_url — the discarded gen's image_url (R2)
  const originalBrief = (original.structured_brief ?? {}) as Record<string, unknown>;
  const newBrief: Record<string, unknown> = {
    ...originalBrief,
    iteration_notes: iterationNotes,
    previous_image_url: original.image_url,
    parent_generation_id: original.id,
  };

  const { data: newGen, error: insertErr } = await admin
    .from("generations")
    .insert({
      collab_session_id: original.collab_session_id,
      brand_id: original.brand_id,
      creator_id: original.creator_id,
      structured_brief: newBrief as Json,
      status: "draft",
      cost_paise: 0,
      retry_count: oldRetryCount + 1,
      is_free_retry: false,
      pipeline_version: "v3",
    })
    .select("id")
    .single();

  if (insertErr || !newGen) {
    // Rollback discard + credit deduction
    await admin
      .from("generations")
      .update({ status: "ready_for_brand_review" })
      .eq("id", id);
    await admin
      .from("brands")
      .update({ credits_remaining: credits })
      .eq("id", brand.id);
    Sentry.captureException(insertErr ?? new Error("retry insert failed"), {
      tags: { route: "generations/retry", phase: "insert" },
      extra: { original_id: id, retry_count: oldRetryCount + 1 },
    });
    return NextResponse.json(
      { error: "Failed to create retry generation" },
      { status: 500 },
    );
  }

  const newId = newGen.id as string;

  // ── Dispatch iteration pipeline in background ──
  after(async () => {
    try {
      await runIteration(newId);
    } catch (err) {
      console.error("[retry] background dispatch failed", err);
      Sentry.captureException(err, {
        tags: { route: "generations/retry", phase: "background" },
        extra: { new_generation_id: newId },
      });
    }
  });

  return NextResponse.json({
    ok: true,
    new_generation_id: newId,
    credits_charged: 1,
    credits_remaining: credits - 1,
    retry_count: oldRetryCount + 1,
  });
}
