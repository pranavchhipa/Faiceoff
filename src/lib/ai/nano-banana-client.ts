import { MODELS, requireOpenRouterKey } from "./pipeline-config";
import type { AspectRatio } from "@/domains/generation/types";
import { ASPECT_RATIO_DIMENSIONS } from "@/domains/generation/types";

/**
 * Nano Banana Pro (Gemini 3 Pro Image / Gemini 2.5 Flash Image) client —
 * routed through OpenRouter's OpenAI-compatible chat completions API.
 *
 * We use OpenRouter (not Google AI Studio directly) because:
 *   1. OpenRouter credits are pre-paid, so no Google billing account hassles.
 *   2. Same model weights, same quality — just a proxy.
 *   3. One auth surface for all LLM + image calls in this codebase.
 *
 * OpenRouter exposes Gemini image generation via chat/completions with
 * `modalities: ["image", "text"]` and returns the generated image in
 * `choices[0].message.images[0].image_url.url` as a data: URL (base64).
 */

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export interface NanoBananaGenerateInput {
  /** LLM-assembled cinematic prompt (negative guidance merged inline — see prompt-assembler) */
  prompt: string;
  /** 3-5 face anchor URLs from Stage 0 */
  faceAnchorPack: string[];
  /** URL to brand's uploaded product photo */
  productImageUrl: string;
  /** Target aspect ratio */
  aspectRatio: AspectRatio;
  /** Seed for reproducibility / retry variance */
  seed?: number;
}

export interface NanoBananaGenerateResult {
  /** Generated image URL (data: URL; caller re-uploads to R2) */
  imageUrl: string;
  /** Provider operation / response ID for audit */
  predictionId: string;
  /** Actual dimensions produced (from ASPECT_RATIO_DIMENSIONS lookup) */
  width: number;
  height: number;
  /** Model slug actually used (resolves Pro vs fallback) */
  modelUsed: string;
}

/** Recognized safety block — worth falling back to v3 Kontext Max for same generation. */
export class NanoBananaSafetyBlockedError extends Error {
  constructor(public readonly raw: unknown) {
    super("Nano Banana Pro refused prompt for safety reasons");
    this.name = "NanoBananaSafetyBlockedError";
  }
}

/**
 * Fetch a remote image URL and return it as a data: URL ready for the
 * OpenAI-compatible `image_url` content part. OpenRouter accepts either a
 * remote https URL or an inline base64 data URL; we inline so we don't rely
 * on the signed Supabase URL still being valid when OR fetches it.
 */
async function fetchAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch reference image ${url}: HTTP ${res.status}`);
  }
  const mimeType = res.headers.get("content-type") ?? "image/png";
  const bytes = new Uint8Array(await res.arrayBuffer());
  const base64 = Buffer.from(bytes).toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

/** OpenRouter response shape for image generation (strict subset of OpenAI's). */
interface OpenRouterImageResponse {
  id?: string;
  choices?: Array<{
    finish_reason?: string | null;
    native_finish_reason?: string | null;
    message?: {
      role?: string;
      content?: string | null;
      images?: Array<{
        type?: string;
        image_url?: { url?: string };
      }>;
    };
    error?: { message?: string; code?: string | number };
  }>;
  error?: { message?: string; code?: string | number };
}

/**
 * Call Nano Banana (via OpenRouter) with:
 *   - a cinematic text prompt (includes negative guidance inline)
 *   - a product reference photo (to preserve)
 *   - a face anchor pack (3-5 images to preserve identity)
 *
 * On primary-model failure (availability OR quota), we retry once on the
 * fallback model (Flash Image).
 */
export async function generateWithNanoBanana(
  input: NanoBananaGenerateInput
): Promise<NanoBananaGenerateResult> {
  const apiKey = requireOpenRouterKey();
  const dims = ASPECT_RATIO_DIMENSIONS[input.aspectRatio];

  // Inline product + up to 5 face anchors as data URLs.
  const [productDataUrl, ...anchorDataUrls] = await Promise.all([
    fetchAsDataUrl(input.productImageUrl),
    ...input.faceAnchorPack.slice(0, 5).map(fetchAsDataUrl),
  ]);

  const promptWithAspect = `${input.prompt}\n\nTarget aspect ratio: ${input.aspectRatio}.`;

  // OpenAI-compatible multimodal content parts: text + product + face anchors.
  const content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [
    { type: "text", text: promptWithAspect },
    { type: "image_url", image_url: { url: productDataUrl } },
    ...anchorDataUrls.map((url) => ({
      type: "image_url" as const,
      image_url: { url },
    })),
  ];

  async function tryModel(modelName: string): Promise<NanoBananaGenerateResult> {
    const body: Record<string, unknown> = {
      model: modelName,
      // Ask for an image back, not just text.
      modalities: ["image", "text"],
      messages: [{ role: "user", content }],
      temperature: 0.9,
    };
    if (typeof input.seed === "number") {
      body.seed = input.seed;
    }

    const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
        "X-Title": "Faiceoff",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.text();
      // OpenRouter returns 4xx for safety blocks from upstream providers —
      // the body usually contains "moderation", "safety", or "content_policy".
      if (
        res.status === 400 &&
        /moderat|safety|content[_\s-]?polic|prohibited/i.test(errBody)
      ) {
        throw new NanoBananaSafetyBlockedError(errBody);
      }
      throw new Error(
        `OpenRouter API error (${res.status}) on ${modelName}: ${errBody}`
      );
    }

    const json = (await res.json()) as OpenRouterImageResponse;

    // Upstream-level errors surface either at top level or per-choice even on 200.
    if (json.error) {
      const msg = json.error.message ?? JSON.stringify(json.error);
      if (/moderat|safety|content[_\s-]?polic|prohibited/i.test(msg)) {
        throw new NanoBananaSafetyBlockedError(json.error);
      }
      throw new Error(`OpenRouter error on ${modelName}: ${msg}`);
    }

    const choice = json.choices?.[0];
    if (!choice) {
      throw new Error(
        `OpenRouter returned no choices on ${modelName} (response id=${json.id ?? "?"})`
      );
    }

    // Safety-block detection: OpenRouter maps Gemini's SAFETY/PROHIBITED to
    // finish_reason "content_filter" (OpenAI convention). The
    // native_finish_reason preserves the provider's original label.
    const finish = choice.finish_reason ?? choice.native_finish_reason ?? "";
    if (
      /content_filter|safety|prohibited|blocklist/i.test(finish)
    ) {
      throw new NanoBananaSafetyBlockedError(choice);
    }
    if (choice.error) {
      const msg = choice.error.message ?? JSON.stringify(choice.error);
      if (/moderat|safety|content[_\s-]?polic|prohibited/i.test(msg)) {
        throw new NanoBananaSafetyBlockedError(choice.error);
      }
      throw new Error(`OpenRouter choice error on ${modelName}: ${msg}`);
    }

    // Extract generated image from message.images[0].image_url.url (data URL).
    const image = choice.message?.images?.[0];
    const imageUrl = image?.image_url?.url;
    if (!imageUrl) {
      throw new Error(
        `OpenRouter returned no image on ${modelName} (finish_reason=${finish || "unknown"})`
      );
    }

    const predictionId =
      json.id ??
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
    //  - quota-exhausted (429/RESOURCE_EXHAUSTED) — Pro has tighter rate
    //    limits than Flash on OpenRouter, so Flash often still works.
    const isAvailabilityIssue =
      /404|NOT_FOUND|PERMISSION_DENIED|UNAUTHENTICATED|model.+not.+found|no.+endpoints/i.test(
        msg
      );
    const isQuotaIssue =
      /429|RESOURCE_EXHAUSTED|quota|rate.?limit|exceeded|insufficient/i.test(msg);
    if (!isAvailabilityIssue && !isQuotaIssue) throw err;
    return tryModel(MODELS.nanoBananaFallback);
  }
}
