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
 *
 * Hardened against signed-URL failure modes observed in prod (2026-04-21):
 *   - Expired signed URLs sometimes return 200 with an HTML error page body.
 *     Our old code would base64 the HTML and hand it to Gemini, which would
 *     burn through a ~₹100 Pro Image call producing nothing useful.
 *   - "Not Found" JSON responses from Supabase Storage similarly come back
 *     200 with application/json — same failure mode.
 *
 * We now validate content-type + size BEFORE handing bytes to Gemini. Any
 * anomaly throws a descriptive error that short-circuits the Gemini call
 * entirely — saving the billed-but-useless call.
 */
const MIN_VALID_IMAGE_BYTES = 1024; // <1KB is almost certainly an error page
const MAX_INLINE_IMAGE_BYTES = 10 * 1024 * 1024; // Gemini caps at ~20MB; stay conservative

async function fetchAsInlineData(
  url: string
): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Reference image fetch failed: HTTP ${res.status} for ${url.slice(0, 120)}`,
    );
  }
  const mimeType = res.headers.get("content-type") ?? "";
  if (!mimeType.startsWith("image/")) {
    throw new Error(
      `Reference URL returned non-image content-type "${mimeType}" ` +
        `(URL=${url.slice(0, 120)}). Likely an expired signed URL, auth redirect, ` +
        `or JSON error body. Refusing to send to Gemini — would burn the Pro call budget ` +
        `on garbage input.`,
    );
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length < MIN_VALID_IMAGE_BYTES) {
    throw new Error(
      `Reference image suspiciously small: ${bytes.length} bytes ` +
        `(URL=${url.slice(0, 120)}). Likely a stub or error page.`,
    );
  }
  if (bytes.length > MAX_INLINE_IMAGE_BYTES) {
    throw new Error(
      `Reference image too large for inline payload: ${bytes.length} bytes ` +
        `(URL=${url.slice(0, 120)}). Cap is ${MAX_INLINE_IMAGE_BYTES}.`,
    );
  }
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
  // ── Pre-flight input validation ─────────────────────────────────────────
  // Every one of these checks MUST run before the Gemini call. Each Pro
  // Image call bills at ~₹100 (Tier 1 preview pricing), so any input
  // problem we can catch here saves the exact amount of a wasted call.
  if (!input.prompt || input.prompt.trim().length === 0) {
    throw new Error("Nano Banana pre-flight: prompt is empty");
  }
  if (input.prompt.length > 32_000) {
    throw new Error(
      `Nano Banana pre-flight: prompt is ${input.prompt.length} chars, above Gemini's safe limit (~32k)`,
    );
  }
  if (!input.productImageUrl) {
    throw new Error("Nano Banana pre-flight: productImageUrl is required");
  }
  if (!input.faceAnchorPack || input.faceAnchorPack.length === 0) {
    throw new Error(
      "Nano Banana pre-flight: faceAnchorPack is empty — cannot lock identity",
    );
  }
  if (!MODELS.nanoBanana || MODELS.nanoBanana.trim().length === 0) {
    throw new Error(
      "Nano Banana pre-flight: NANO_BANANA_MODEL env var is empty — " +
        "would hit Gemini's default routing and get 404'd",
    );
  }

  const ai = new GoogleGenAI({ apiKey: requireGoogleAiKey() });
  const dims = ASPECT_RATIO_DIMENSIONS[input.aspectRatio];

  // Assemble multi-part contents: prompt + product image + face anchors (first 5)
  // All fetches happen BEFORE the Gemini call — any URL problem throws here
  // and short-circuits the billing. fetchAsInlineData validates content-type
  // + size, so expired signed URLs / HTML error pages are caught too.
  const [productInline, ...anchorInlines] = await Promise.all([
    fetchAsInlineData(input.productImageUrl),
    ...input.faceAnchorPack.slice(0, 5).map(fetchAsInlineData),
  ]);

  console.log(
    `[nano-banana] pre-flight ok: model=${MODELS.nanoBanana} ` +
      `product=${productInline.mimeType}/${productInline.data.length}b64 ` +
      `anchors=${anchorInlines.length} prompt=${input.prompt.length}chars`,
  );

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
    const t0 = Date.now();
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: "user", parts }],
      config: generationConfig,
    });
    const elapsedMs = Date.now() - t0;

    // Log response metadata on EVERY call (success or failure). This is the
    // only way to diagnose "billed ₹100, no image" failures — without this,
    // the Gemini response is a black box and we can't tell if the issue was
    // safety, empty response, wrong shape, or parser bug.
    const usage = (
      response as unknown as {
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          totalTokenCount?: number;
        };
      }
    ).usageMetadata;
    console.log(
      `[nano-banana:${modelName}] response in ${elapsedMs}ms ` +
        `candidates=${response.candidates?.length ?? 0} ` +
        `finishReason=${response.candidates?.[0]?.finishReason ?? "?"} ` +
        `tokens=${usage?.totalTokenCount ?? "?"} ` +
        `(prompt=${usage?.promptTokenCount ?? "?"}, ` +
        `cand=${usage?.candidatesTokenCount ?? "?"})`,
    );

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

    // Extract image from candidate parts. Gemini may return the image as
    // either `inlineData` (base64 inline bytes — preferred, what we ask for)
    // or `fileData` (a URI to fetch from Google's CDN — rarer for image-out
    // but possible with certain model variants). Handle both so we don't
    // burn a ₹100 call because we only checked one shape.
    const allParts = (candidate.content?.parts ?? []) as unknown[];
    let base64: string | null = null;
    let mime = "image/png";
    let extractedFrom: "inlineData" | "fileData" | null = null;

    for (const p of allParts) {
      if (!p || typeof p !== "object") continue;

      const inline = (p as { inlineData?: { data?: unknown; mimeType?: unknown } })
        .inlineData;
      if (
        inline &&
        typeof inline.data === "string" &&
        inline.data.length > 0
      ) {
        base64 = inline.data;
        if (typeof inline.mimeType === "string") mime = inline.mimeType;
        extractedFrom = "inlineData";
        break;
      }

      const fileRef = (p as { fileData?: { fileUri?: unknown; mimeType?: unknown } })
        .fileData;
      if (
        fileRef &&
        typeof fileRef.fileUri === "string" &&
        fileRef.fileUri.length > 0
      ) {
        const fetchRes = await fetch(fileRef.fileUri);
        if (fetchRes.ok) {
          const bytes = new Uint8Array(await fetchRes.arrayBuffer());
          base64 = Buffer.from(bytes).toString("base64");
          if (typeof fileRef.mimeType === "string") mime = fileRef.mimeType;
          extractedFrom = "fileData";
          break;
        }
      }
    }

    if (!base64) {
      // Log full parts shape (truncated) so we can see exactly what Gemini
      // returned. Without this, "returned no image part" is undiagnosable
      // in prod — you don't know if it was text-only, an empty array, or a
      // shape we haven't seen before.
      const partsSummary = allParts.map((p) => {
        if (!p || typeof p !== "object") return typeof p;
        const keys = Object.keys(p as Record<string, unknown>);
        return keys.join("+") || "{}";
      });
      throw new Error(
        `Nano Banana returned no usable image part. ` +
          `model=${modelName} finishReason=${candidate.finishReason ?? "?"} ` +
          `partsCount=${allParts.length} partShapes=[${partsSummary.join(",")}]. ` +
          `Raw response snippet: ${JSON.stringify(response).slice(0, 400)}`,
      );
    }
    console.log(
      `[nano-banana:${modelName}] extracted image via ${extractedFrom}, mime=${mime}, b64Len=${base64.length}`,
    );

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
