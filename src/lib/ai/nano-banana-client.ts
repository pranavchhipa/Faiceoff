import { GoogleGenAI } from "@google/genai";
import { MODELS, requireGoogleAiKey } from "./pipeline-config";
import type { AspectRatio } from "@/domains/generation/types";
import { ASPECT_RATIO_DIMENSIONS } from "@/domains/generation/types";

export interface NanoBananaGenerateInput {
  /** LLM-assembled cinematic prompt (negative guidance merged inline — see prompt-assembler) */
  prompt: string;
  /** 3-5 face anchor URLs from Stage 0 */
  faceAnchorPack: string[];
  /** URL to brand's uploaded product photo */
  productImageUrl: string;
  /** Target aspect ratio */
  aspectRatio: AspectRatio;
  /** Seed for reproducibility / retry variance (Gemini "seed" in generationConfig) */
  seed?: number;
}

export interface NanoBananaGenerateResult {
  /** Generated image URL (temporary; caller re-uploads to R2) */
  imageUrl: string;
  /** Provider operation / response ID for audit */
  predictionId: string;
  /** Actual dimensions produced (from response metadata, else ASPECT_RATIO_DIMENSIONS lookup) */
  width: number;
  height: number;
  /** Model slug actually used (resolves Pro vs fallback) */
  modelUsed: string;
}

/** Recognized Gemini safety block — worth falling back to v3 Kontext Max for same generation. */
export class NanoBananaSafetyBlockedError extends Error {
  constructor(public readonly raw: unknown) {
    super("Nano Banana Pro refused prompt for safety reasons");
    this.name = "NanoBananaSafetyBlockedError";
  }
}

/**
 * Fetch a remote image URL and return a Buffer + MIME type for inline payload.
 * Gemini's image-input API takes base64-encoded inline data OR fileData refs;
 * we use inline data so we don't need to maintain a Google Cloud Storage bucket.
 */
async function fetchAsInlineData(
  url: string
): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch reference image ${url}: HTTP ${res.status}`);
  }
  const mimeType = res.headers.get("content-type") ?? "image/png";
  const bytes = new Uint8Array(await res.arrayBuffer());
  // Node-friendly base64 encode (works in Next.js server runtime)
  const data = Buffer.from(bytes).toString("base64");
  return { data, mimeType };
}

/**
 * Call Nano Banana Pro (Gemini 3 Pro Image or 2.5 Flash Image) with:
 *   - a cinematic text prompt (includes negative guidance inline)
 *   - a product reference photo (to preserve)
 *   - a face anchor pack (3-5 images to preserve identity)
 *
 * Gemini image models accept a multi-part `contents` array where each part
 * is either text or inlineData (base64-encoded image). We assemble:
 *   [text prompt, product image, ...face anchors]
 *
 * If the primary "Pro" model throws NOT_FOUND or PERMISSION_DENIED (some API
 * keys don't have Pro access), we retry once on the fallback model.
 *
 * Note: Gemini SDK surface evolves — verify the latest call shape against
 *   https://ai.google.dev/gemini-api/docs/image-generation
 * at integration time. The shape below is accurate for @google/genai >= 0.3.x
 * as of 2026-04.
 */
export async function generateWithNanoBanana(
  input: NanoBananaGenerateInput
): Promise<NanoBananaGenerateResult> {
  const ai = new GoogleGenAI({ apiKey: requireGoogleAiKey() });
  const dims = ASPECT_RATIO_DIMENSIONS[input.aspectRatio];

  // Assemble multi-part contents: prompt + product image + face anchors (first 5)
  const [productInline, ...anchorInlines] = await Promise.all([
    fetchAsInlineData(input.productImageUrl),
    ...input.faceAnchorPack.slice(0, 5).map(fetchAsInlineData),
  ]);

  const promptWithAspect = `${input.prompt}\n\nTarget aspect ratio: ${input.aspectRatio}.`;

  const parts = [
    { text: promptWithAspect },
    { inlineData: productInline },
    ...anchorInlines.map((a) => ({ inlineData: a })),
  ];

  const generationConfig: Record<string, unknown> = {
    responseModalities: ["IMAGE"],
    temperature: 0.9,
  };
  if (typeof input.seed === "number") {
    generationConfig.seed = input.seed;
  }

  async function tryModel(modelName: string): Promise<NanoBananaGenerateResult> {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: "user", parts }],
      config: generationConfig,
    });

    // Safety block detection
    const candidate = response.candidates?.[0];
    if (!candidate) {
      throw new NanoBananaSafetyBlockedError(response);
    }
    if (
      candidate.finishReason === "SAFETY" ||
      candidate.finishReason === "PROHIBITED_CONTENT" ||
      candidate.finishReason === "BLOCKLIST"
    ) {
      throw new NanoBananaSafetyBlockedError(candidate);
    }

    // Extract inline image bytes from first image part
    const imagePart = candidate.content?.parts?.find(
      (p: unknown): p is { inlineData: { data: string; mimeType: string } } =>
        typeof p === "object" &&
        p !== null &&
        "inlineData" in p &&
        typeof (p as { inlineData: { data?: unknown } }).inlineData?.data ===
          "string"
    );
    if (!imagePart) {
      throw new Error(
        `Nano Banana returned no image part (finishReason=${candidate.finishReason ?? "unknown"})`
      );
    }

    const base64 = imagePart.inlineData.data;
    const mime = imagePart.inlineData.mimeType ?? "image/png";

    // Upload to a short-lived data URL; downstream code re-uploads to R2.
    // We return a data: URL so the pipeline's existing "fetch + upload to R2"
    // pattern works without branching on provider.
    const imageUrl = `data:${mime};base64,${base64}`;

    const predictionId =
      response.responseId ??
      `nano_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    return {
      imageUrl,
      predictionId,
      width: dims.width,
      height: dims.height,
      modelUsed: modelName,
    };
  }

  try {
    return await tryModel(MODELS.nanoBanana);
  } catch (err) {
    if (err instanceof NanoBananaSafetyBlockedError) {
      throw err; // propagate so router can fall back to v3
    }
    const msg = err instanceof Error ? err.message : String(err);
    // Fall back to Flash Image when Pro is:
    //  - not available on this key (404/permission)
    //  - quota-exhausted (429/RESOURCE_EXHAUSTED) — Pro has a much tighter
    //    free-tier quota than Flash, so Flash often still works.
    const isAvailabilityIssue =
      /404|NOT_FOUND|PERMISSION_DENIED|UNAUTHENTICATED|model.+not.+found/i.test(msg);
    const isQuotaIssue =
      /429|RESOURCE_EXHAUSTED|quota|rate.?limit|exceeded/i.test(msg);
    if (!isAvailabilityIssue && !isQuotaIssue) throw err;
    return tryModel(MODELS.nanoBananaFallback);
  }
}
