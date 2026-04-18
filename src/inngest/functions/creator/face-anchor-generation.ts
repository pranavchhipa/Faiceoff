import { inngest } from "@/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateAndCacheFaceAnchorPack } from "@/lib/ai/face-anchor";

/**
 * Fires when a creator's LoRA training completes. Generates and caches the
 * Stage 0 face anchor pack so subsequent generations don't run the LoRA
 * each time.
 *
 * Event: creator/lora-training-completed (emitted from
 *   src/app/api/lora/webhook/route.ts and src/app/api/lora/status/route.ts
 *   right after the training_status="completed" DB update)
 */
export const faceAnchorGeneration = inngest.createFunction(
  {
    id: "creator/face-anchor-generation",
    triggers: [{ event: "creator/lora-training-completed" }],
    retries: 3,
  },
  async ({ event, step }) => {
    const { creator_id } = event.data as { creator_id: string };
    const admin = createAdminClient();

    // Verify the creator has a completed LoRA before we try to use it.
    await step.run("verify-lora-ready", async () => {
      const { data: lora } = await admin
        .from("creator_lora_models")
        .select("replicate_model_id, trigger_word, training_status")
        .eq("creator_id", creator_id)
        .eq("training_status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!lora?.replicate_model_id) {
        throw new Error(
          `No completed LoRA model found for creator ${creator_id}`
        );
      }
    });

    const result = await step.run("generate-anchor-pack", async () => {
      const { data: lora, error } = await admin
        .from("creator_lora_models")
        .select("replicate_model_id, trigger_word")
        .eq("creator_id", creator_id)
        .eq("training_status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error || !lora?.replicate_model_id) {
        throw new Error(
          `LoRA lookup failed for creator ${creator_id}: ${error?.message ?? "no row"}`
        );
      }

      return generateAndCacheFaceAnchorPack({
        creatorId: creator_id,
        loraModelId: lora.replicate_model_id,
        triggerWord: lora.trigger_word ?? "TOK",
      });
    });

    return { creator_id, anchorPaths: result.anchorPaths };
  }
);
