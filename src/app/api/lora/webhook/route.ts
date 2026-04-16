import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getReplicateUsername,
  creatorModelName,
} from "@/lib/ai/lora-training";

/**
 * POST /api/lora/webhook
 *
 * Called by Replicate when a training job completes.
 * Payload shape: https://replicate.com/docs/reference/http#predictions.get
 *
 * We match on `id` (Replicate training id) against
 * creator_lora_models.replicate_training_id and update status accordingly.
 */
export async function POST(request: Request) {
  let payload: {
    id?: string;
    status?: "succeeded" | "failed" | "canceled" | "processing" | "starting";
    output?: { version?: string } | null;
    error?: string | null;
  };

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const trainingId = payload.id;
  if (!trainingId) {
    return NextResponse.json({ error: "Missing training id" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Find the LoRA row by training id
  const { data: lora } = await admin
    .from("creator_lora_models")
    .select("id, creator_id")
    .eq("replicate_training_id", trainingId)
    .maybeSingle();

  if (!lora) {
    console.warn(
      `[lora/webhook] No LoRA row found for training id ${trainingId}`
    );
    // Still return 200 so Replicate doesn't retry forever
    return NextResponse.json({ ok: true, matched: false });
  }

  if (payload.status === "succeeded") {
    try {
      const owner = await getReplicateUsername();
      const modelName = creatorModelName(lora.creator_id);
      const versionHash =
        typeof payload.output === "object" && payload.output
          ? payload.output.version
          : undefined;

      const modelId = versionHash
        ? `${owner}/${modelName}:${versionHash}`
        : `${owner}/${modelName}`;

      await admin
        .from("creator_lora_models")
        .update({
          training_status: "completed",
          replicate_model_id: modelId,
          training_completed_at: new Date().toISOString(),
        })
        .eq("id", lora.id);

      console.log(
        `[lora/webhook] Training ${trainingId} succeeded → model ${modelId}`
      );
      return NextResponse.json({ ok: true, status: "completed" });
    } catch (err) {
      console.error("[lora/webhook] Failed to resolve model id:", err);
      return NextResponse.json(
        { ok: false, error: err instanceof Error ? err.message : String(err) },
        { status: 500 }
      );
    }
  }

  if (payload.status === "failed" || payload.status === "canceled") {
    await admin
      .from("creator_lora_models")
      .update({
        training_status: "failed",
        training_error: payload.error ?? payload.status,
        training_completed_at: new Date().toISOString(),
      })
      .eq("id", lora.id);

    console.log(
      `[lora/webhook] Training ${trainingId} ${payload.status}: ${payload.error ?? ""}`
    );
    return NextResponse.json({ ok: true, status: "failed" });
  }

  // In-progress events — just acknowledge
  return NextResponse.json({ ok: true, status: payload.status });
}
