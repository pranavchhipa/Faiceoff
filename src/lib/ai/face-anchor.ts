import { replicate } from "./replicate-client";
import { createAdminClient } from "@/lib/supabase/admin";
import { R2_FACE_ANCHORS_PREFIX } from "./pipeline-config";

/**
 * Stage 0: Generate a PACK of 4 canonical headshots of the creator using
 * their trained Flux LoRA. Runs once per LoRA training completion, result
 * cached on creators.face_anchor_pack for use as multi-reference input to
 * Nano Banana Pro on every subsequent generation.
 *
 * Why a pack instead of a single anchor:
 *   Nano Banana Pro is not LoRA-native. It relies on the multi-image
 *   reference pack to lock identity. A single neutral portrait isn't enough
 *   to keep identity stable across varied scenes. Empirically, 4 angles
 *   (neutral / smile / three-quarter / soft side) match LoRA-only
 *   consistency at approximately ₹10-15 one-time cost.
 *
 * Storage convention:
 *   Files live in the existing private "reference-photos" Supabase Storage
 *   bucket at path `face-anchors/{creator_id}/{runId}-{slot}.png`. We store
 *   the storage PATHS (not URLs) in creators.face_anchor_pack, then sign
 *   them to 1-hour URLs on demand via resolveFaceAnchorUrls(). This matches
 *   the private-bucket pattern already used for creator_reference_photos.
 */

const BUCKET = "reference-photos";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

/** Prompts producing varied angles / expressions for stable multi-ref identity lock */
const ANCHOR_PROMPTS: Array<{ slot: string; prompt: string }> = [
  {
    slot: "neutral",
    prompt:
      "studio portrait, neutral expression, direct camera gaze, soft natural light, plain light gray background, 85mm lens, shoulders up, photorealistic, candid natural skin texture, unretouched",
  },
  {
    slot: "smile",
    prompt:
      "studio portrait, warm natural smile, relaxed, soft window light, plain off-white background, 85mm lens, shoulders up, photorealistic, candid natural skin texture, unretouched",
  },
  {
    slot: "three-quarter",
    prompt:
      "three-quarter view portrait, head turned 30 degrees, looking towards camera, soft natural light from front-left, plain background, 85mm lens, photorealistic, visible skin pores, unretouched",
  },
  {
    slot: "soft-side",
    prompt:
      "soft side profile portrait, head turned 60 degrees, gentle natural light, plain background, 85mm lens, shoulders visible, photorealistic, candid skin texture, unretouched",
  },
];

const ANCHOR_NEGATIVE =
  "plastic, waxy, cgi, 3d render, airbrushed, smooth skin, uncanny, distorted, extra fingers, low quality, glasses unless part of identity";

export interface GenerateFaceAnchorPackInput {
  creatorId: string;
  /** Replicate model slug for this creator's trained LoRA */
  loraModelId: string;
  /** LoRA trigger word (e.g., "TOK") */
  triggerWord: string;
}

export interface GenerateFaceAnchorPackResult {
  /** Storage paths persisted on creators.face_anchor_pack (not URLs) */
  anchorPaths: string[];
}

async function runOneAnchor(args: {
  loraModelId: string;
  triggerWord: string;
  prompt: string;
}): Promise<string> {
  const promptWithTrigger = `a photo of ${args.triggerWord} person, ${args.prompt}`;

  const output = await replicate.run(
    args.loraModelId as `${string}/${string}`,
    {
      input: {
        prompt: promptWithTrigger,
        negative_prompt: ANCHOR_NEGATIVE,
        num_outputs: 1,
        guidance_scale: 5.5,
        num_inference_steps: 50,
        output_format: "png",
        aspect_ratio: "1:1",
      },
    }
  );

  const outputs = Array.isArray(output) ? output : [output];
  const first = outputs[0] as unknown;
  if (typeof first === "string") return first;
  if (
    first &&
    typeof first === "object" &&
    "url" in first &&
    typeof (first as { url: unknown }).url === "function"
  ) {
    const u = (first as { url: () => URL | string }).url();
    return u instanceof URL ? u.toString() : u;
  }
  throw new Error("Anchor generation returned unexpected shape");
}

async function fetchAndUpload(args: {
  admin: ReturnType<typeof createAdminClient>;
  sourceUrl: string;
  storagePath: string;
}): Promise<string> {
  const res = await fetch(args.sourceUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch anchor from Replicate: ${res.status}`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const { error: uploadErr } = await args.admin.storage
    .from(BUCKET)
    .upload(args.storagePath, bytes, {
      contentType: "image/png",
      upsert: true,
    });
  if (uploadErr) {
    throw new Error(`Anchor upload failed: ${uploadErr.message}`);
  }
  return args.storagePath;
}

/**
 * Run the creator's LoRA across ANCHOR_PROMPTS in parallel, upload results to
 * Supabase Storage, persist the path array on creators.face_anchor_pack.
 * Idempotent: safe to retry (storage path includes a timestamp-based runId per run).
 */
export async function generateAndCacheFaceAnchorPack(
  input: GenerateFaceAnchorPackInput
): Promise<GenerateFaceAnchorPackResult> {
  const admin = createAdminClient();
  const runId = Date.now().toString(36);

  // Sequential instead of Promise.all: Replicate throttles free-tier / low-
  // credit accounts to "burst of 1" concurrent prediction, so firing 4 LoRA
  // calls in parallel produces 3 immediate 429s. Sequential adds ~45s to a
  // once-per-creator operation — acceptable tradeoff for reliability.
  const raw: string[] = [];
  for (const p of ANCHOR_PROMPTS) {
    const url = await runOneAnchor({
      loraModelId: input.loraModelId,
      triggerWord: input.triggerWord,
      prompt: p.prompt,
    });
    raw.push(url);
  }

  const uploadedPaths: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const path = await fetchAndUpload({
      admin,
      sourceUrl: raw[i],
      storagePath: `${R2_FACE_ANCHORS_PREFIX}${input.creatorId}/${runId}-${ANCHOR_PROMPTS[i].slot}.png`,
    });
    uploadedPaths.push(path);
  }

  // Cast needed: migration 00016 added face_anchor_pack/face_anchor_generated_at;
  // src/types/supabase.ts hasn't been regenerated yet.
  const { error: updateErr } = await admin
    .from("creators")
    .update({
      face_anchor_pack: uploadedPaths,
      face_anchor_generated_at: new Date().toISOString(),
    } as never)
    .eq("id", input.creatorId);

  if (updateErr) {
    throw new Error(`Persisting face_anchor_pack failed: ${updateErr.message}`);
  }

  return { anchorPaths: uploadedPaths };
}

/**
 * Check if creator has a valid face anchor pack cached. Returns the PATHS if
 * fresh (generated after latest LoRA training), [] if stale or missing.
 * Consumers should call resolveFaceAnchorUrls() on the result before using.
 */
export async function getValidFaceAnchorPack(
  creatorId: string
): Promise<string[]> {
  const admin = createAdminClient();
  // Cast needed: migration 00016 added face_anchor_pack/face_anchor_generated_at;
  // src/types/supabase.ts hasn't been regenerated yet.
  const { data: creatorRaw } = await admin
    .from("creators")
    .select("face_anchor_pack, face_anchor_generated_at")
    .eq("id", creatorId)
    .maybeSingle();
  const creator = creatorRaw as unknown as
    | { face_anchor_pack: string[] | null; face_anchor_generated_at: string | null }
    | null;

  const pack = creator?.face_anchor_pack ?? null;
  if (!pack || pack.length === 0 || !creator?.face_anchor_generated_at) {
    return [];
  }

  // Check if LoRA was retrained after pack was generated
  const { data: lora } = await admin
    .from("creator_lora_models")
    .select("created_at, training_status")
    .eq("creator_id", creatorId)
    .eq("training_status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lora) return [];

  const anchorTime = new Date(creator.face_anchor_generated_at).getTime();
  const loraTime = new Date(lora.created_at).getTime();
  if (loraTime > anchorTime) return [];

  return pack;
}

/**
 * Resolve an array of storage paths to fresh 1-hour signed URLs.
 * Used right before passing anchors to Nano Banana Pro / Kontext Max.
 */
export async function resolveFaceAnchorUrls(
  paths: string[]
): Promise<string[]> {
  if (paths.length === 0) return [];
  const admin = createAdminClient();
  const signed = await Promise.all(
    paths.map(async (path) => {
      const { data, error } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      if (error || !data?.signedUrl) {
        throw new Error(
          `Cannot sign face anchor path ${path}: ${error?.message ?? "no URL"}`
        );
      }
      return data.signedUrl;
    })
  );
  return signed;
}
