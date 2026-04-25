/**
 * POST /api/generations/[id]/retry
 *
 * Brand action: image not satisfactory, re-roll the AI with the same brief.
 *
 * Pricing (decision log Q1=B):
 *   - retry_count == 0 → 1st retry is FREE (covers genuine AI mistakes)
 *   - retry_count >= 1 → costs 50% of original generation price
 *
 * Effect:
 *   - Old generation: status = 'discarded' (no refund — retry supersedes it)
 *   - New generation: inserted in 'draft', retry_count + 1, is_free_retry flag,
 *     same brief, dispatched via after()
 *   - Returns new generation_id so UI can redirect
 */

import { NextResponse, after } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runGeneration } from "@/lib/ai/run-generation";
import type { Json } from "@/types/supabase";

export async function POST(
  _req: Request,
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // ── Verify brand ownership ──
  const { data: brand } = await admin
    .from("brands")
    .select("id")
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
       cost_paise, retry_count`,
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

  // ── Compute retry cost ──
  const oldRetryCount = (original.retry_count as number) ?? 0;
  const isFreeRetry = oldRetryCount === 0;
  const originalCost = (original.cost_paise as number) ?? 0;
  const retryCost = isFreeRetry ? 0 : Math.round(originalCost * 0.5);

  // ── Pre-flight wallet check (paid retry only) ──
  if (retryCost > 0) {
    const { data: billing } = await admin
      .from("v_brand_billing")
      .select("wallet_available_paise, credits_remaining")
      .eq("brand_id", brand.id)
      .maybeSingle();
    const wallet = (billing?.wallet_available_paise as number) ?? 0;
    const credits = (billing?.credits_remaining as number) ?? 0;
    if (wallet < retryCost) {
      return NextResponse.json(
        {
          error: "Insufficient wallet balance for paid retry",
          required_paise: retryCost,
          available_paise: wallet,
        },
        { status: 402 },
      );
    }
    if (credits < 1) {
      return NextResponse.json(
        { error: "Insufficient credits for retry" },
        { status: 402 },
      );
    }
  }

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
    return NextResponse.json(
      {
        error:
          "Could not discard original — concurrent action may be in flight",
      },
      { status: 409 },
    );
  }

  // ── Create the retry row ──
  const { data: newGen, error: insertErr } = await admin
    .from("generations")
    .insert({
      collab_session_id: original.collab_session_id,
      brand_id: original.brand_id,
      creator_id: original.creator_id,
      structured_brief: original.structured_brief as Json,
      status: "draft",
      cost_paise: retryCost,
      retry_count: oldRetryCount + 1,
      is_free_retry: isFreeRetry,
    })
    .select("id")
    .single();

  if (insertErr || !newGen) {
    // Roll back the discard so the brand can try again.
    await admin
      .from("generations")
      .update({ status: "ready_for_brand_review" })
      .eq("id", id);
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

  // ── Dispatch pipeline in background ──
  after(async () => {
    try {
      await runGeneration(newId);
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
    is_free_retry: isFreeRetry,
    cost_paise: retryCost,
    retry_count: oldRetryCount + 1,
  });
}
