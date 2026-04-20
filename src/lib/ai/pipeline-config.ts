import type { PipelineVersion } from "@/domains/generation/types";

/**
 * Centralized pipeline config — read env vars once and freeze.
 * Env var overrides allow per-generation selection via structured_brief.pipeline_version.
 */

export const DEFAULT_PIPELINE_VERSION: PipelineVersion =
  (process.env.GENERATION_PIPELINE_VERSION as PipelineVersion | undefined) ?? "v2";

export const MAX_RETRIES: number = Number(process.env.GENERATION_MAX_RETRIES ?? 2);

export const MODELS = {
  // v2 primary — Nano Banana Pro.
  //
  // The Google-facing model ID is `gemini-3-pro-image-preview` (verify with
  // `GET https://generativelanguage.googleapis.com/v1beta/models` on your
  // key — Google rotates preview suffixes). An earlier iteration used
  // `gemini-3.0-pro-image` which does NOT exist; every call 404'd and
  // silently fell through to the fallback (see tryModel catch below), so
  // the rate-limit dashboard showed 0 Pro hits and 100% Flash hits. Env
  // var override lets ops swap without a deploy when Google renames.
  nanoBanana: process.env.NANO_BANANA_MODEL ?? "gemini-3-pro-image-preview",
  // Fallback tier — Nano Banana 2 (Gemini 3.1 Flash Image). Higher quota
  // than Pro (100 RPM / 1K RPD vs 20 / 250) and newer than 2.5 Flash, so
  // if Pro is quota-exhausted we degrade gracefully without dropping to
  // the generation-old 2.5 tier.
  nanoBananaFallback:
    process.env.NANO_BANANA_FALLBACK_MODEL ?? "gemini-3.1-flash-image-preview",
  // v3 fallback
  kontext: process.env.REPLICATE_KONTEXT_MODEL ?? "black-forest-labs/flux-kontext-max",
  // Stage 3 + Stage 2 support models (all Replicate)
  upscaler: process.env.REPLICATE_UPSCALER_MODEL ?? "philz1337x/clarity-upscaler",
  clip: process.env.REPLICATE_CLIP_MODEL ?? "andreasjansson/clip-features",
  aesthetic:
    process.env.REPLICATE_AESTHETIC_MODEL ??
    "christophschuhmann/improved-aesthetic-predictor",
} as const;

export const R2_FACE_ANCHORS_PREFIX =
  process.env.R2_FACE_ANCHORS_PREFIX ?? "face-anchors/";

export function resolvePipelineVersion(
  overrideFromBrief?: PipelineVersion
): PipelineVersion {
  return overrideFromBrief ?? DEFAULT_PIPELINE_VERSION;
}

export function requireGoogleAiKey(): string {
  const key = process.env.GOOGLE_AI_API_KEY;
  if (!key) {
    throw new Error(
      "GOOGLE_AI_API_KEY is required for v2 pipeline (Nano Banana Pro). Get one from https://aistudio.google.com/app/apikey"
    );
  }
  return key;
}
