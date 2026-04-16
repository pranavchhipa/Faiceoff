import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { replicate } from "@/lib/ai/replicate-client";
import {
  getReplicateUsername,
  creatorModelName,
} from "@/lib/ai/lora-training";

/**
 * GET /api/lora/status
 *
 * Returns the current LoRA training state for the authenticated creator.
 * If the training is still in-progress, polls Replicate for an update
 * and syncs the result back to the database.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // --- Find creator + latest LoRA row ---
  const { data: creator } = await admin
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!creator) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  const { data: lora } = await admin
    .from("creator_lora_models")
    .select(
      "id, training_status, replicate_training_id, replicate_model_id, trigger_word, training_error, training_started_at, training_completed_at"
    )
    .eq("creator_id", creator.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lora) {
    return NextResponse.json({ status: "none" }, { status: 200 });
  }

  // If not training, return current state as-is
  if (lora.training_status !== "training" || !lora.replicate_training_id) {
    return NextResponse.json({
      status: lora.training_status,
      lora_id: lora.id,
      model_id: lora.replicate_model_id,
      trigger_word: lora.trigger_word,
      error: lora.training_error,
      started_at: lora.training_started_at,
      completed_at: lora.training_completed_at,
    });
  }

  // Still training — poll Replicate for status
  try {
    const training = (await replicate.trainings.get(
      lora.replicate_training_id
    )) as {
      id: string;
      status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
      output?: { version?: string } | null;
      error?: string | null;
    };

    if (training.status === "succeeded") {
      const owner = await getReplicateUsername();
      const modelName = creatorModelName(creator.id);
      // Replicate output gives us the trained version hash
      const versionHash =
        typeof training.output === "object" && training.output
          ? training.output.version
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

      return NextResponse.json({
        status: "completed",
        lora_id: lora.id,
        model_id: modelId,
        trigger_word: lora.trigger_word,
      });
    }

    if (training.status === "failed" || training.status === "canceled") {
      await admin
        .from("creator_lora_models")
        .update({
          training_status: "failed",
          training_error: training.error ?? training.status,
          training_completed_at: new Date().toISOString(),
        })
        .eq("id", lora.id);

      return NextResponse.json({
        status: "failed",
        lora_id: lora.id,
        error: training.error ?? training.status,
      });
    }

    // Still starting / processing
    return NextResponse.json({
      status: "training",
      lora_id: lora.id,
      replicate_status: training.status,
      trigger_word: lora.trigger_word,
      started_at: lora.training_started_at,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[lora/status] Poll failed:", message);
    return NextResponse.json({
      status: "training",
      lora_id: lora.id,
      poll_error: message,
    });
  }
}
