// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/stuck-gens/[id]/retry
//
// Re-submits a stuck generation to Replicate using its stored assembled_prompt.
// Creates a new Replicate prediction and updates replicate_prediction_id.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient() as any;
  const { data } = await admin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (data?.role !== "admin") return null;
  return user;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id: generationId } = await params;
  const admin = createAdminClient() as any;

  // Fetch the stuck generation
  const { data: gen, error: genErr } = await admin
    .from("generations")
    .select("id, status, assembled_prompt, lora_model_id, structured_brief")
    .eq("id", generationId)
    .maybeSingle();

  if (genErr) {
    console.error("[admin/stuck-gens/retry] gen fetch error:", genErr);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  if (!gen) {
    return NextResponse.json({ error: "generation_not_found" }, { status: 404 });
  }

  if (gen.status !== "processing") {
    return NextResponse.json(
      { error: "generation_not_processing", current_status: gen.status },
      { status: 409 },
    );
  }

  if (!gen.assembled_prompt) {
    return NextResponse.json(
      { error: "no_assembled_prompt — cannot retry without prompt" },
      { status: 422 },
    );
  }

  // Submit new Replicate prediction
  const replicateToken = process.env.REPLICATE_API_TOKEN;
  if (!replicateToken) {
    return NextResponse.json({ error: "REPLICATE_API_TOKEN not set" }, { status: 500 });
  }

  // Resolve LoRA model version from lora_models table
  let loraModelId: string | null = null;
  if (gen.lora_model_id) {
    const { data: loraRow } = await admin
      .from("lora_models")
      .select("replicate_model_id")
      .eq("id", gen.lora_model_id)
      .maybeSingle();
    loraModelId = loraRow?.replicate_model_id ?? null;
  }

  // Submit to Replicate
  let replicatePredictionId: string;
  try {
    const model = loraModelId ?? "black-forest-labs/flux-dev";
    const res = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${replicateToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: {
          prompt: gen.assembled_prompt,
          num_outputs: 1,
        },
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Replicate ${res.status}: ${errBody}`);
    }

    const prediction = await res.json() as { id: string };
    replicatePredictionId = prediction.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[admin/stuck-gens/retry] Replicate submission failed:", message);
    return NextResponse.json({ error: `replicate_error: ${message}` }, { status: 502 });
  }

  // Update generation with new prediction ID (keep status=processing)
  const { error: updateErr } = await admin
    .from("generations")
    .update({
      replicate_prediction_id: replicatePredictionId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", generationId);

  if (updateErr) {
    console.error("[admin/stuck-gens/retry] update error:", updateErr);
    // Still return success — Replicate job is running
    console.warn("[admin/stuck-gens/retry] Could not persist new prediction ID");
  }

  // Audit log
  await admin.from("audit_log").insert({
    actor_type: "admin",
    actor_id: user.id,
    action: "admin_stuck_gen_retry",
    resource_type: "generation",
    resource_id: generationId,
    meta: { replicate_prediction_id: replicatePredictionId },
  });

  return NextResponse.json({ replicate_prediction_id: replicatePredictionId });
}
