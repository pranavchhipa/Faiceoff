import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { replicate } from "@/lib/ai/replicate-client";
import {
  fetchCreatorPhotos,
  buildTrainingZip,
  uploadTrainingZip,
  getReplicateUsername,
  ensureDestinationModel,
  getTrainerVersion,
  TRAINER_OWNER,
  TRAINER_NAME,
  creatorModelName,
} from "@/lib/ai/lora-training";

/**
 * POST /api/lora/train
 *
 * Kicks off LoRA training for the authenticated creator using their
 * uploaded reference photos. Returns immediately with a training_id;
 * the actual job runs on Replicate for ~25 minutes.
 *
 * Completion is handled either by:
 *   - /api/lora/webhook (Replicate callback)  [production]
 *   - /api/lora/status  (polled from UI)       [fallback / dev]
 */
export async function POST() {
  // --- Auth ---
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // --- Find creator ---
  const { data: creator, error: creatorErr } = await admin
    .from("creators")
    .select("id, display_name:user_id")
    .eq("user_id", user.id)
    .single();

  if (creatorErr || !creator) {
    return NextResponse.json(
      { error: "Creator profile not found" },
      { status: 404 }
    );
  }

  // --- Guard: if a training is already in progress for this creator, return it ---
  const { data: existing } = await admin
    .from("creator_lora_models")
    .select(
      "id, training_status, replicate_training_id, replicate_model_id, trigger_word"
    )
    .eq("creator_id", creator.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.training_status === "training") {
    return NextResponse.json(
      {
        success: true,
        already_training: true,
        lora_id: existing.id,
        training_id: existing.replicate_training_id,
        training_status: existing.training_status,
      },
      { status: 200 }
    );
  }

  try {
    // --- Step 1: Pull photos ---
    const photos = await fetchCreatorPhotos(creator.id);
    console.log(
      `[lora/train] Fetched ${photos.length} photos for creator ${creator.id}`
    );

    // --- Step 2: Zip them ---
    const zipBytes = await buildTrainingZip(photos);
    console.log(
      `[lora/train] Built zip: ${(zipBytes.length / 1024 / 1024).toFixed(1)} MB`
    );

    // --- Step 3: Upload zip → signed URL ---
    const zipUrl = await uploadTrainingZip(creator.id, zipBytes);
    console.log(`[lora/train] Zip uploaded, signed URL acquired`);

    // --- Step 4: Ensure destination model exists on Replicate ---
    const owner = await getReplicateUsername();
    const modelName = creatorModelName(creator.id);
    await ensureDestinationModel(owner, modelName);
    console.log(`[lora/train] Destination model ready: ${owner}/${modelName}`);

    // --- Step 5: Get latest trainer version ---
    const trainerVersion = await getTrainerVersion();

    // --- Step 6: Submit training ---
    const triggerWord = "TOK"; // standard FLUX LoRA trigger
    // Replicate requires HTTPS webhooks — only send in production.
    // In development (http://localhost:*) we rely on the 20s polling
    // from the UI via /api/lora/status instead.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const webhookUrl = appUrl.startsWith("https://")
      ? `${appUrl}/api/lora/webhook`
      : undefined;

    const training = (await replicate.trainings.create(
      TRAINER_OWNER,
      TRAINER_NAME,
      trainerVersion,
      {
        destination: `${owner}/${modelName}` as `${string}/${string}`,
        input: {
          input_images: zipUrl,
          trigger_word: triggerWord,
          steps: 1000,
          lora_rank: 16,
          learning_rate: 0.0004,
          batch_size: 1,
          resolution: "512,768,1024",
          autocaption: true,
        },
        ...(webhookUrl
          ? { webhook: webhookUrl, webhook_events_filter: ["completed"] }
          : {}),
      }
    )) as { id: string; status: string };

    console.log(
      `[lora/train] Replicate training submitted: ${training.id} (status: ${training.status})`
    );

    // --- Step 7: Upsert creator_lora_models row ---
    if (existing) {
      // Re-training: bump version, update status
      await admin
        .from("creator_lora_models")
        .update({
          training_status: "training",
          replicate_training_id: training.id,
          training_started_at: new Date().toISOString(),
          training_zip_url: zipUrl,
          trigger_word: triggerWord,
          training_error: null,
        })
        .eq("id", existing.id);

      return NextResponse.json(
        {
          success: true,
          lora_id: existing.id,
          training_id: training.id,
          training_status: "training",
        },
        { status: 200 }
      );
    } else {
      // First training
      const { data: lora, error: insertErr } = await admin
        .from("creator_lora_models")
        .insert({
          creator_id: creator.id,
          training_status: "training",
          replicate_training_id: training.id,
          training_started_at: new Date().toISOString(),
          training_zip_url: zipUrl,
          trigger_word: triggerWord,
          version: 1,
        })
        .select("id")
        .single();

      if (insertErr) {
        return NextResponse.json(
          { error: insertErr.message },
          { status: 500 }
        );
      }

      return NextResponse.json(
        {
          success: true,
          lora_id: lora.id,
          training_id: training.id,
          training_status: "training",
        },
        { status: 200 }
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[lora/train] Failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
