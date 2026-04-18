import type { PipelineVersion } from "@/domains/generation/types";

/**
 * Centralized pipeline config — read env vars once and freeze.
 * Env var overrides allow per-generation selection via structured_brief.pipeline_version.
 */

export const DEFAULT_PIPELINE_VERSION: PipelineVersion =
  (process.env.GENERATION_PIPELINE_VERSION as PipelineVersion | undefined) ?? "v2";

export const MAX_RETRIES: number = Number(process.env.GENERATION_MAX_RETRIES ?? 2);

export const MODELS = {
  // v2 primary — routed via OpenRouter so we use OR credits instead of Google billing
  nanoBanana: process.env.NANO_BANANA_MODEL ?? "google/gemini-3-pro-image-preview",
  nanoBananaFallback:
    process.env.NANO_BANANA_FALLBACK_MODEL ?? "google/gemini-2.5-flash-image-preview",
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

export function requireOpenRouterKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error(
      "OPENROUTER_API_KEY is required for v2 pipeline (Nano Banana Pro via OpenRouter). Get one from https://openrouter.ai/keys"
    );
  }
  return key;
}

/** @deprecated v2 now routes through OpenRouter; kept as alias in case other callers imported it. */
export const requireGoogleAiKey = requireOpenRouterKey;
