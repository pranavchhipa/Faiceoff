import JSZip from "jszip";
import { replicate } from "./replicate-client";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * LoRA training helpers for Faiceoff creators.
 *
 * Pipeline: reference photos (Supabase Storage)
 *        → zip (in memory)
 *        → Supabase Storage (public signed URL, short TTL)
 *        → Replicate ostris/flux-dev-lora-trainer
 *        → new model version at {owner}/faiceoff-creator-{id}
 *
 * The trained model is then callable via replicate.run() in the
 * generation pipeline, producing images with the creator's face.
 */

// The LoRA trainer we use (published, stable)
export const TRAINER_OWNER = "ostris";
export const TRAINER_NAME = "flux-dev-lora-trainer";

// Storage bucket for training zips (short-lived — zips are deleted after training)
export const TRAINING_BUCKET = "lora-training";

let cachedUsername: string | null = null;

/**
 * Get the authenticated Replicate account's username.
 * Cached in memory for the lifetime of the serverless function instance.
 */
export async function getReplicateUsername(): Promise<string> {
  if (cachedUsername) return cachedUsername;
  // The Replicate JS SDK exposes accounts.current() which returns { username, ... }
  const account = (await replicate.accounts.current()) as { username: string };
  if (!account?.username) {
    throw new Error("Could not determine Replicate account username");
  }
  cachedUsername = account.username;
  return cachedUsername;
}

/**
 * Download all reference photos for a creator from Supabase Storage
 * and return them as an array of { name, bytes } tuples ready for zipping.
 */
export async function fetchCreatorPhotos(
  creatorId: string
): Promise<{ name: string; bytes: ArrayBuffer }[]> {
  const admin = createAdminClient();

  const { data: photos, error } = await admin
    .from("creator_reference_photos")
    .select("id, storage_path")
    .eq("creator_id", creatorId)
    .order("uploaded_at", { ascending: true });

  if (error) throw new Error(`Failed to list photos: ${error.message}`);
  if (!photos || photos.length === 0) {
    throw new Error("No reference photos uploaded");
  }

  if (photos.length < 4) {
    throw new Error(
      `Need at least 4 photos for LoRA training, have ${photos.length}`
    );
  }

  // Cap at 20 photos — more doesn't improve LoRA quality and blows up the zip
  const capped = photos.slice(0, 20);

  const results: { name: string; bytes: ArrayBuffer }[] = [];
  for (const photo of capped) {
    const { data, error: dlError } = await admin.storage
      .from("reference-photos")
      .download(photo.storage_path);

    if (dlError || !data) {
      throw new Error(
        `Failed to download ${photo.storage_path}: ${dlError?.message ?? "unknown"}`
      );
    }

    const bytes = await data.arrayBuffer();
    const ext = photo.storage_path.split(".").pop() || "jpg";
    results.push({ name: `${photo.id}.${ext}`, bytes });
  }

  return results;
}

/**
 * Build an in-memory zip of the provided photos.
 */
export async function buildTrainingZip(
  photos: { name: string; bytes: ArrayBuffer }[]
): Promise<Buffer> {
  const zip = new JSZip();
  for (const photo of photos) {
    zip.file(photo.name, photo.bytes);
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

/**
 * Upload the zip to Supabase Storage and return a short-lived signed URL
 * that Replicate can download from.
 */
export async function uploadTrainingZip(
  creatorId: string,
  zipBytes: Buffer
): Promise<string> {
  const admin = createAdminClient();

  // Ensure the bucket exists. The bucket is declared in migration 00014
  // (declarative, preferred). If it's missing, fall back to creating it
  // at runtime — but actually check the error instead of eating it.
  const { data: buckets, error: listErr } = await admin.storage.listBuckets();
  if (listErr) {
    throw new Error(`Could not list buckets: ${listErr.message}`);
  }

  const bucketExists = buckets?.some((b) => b.name === TRAINING_BUCKET);
  if (!bucketExists) {
    const { error: createErr } = await admin.storage.createBucket(
      TRAINING_BUCKET,
      {
        public: false,
        fileSizeLimit: 500 * 1024 * 1024, // 500 MB
      }
    );
    if (createErr) {
      throw new Error(
        `Bucket "${TRAINING_BUCKET}" does not exist and could not be created: ${createErr.message}. ` +
          `Run migration 00014_create_lora_training_bucket.sql in Supabase, or create the bucket manually in the Storage dashboard.`
      );
    }
  }

  const path = `${creatorId}/${Date.now()}-training.zip`;
  const { error: uploadErr } = await admin.storage
    .from(TRAINING_BUCKET)
    .upload(path, zipBytes, {
      contentType: "application/zip",
      upsert: true,
    });

  if (uploadErr) {
    throw new Error(`Zip upload failed: ${uploadErr.message}`);
  }

  // 1 hour signed URL — Replicate pulls the zip immediately when training starts,
  // so this window is plenty.
  const { data: signed, error: signErr } = await admin.storage
    .from(TRAINING_BUCKET)
    .createSignedUrl(path, 60 * 60);

  if (signErr || !signed?.signedUrl) {
    throw new Error(`Signed URL failed: ${signErr?.message ?? "unknown"}`);
  }

  return signed.signedUrl;
}

/**
 * Ensure a destination model exists on Replicate for this creator.
 * Idempotent — safe to call multiple times.
 *
 * IMPORTANT: For LoRA training destinations, the `hardware` field is set
 * to `cpu` because the model is just a registry/container for trained
 * versions. Actual inference hardware is chosen at prediction time.
 *
 * Surfaces the real Replicate error (status + body) on failure so we can
 * debug 4xx/5xx responses (the default SDK error message is terse).
 */
export async function ensureDestinationModel(
  owner: string,
  name: string
): Promise<void> {
  // Step 1: Check if it already exists
  try {
    await replicate.models.get(owner, name);
    return; // exists — nothing to do
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Replicate SDK throws on 404. If it's NOT a 404, something else is
    // wrong (auth, network, etc.) — don't try to create.
    if (!/404|not.?found/i.test(message)) {
      throw new Error(
        `Failed to check destination model ${owner}/${name}: ${message}`
      );
    }
    // Otherwise fall through to create
  }

  // Step 2: Create it.
  //
  // IMPORTANT choices based on debugging 500 errors from Replicate:
  //  - visibility: "public"  → private models may require billing on free tier.
  //                             Public is safe: this only contains the creator's
  //                             face LoRA weights (not personal data, and the
  //                             trigger word is a nonsense token).
  //  - hardware: "cpu"        → container-only; real hardware picked per run.
  //  - description omitted    → some unicode chars (em-dash) break their parser.
  try {
    await replicate.models.create(owner, name, {
      visibility: "public",
      hardware: "cpu",
    });
  } catch (err) {
    // Replicate returns HTML on some 5xx responses — try to extract a
    // useful snippet.
    const raw = err instanceof Error ? err.message : String(err);
    const firstLine = raw.split("\n").find((l) => l.trim().length > 0) ?? raw;

    // Give the user a manual-fallback path that always works.
    const manualUrl = `https://replicate.com/create`;
    throw new Error(
      `Could not auto-create destination model "${owner}/${name}" on Replicate. ` +
        `MANUAL FIX: go to ${manualUrl} → create a new model with name ` +
        `"${name}" (public, any hardware, blank description) and retry. ` +
        `Underlying error: ${firstLine.slice(0, 150)}`
    );
  }
}

/**
 * Get the latest version hash for the LoRA trainer model.
 */
export async function getTrainerVersion(): Promise<string> {
  const model = (await replicate.models.get(TRAINER_OWNER, TRAINER_NAME)) as {
    latest_version?: { id: string };
  };
  if (!model.latest_version?.id) {
    throw new Error("Could not fetch latest trainer version");
  }
  return model.latest_version.id;
}

/**
 * Build a stable destination model slug for a creator.
 */
export function creatorModelName(creatorId: string): string {
  // Use first 12 chars of the UUID (no hyphens) for a URL-safe slug
  const short = creatorId.replace(/-/g, "").slice(0, 12);
  return `faiceoff-creator-${short}`;
}
