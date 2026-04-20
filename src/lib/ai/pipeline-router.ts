import type { PipelineVersion, AspectRatio } from "@/domains/generation/types";
import {
  generateWithNanoBanana,
  NanoBananaSafetyBlockedError,
} from "./nano-banana-client";
import { generateWithKontext } from "./kontext-client";

/**
 * Common inference result shape all pipeline versions return.
 * v1 (legacy Flux Dev + LoRA) stays inline in generation-pipeline.ts — the
 * router covers v2 (Nano Banana Pro) and v3 (Kontext Max) since those use
 * multi-reference inputs with a shared contract.
 */
export interface PipelineInferenceResult {
  imageUrl: string;
  predictionId: string;
  modelUsed: string;
  /** Which pipeline version actually produced the image (may differ from requested if safety-fallback fired) */
  effectiveVersion: PipelineVersion;
  /**
   * Non-null when v2 Pro silently degraded to its Flash fallback (404 /
   * quota / permission). The pipeline persists this onto the generation
   * row + audit_log so Pro misconfigurations are visible instead of
   * producing quietly-worse output. `null` on a clean Pro success or on
   * v3 (Kontext has no internal Pro→Flash fallback).
   */
  fallbackReason: string | null;
}

export interface PipelineInferenceInput {
  version: PipelineVersion;
  prompt: string;
  negativePrompt: string;
  /** Full face anchor pack (3-5 URLs). Nano Banana uses all; Kontext uses first. */
  faceAnchorPack: string[];
  productImageUrl: string;
  aspectRatio: AspectRatio;
  seed?: number;
}

export async function runPipelineInference(
  input: PipelineInferenceInput
): Promise<PipelineInferenceResult> {
  switch (input.version) {
    case "v2": {
      try {
        const r = await generateWithNanoBanana({
          prompt: input.prompt,
          faceAnchorPack: input.faceAnchorPack,
          productImageUrl: input.productImageUrl,
          aspectRatio: input.aspectRatio,
          seed: input.seed,
        });
        return {
          imageUrl: r.imageUrl,
          predictionId: r.predictionId,
          modelUsed: r.modelUsed,
          effectiveVersion: "v2",
          fallbackReason: r.fallbackReason,
        };
      } catch (err) {
        // Safety block: auto-fallback to v3 for THIS generation only
        if (err instanceof NanoBananaSafetyBlockedError) {
          const anchor = input.faceAnchorPack[0];
          if (!anchor) throw err;
          const r = await generateWithKontext({
            prompt: input.prompt,
            negativePrompt: input.negativePrompt,
            productImageUrl: input.productImageUrl,
            faceAnchorUrl: anchor,
            aspectRatio: input.aspectRatio,
            seed: input.seed,
          });
          return {
            imageUrl: r.imageUrl,
            predictionId: r.predictionId,
            modelUsed: "flux-kontext-max (v2-safety-fallback)",
            effectiveVersion: "v3",
            fallbackReason: "v2 safety block → v3 Kontext",
          };
        }
        throw err;
      }
    }
    case "v3": {
      const anchor = input.faceAnchorPack[0];
      if (!anchor) {
        throw new Error("v3 (Kontext Max) requires a face anchor — pack empty");
      }
      const r = await generateWithKontext({
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        productImageUrl: input.productImageUrl,
        faceAnchorUrl: anchor,
        aspectRatio: input.aspectRatio,
        seed: input.seed,
      });
      return {
        imageUrl: r.imageUrl,
        predictionId: r.predictionId,
        modelUsed: "flux-kontext-max",
        effectiveVersion: "v3",
        fallbackReason: null,
      };
    }
    case "v1":
      throw new Error(
        "v1 (Flux Dev legacy) does not go through router — handled inline in generation-pipeline.ts"
      );
    default: {
      const exhaustive: never = input.version;
      throw new Error(`Unknown pipeline version: ${String(exhaustive)}`);
    }
  }
}
