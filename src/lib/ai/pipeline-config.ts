import type { PipelineVersion } from "@/domains/generation/types";

/**
 * Centralized pipeline config — read env vars once and freeze.
 * Env var overrides allow per-generation selection via structured_brief.pipeline_version.
 */

export const DEFAULT_PIPELINE_VERSION: PipelineVersion =
  (process.env.GENERATION_PIPELINE_VERSION as PipelineVersion | undefined) ?? "v2";

export const MAX_RETRIES: number = Number(process.env.GENERATION_MAX_RETRIES ?? 2);

export const MODELS = {
  // v2 primary
  nanoBanana: process.env.NANO_BANANA_MODEL ?? "gemini-3.0-pro-image",
  nanoBananaFallback:
    process.env.NANO_BANANA_FALLBACK_MODEL ?? "gemini-2.5-flash-image",
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
