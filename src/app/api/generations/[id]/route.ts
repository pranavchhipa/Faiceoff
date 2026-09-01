import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Brand has 24h to preview / retry / discard before we auto-send to creator.
const BRAND_REVIEW_TIMEOUT_MS = 24 * 60 * 60 * 1000;
const APPROVAL_EXPIRY_MS = 48 * 60 * 60 * 1000;

const GEN_COLUMNS = `id, collab_session_id, creator_id, brand_id, status, assembled_prompt,
       structured_brief, image_url, cost_paise, created_at, updated_at,
       upscaled_url, quality_scores, generation_attempts,
       provider_prediction_id, pipeline_version, retry_count, is_free_retry`;

/**
 * GET /api/generations/[id]
 *
 * HOT PATH: the studio polls this every 4s while a generation is running.
 * All independent lookups are batched with Promise.all — the old version
 * ran ~8 sequential round trips per poll (including a duplicated creators
 * query); this runs 2 batches.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // --- Auth ---
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

  // --- Batch 1: generation + caller identity (all independent) ---
  // Note: upscaled_url, quality_scores, generation_attempts,
  // provider_prediction_id, retry_count, is_free_retry, and pipeline_version
  // are from migrations 00016 / 00028. src/types/supabase.ts is stale until
  // we regenerate, so we cast the row shape at the boundary.
  // (base_image_url dropped in 00054 — was never populated.)
  const [genRes, userRes, brandRes, creatorRes] = await Promise.all([
    admin.from("generations").select(GEN_COLUMNS).eq("id", id).single(),
    admin.from("users").select("role").eq("id", user.id).single(),
    admin.from("brands").select("id").eq("user_id", user.id).maybeSingle(),
    admin.from("creators").select("id").eq("user_id", user.id).maybeSingle(),
  ]);

  const gen = genRes.data as unknown as
    | {
        id: string;
        collab_session_id: string | null;
        creator_id: string;
        brand_id: string;
        status: string;
        assembled_prompt: string | null;
        structured_brief: Record<string, unknown> | null;
        image_url: string | null;
        cost_paise: number | null;
        created_at: string;
        updated_at: string;
        upscaled_url: string | null;
        quality_scores: Record<string, unknown> | null;
        generation_attempts: number | null;
        provider_prediction_id: string | null;
        pipeline_version: string | null;
        retry_count: number | null;
        is_free_retry: boolean | null;
      }
    | null;

  if (genRes.error || !gen) {
    return NextResponse.json(
      { error: "Generation not found" },
      { status: 404 },
    );
  }

  // --- Verify access: user must be the brand, creator, or admin ---
  const isAdmin = userRes.data?.role === "admin";
  const isBrandOwner = brandRes.data && gen.brand_id === brandRes.data.id;
  const isCreator = Boolean(creatorRes.data && gen.creator_id === creatorRes.data.id);

  if (!isAdmin && !isBrandOwner && !isCreator) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  // --- Self-healing: a generation stuck mid-pipeline for >30 min is dead
  //     (the Gemini path completes in 1-2 min). Flip to failed + refund the
  //     credit inline so the polling UI resolves immediately instead of
  //     waiting for the daily cron sweep. Guarded update → race-safe. ---
  let effectiveGen = gen;
  const STUCK_STATUSES = ["generating", "compliance_check", "output_check"];
  if (STUCK_STATUSES.includes(gen.status)) {
    const stuckAgeMs = Date.now() - new Date(gen.updated_at).getTime();
    if (stuckAgeMs > 30 * 60 * 1000) {
      const { data: flipped } = await admin
        .from("generations")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", id)
        .in("status", STUCK_STATUSES)
        .select(GEN_COLUMNS)
        .maybeSingle();
      if (flipped) {
        effectiveGen = { ...(flipped as typeof gen) };
        const { error: rbErr } = await admin.rpc("rollback_credit_for_generation", {
          p_brand_id: gen.brand_id,
          p_generation_id: id,
        });
        if (rbErr) {
          console.error(
            `[generations/${id}] stuck-gen refund failed: ${rbErr.message}`,
          );
        }
      }
    }
  }

  // --- Auto-send timeout (Q3=A): if generation has been sitting in
  //     ready_for_brand_review for >24h, auto-promote to ready_for_approval
  //     so the pipeline keeps moving without forever-hanging gens. ---
  if (gen.status === "ready_for_brand_review") {
    const ageMs = Date.now() - new Date(gen.updated_at).getTime();
    if (ageMs > BRAND_REVIEW_TIMEOUT_MS) {
      const { data: claimed } = await admin
        .from("generations")
        .update({ status: "ready_for_approval" })
        .eq("id", id)
        .eq("status", "ready_for_brand_review")
        .select(GEN_COLUMNS)
        .maybeSingle();
      if (claimed) {
        const expiresAt = new Date(
          Date.now() + APPROVAL_EXPIRY_MS,
        ).toISOString();
        await admin.from("approvals").insert({
          generation_id: id,
          creator_id: gen.creator_id,
          brand_id: gen.brand_id,
          status: "pending",
          expires_at: expiresAt,
        });
        effectiveGen = claimed as typeof gen;
      }
    }
  }

  // --- Batch 2: session name + latest approval (independent) ---
  const [campRes, approvalRes] = await Promise.all([
    gen.collab_session_id
      ? admin
          .from("collab_sessions")
          .select("id, name")
          .eq("id", gen.collab_session_id)
          .single()
      : Promise.resolve({ data: null }),
    admin
      .from("approvals")
      .select("id, status, feedback, decided_at, expires_at, created_at")
      .eq("generation_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const campaign: { id: string; name: string } | null = campRes.data ?? null;

  return NextResponse.json({
    generation: { ...effectiveGen, campaign },
    approval: approvalRes.data ?? null,
    is_creator: isCreator,
  });
}
