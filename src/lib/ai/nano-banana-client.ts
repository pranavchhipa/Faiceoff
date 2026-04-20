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
  /**
   * If the primary Pro model failed and we fell back to Flash, the raw
   * error message (truncated). `null` on a clean Pro success. Surfaced so
   * the pipeline can persist it to audit_log + generation row — otherwise
   * the degradation is only visible in Vercel function logs and ops has
   * no way to know Pro is silently broken (e.g. misconfigured Vercel env
   * var, Google rotating preview suffixes).
   */
  fallbackReason: string | null;
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

  // Label each image block explicitly. Gemini 3 Pro Image otherwise treats the
  // image stream as undifferentiated references — the 5 face anchors overwhelm
  // the single product image and Gemini substitutes a generic pack format
  // (e.g., tetra-pak where the reference shows a PET bottle). A short text
  // marker before each block tells the model which is which and reliably
  // preserves the product's pack format + size.
  const parts = [
    { text: promptWithAspect },
    {
      text:
        "--- REFERENCE 1: PRODUCT ---\n" +
        "The next image is the EXACT product being featured. Preserve its pack " +
        "format, shape, size proportions, colour, label typography, brand mark, " +
        "and every character of on-pack text pixel-for-pixel. Do NOT substitute " +
        "a different pack format (e.g., if this is a PET bottle, do not render " +
        "a tetra-pak, can, or carton instead).",
    },
    { inlineData: productInline },
    {
      text:
        "--- REFERENCES 2-6: SUBJECT'S FACE ---\n" +
        "The next images are photos of the SAME person from different angles. " +
        "Preserve their facial identity, skin tone, bone structure, hair, and age " +
        "exactly. Use these as identity reference only — do not blend them with " +
        "the product image.",
    },
    ...anchorInlines.map((a) => ({ inlineData: a })),
  ];

  const generationConfig: Record<string, unknown> = {
    responseModalities: ["IMAGE"],
    temperature: 0.9,
  };
  if (typeof input.seed === "number") {
    generationConfig.seed = input.seed;
  }

  async function tryModel(
    modelName: string,
    fallbackReason: string | null,
  ): Promise<NanoBananaGenerateResult> {
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
      fallbackReason,
    };
  }

  // NO silent Pro→Flash fallback.
  //
  // The old behavior was: on 404/PERMISSION_DENIED or 429/RESOURCE_EXHAUSTED
  // from Pro, retry the same generation on Flash automatically. That doubled
  // the Google AI bill on every Pro failure (brand still charged for a Pro
  // generation, we billed Pro + Flash) AND masked broken Pro config — a stale
  // model ID would silently route 100% of traffic to Flash without anyone
  // noticing the quality regression.
  //
  // New behavior: Pro call runs exactly once. On error, throw. The Inngest
  // `onFailure` handler in generation-pipeline.ts flips the generation to
  // 'failed' and refunds the brand's escrow. Loud failure > silent double-
  // billing. If ops want to bring Flash-as-fallback back, set
  // NANO_BANANA_MODEL to the Flash model directly — that routes 100% of
  // traffic to Flash from the start rather than mixing both tiers.
  try {
    return await tryModel(MODELS.nanoBanana, null);
  } catch (err) {
    if (err instanceof NanoBananaSafetyBlockedError) {
      throw err; // propagate so router can decide (see pipeline-router.ts)
    }
    // Tag availability/quota errors clearly so the failure audit_log entry
    // tells ops exactly why the generation failed — easier to triage than a
    // raw stack trace, and it surfaces "your Pro quota is exhausted" without
    // requiring someone to go read Google AI Studio.
    const msg = err instanceof Error ? err.message : String(err);
    const isAvailabilityIssue =
      /404|NOT_FOUND|PERMISSION_DENIED|UNAUTHENTICATED|model.+not.+found/i.test(msg);
    const isQuotaIssue =
      /429|RESOURCE_EXHAUSTED|quota|rate.?limit|exceeded/i.test(msg);
    if (isAvailabilityIssue || isQuotaIssue) {
      const reason = isAvailabilityIssue ? "availability" : "quota";
      throw new Error(
        `Nano Banana Pro (${MODELS.nanoBanana}) failed [${reason}]: ${msg.slice(0, 200)}. ` +
          `No automatic Flash fallback — brand will be refunded. ` +
          `If this is a quota issue, wait for reset or raise the Google AI Studio cap. ` +
          `If it's an availability issue, verify NANO_BANANA_MODEL against ` +
          `GET https://generativelanguage.googleapis.com/v1beta/models.`,
      );
    }
    throw err;
  }
}
