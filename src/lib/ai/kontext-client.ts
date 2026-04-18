import { replicate } from "./replicate-client";
import { MODELS } from "./pipeline-config";
import type { AspectRatio } from "@/domains/generation/types";
import { ASPECT_RATIO_DIMENSIONS } from "@/domains/generation/types";

export interface KontextGenerateInput {
  prompt: string;
  negativePrompt: string;
  /** Primary reference: product photo (pixel preservation priority) */
  productImageUrl: string;
  /** Secondary reference: first image from face anchor pack */
  faceAnchorUrl: string;
  aspectRatio: AspectRatio;
  seed?: number;
}

export interface KontextGenerateResult {
  imageUrl: string;
  predictionId: string;
  width: number;
  height: number;
}

/**
 * v3 fallback model: Flux Kontext Max via Replicate. Used when Nano Banana
 * Pro (v2) is unavailable, returns a safety block, or the brief explicitly
 * pins pipeline_version=v3 (reflective products, foreign-script packaging).
 *
 * Note: Kontext Max accepts `image` (primary reference) and `image_2`
 * (secondary). We pass the product photo as primary so its pixels are
 * maximally preserved, and the first face anchor as secondary for identity.
 * Verify param names against https://replicate.com/black-forest-labs/flux-kontext-max/api
 * at integration time.
 */
export async function generateWithKontext(
  input: KontextGenerateInput
): Promise<KontextGenerateResult> {
  const dims = ASPECT_RATIO_DIMENSIONS[input.aspectRatio];

  const modelInput: Record<string, unknown> = {
    prompt: input.prompt,
    negative_prompt: input.negativePrompt,
    image: input.productImageUrl,
    image_2: input.faceAnchorUrl,
    aspect_ratio: input.aspectRatio,
    output_format: "png",
    output_quality: 95,
    safety_tolerance: 2,
  };
  if (typeof input.seed === "number") {
    modelInput.seed = input.seed;
  }

  const output = await replicate.run(
    MODELS.kontext as `${string}/${string}`,
    { input: modelInput }
  );

  const outputs = Array.isArray(output) ? output : [output];
  const first = outputs[0] as unknown;
  let imageUrl: string | null = null;

  if (typeof first === "string") {
    imageUrl = first;
  } else if (
    first &&
    typeof first === "object" &&
    "url" in first &&
    typeof (first as { url: unknown }).url === "function"
  ) {
    const u = (first as { url: () => URL | string }).url();
    imageUrl = u instanceof URL ? u.toString() : u;
  }

  if (!imageUrl) {
    throw new Error(
      `Kontext Max returned unexpected output shape: ${JSON.stringify(outputs).slice(0, 200)}`
    );
  }

  const predictionId = `kontext_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    imageUrl,
    predictionId,
    width: dims.width,
    height: dims.height,
  };
}
