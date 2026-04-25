/**
 * Gemini 3.1 Flash Image client.
 *
 * Wraps the Direct Google AI API (`@google/genai` SDK) for our identity-anchor
 * generation pipeline. Each call sends:
 *
 *   - 3 face reference images (creator's primary + 2 random photos)
 *   - 1 product reference image (brand-uploaded SKU shot)
 *   - A strict-anchor prompt that locks identity + product fidelity
 *
 * Returns raw image bytes + MIME type. Caller is responsible for safety checks
 * and storage.
 *
 * Has 1 inline retry on transient failure. On second failure, throws —
 * caller is responsible for refund (releaseReserve + rollbackCredit).
 */

import { GoogleGenAI, Modality } from "@google/genai";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

// Model name resolves from env in this priority:
//   1. NANO_BANANA_MODEL  (existing Vercel env from Apr 21)
//   2. GEMINI_MODEL       (new alias for clarity)
//   3. hardcoded default
const DEFAULT_MODEL = "gemini-3.1-flash-image-preview";
function getModel(): string {
  return (
    process.env.NANO_BANANA_MODEL ??
    process.env.GEMINI_MODEL ??
    DEFAULT_MODEL
  );
}

/**
 * Anchor wrapper using "book-end" structure for maximum identity preservation.
 *
 * Why this structure:
 *   Gemini's attention is recency-biased — the last tokens dominate. Putting
 *   only identity at the TOP gets overwhelmed by styling tokens later
 *   ("editorial", "Sony A7R-V", "magazine-quality") that pull from fashion-
 *   photography datasets where beauty bias slims faces and sharpens jaws.
 *
 *   Solution: identity anchors at BOTH ends of the prompt. The creative brief
 *   sits in the middle. The model sees identity → brief → identity, so the
 *   FINAL instruction it processes is "do not modify the face."
 *
 * Why the explicit anti-slimming language:
 *   Generic "match the face" instructions aren't enough — modern image models
 *   default to industry-standard beauty (slim face, sharp jaw, smooth skin).
 *   We must explicitly tell the model NOT to do this. Negative phrasing like
 *   "do NOT slim" works better than positive phrasing because the bias is so
 *   strong that the model needs an explicit override.
 */
function sanitizeBeautyTriggers(text: string): string {
  // Soften the most aggressive beauty-bias triggers without destroying the
  // brand's stylistic intent. We're not removing all camera/quality language
  // (that would override the brand's choice) — we're just pulling the
  // teeth on the words that most reliably activate fashion-magazine bias.
  return text
    .replace(/\bmagazine-quality\b/gi, "high-quality")
    .replace(/\beditorial portrait\b/gi, "candid portrait")
    .replace(/\bcommercial-shoot quality\b/gi, "natural realistic quality")
    .replace(/\bglamour\b/gi, "natural")
    .replace(/\bflawless\b/gi, "natural");
}

function buildAnchorPrompt(
  assembledPrompt: string,
  aspectRatio: string,
): string {
  const cleanedBrief = sanitizeBeautyTriggers(assembledPrompt);

  return [
    // ── OPENING ANCHOR — IDENTITY ──────────────────────────────────────
    "IDENTITY LOCK (read carefully):",
    "The subject in the final image MUST be the exact same person shown in the first 3 reference images — not a similar-looking person, not an averaged or idealised version, not a model who resembles them.",
    "",
    "Preserve EXACTLY from the face references:",
    "  • Face shape, including natural cheek fullness and jawline width — DO NOT slim, narrow, or sharpen the face",
    "  • Body proportions, including shoulder width and natural frame — DO NOT make the body thinner or taller than reference",
    "  • Skin texture, including pores, natural variation, and any blemishes — DO NOT airbrush, smooth, or retouch",
    "  • Eye shape, eyebrow shape, lip shape, nose shape — copy from the references",
    "  • Hairline, hair texture, hair length, hair colour",
    "",
    // ── OPENING ANCHOR — PRODUCT ───────────────────────────────────────
    "PRODUCT LOCK (read carefully):",
    "The product reference (the LAST image attached, after the face references) is a real, specific SKU. Treat its packaging like a photograph you must reproduce — every detail copied pixel-for-pixel:",
    "",
    "  • Brand wordmark / logo — exact spelling, exact font, exact placement, exact colour",
    "  • All text on the packaging — readable in the final image, character-for-character match",
    "  • Pack format (tube, jar, bottle, box, can, tin, sachet) — never swap formats",
    "  • Pack silhouette and proportions — same width-to-height ratio",
    "  • Cap / lid / closure colour and material",
    "  • Body colour(s) of the packaging — exact hue, no substitutions",
    "  • Any taglines, ingredient callouts, volume markings — all preserved",
    "",
    "DO NOT invent generic-looking packaging. DO NOT paraphrase the brand name. DO NOT substitute a similar-category product. DO NOT blur or remove the brand text. If you cannot read the brand name clearly in your output, the product is wrong.",
    "",
    // ── CREATIVE BRIEF (sandwiched in middle) ──────────────────────────
    "─── SCENE & STYLE ───",
    cleanedBrief,
    "",
    // ── CLOSING ANCHOR — IDENTITY (recency-weighted, MAX attention) ────
    "─── FINAL CHECK #1 — IDENTITY ───",
    "Look at the face in the references one more time. The output face must:",
    "  ✓ Have the SAME width, fullness, and shape as the references — not slimmer, not sharper",
    "  ✓ Have the SAME body proportions — not thinner, not different frame",
    "  ✓ Have the SAME skin (with all natural texture) — not smoothed, not airbrushed",
    "  ✓ Look like another candid frame from the same person's same week",
    "",
    "If your output makes the person look more conventionally attractive than the references, you have failed the assignment. Match what is real, not what is idealised.",
    "",
    // ── CLOSING ANCHOR — PRODUCT (final, max recency weight) ───────────
    "─── FINAL CHECK #2 — PRODUCT FIDELITY ───",
    "Look at the product reference image one more time. The product in your output must:",
    "  ✓ Have the SAME brand wordmark, in the SAME font, in the SAME position — clearly readable",
    "  ✓ Show ALL text from the original packaging — no missing labels, no blurred text, no invented words",
    "  ✓ Match the exact pack format — never substitute (e.g. don't turn a tube into a jar, a bottle into a can)",
    "  ✓ Use the exact same body colour, cap colour, and material finish",
    "",
    "If a viewer cannot read the brand name and product variant clearly in your output, the product is wrong. The packaging is a real commercial SKU — treat it like a logo trademark, not a creative suggestion.",
    "",
    `Output format: photorealistic image, ${aspectRatio} aspect ratio.`,
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Lazy client (avoids env-var read at import time)
// ─────────────────────────────────────────────────────────────────────────────

let _client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (_client) return _client;
  // Accept either GEMINI_API_KEY (new) or GOOGLE_AI_API_KEY (existing Vercel
  // env from the legacy Nano-Banana flow). Either works.
  const apiKey =
    process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing API key — set GEMINI_API_KEY or GOOGLE_AI_API_KEY",
    );
  }
  _client = new GoogleGenAI({ apiKey });
  return _client;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ImageInput {
  /** Raw image bytes. */
  bytes: Uint8Array;
  /** MIME type (e.g. "image/jpeg", "image/png"). */
  mimeType: string;
}

export interface GenerateImageParams {
  /** 1-3 face reference images. Primary should be first. */
  faceRefs: ImageInput[];
  /** 1 product reference image (mandatory). */
  productImage: ImageInput;
  /** LLM-assembled creative prompt (will be wrapped in anchor template). */
  assembledPrompt: string;
  /** Aspect ratio string (e.g. "1:1", "9:16"). */
  aspectRatio: string;
}

export interface GenerateImageResult {
  bytes: Uint8Array;
  mimeType: string;
  /** Final wrapped prompt that was sent to Gemini (audit trail). */
  finalPrompt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function base64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

/**
 * One Gemini call. Throws on any failure. The caller wraps this with retry
 * logic.
 */
async function callGeminiOnce(
  params: GenerateImageParams,
): Promise<GenerateImageResult> {
  const finalPrompt = buildAnchorPrompt(
    params.assembledPrompt,
    params.aspectRatio,
  );

  if (params.faceRefs.length === 0) {
    throw new Error("gemini-client: at least 1 face reference is required");
  }

  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [{ text: finalPrompt }];

  for (const ref of params.faceRefs) {
    parts.push({
      inlineData: {
        mimeType: ref.mimeType,
        data: bytesToBase64(ref.bytes),
      },
    });
  }
  parts.push({
    inlineData: {
      mimeType: params.productImage.mimeType,
      data: bytesToBase64(params.productImage.bytes),
    },
  });

  const client = getClient();
  const modelName = getModel();
  let response;
  try {
    response = await client.models.generateContent({
      model: modelName,
      contents: [{ role: "user", parts }],
      config: {
        // gemini-*-image-preview models REQUIRE both modalities even if we
        // only want the image — passing IMAGE alone returns an InvalidArgument.
        responseModalities: [Modality.TEXT, Modality.IMAGE],
      },
    });
  } catch (err) {
    // Re-throw with model name + first part of message so logs make sense
    // when the Vercel runtime swallows the SDK-level details.
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Gemini SDK call failed (model=${modelName}): ${msg.slice(0, 500)}`,
    );
  }

  // Walk candidates → content.parts → first inlineData with image MIME.
  const candidates = response.candidates ?? [];
  for (const cand of candidates) {
    const candParts = cand.content?.parts ?? [];
    for (const part of candParts) {
      const inline = (part as { inlineData?: { mimeType?: string; data?: string } })
        .inlineData;
      if (inline?.data && inline.mimeType?.startsWith("image/")) {
        return {
          bytes: base64ToBytes(inline.data),
          mimeType: inline.mimeType,
          finalPrompt,
        };
      }
    }
  }

  // Surface text response if Gemini refused to produce an image (safety block,
  // policy violation, etc.) — gives ops a useful error message.
  const textParts: string[] = [];
  for (const cand of candidates) {
    for (const part of cand.content?.parts ?? []) {
      const t = (part as { text?: string }).text;
      if (t) textParts.push(t);
    }
  }
  const textMsg = textParts.join(" ").slice(0, 200);
  throw new Error(
    `Gemini returned no image. ${textMsg ? `Reason: ${textMsg}` : "Response was empty."}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate an image via Gemini 3.1 Flash Image with 1 inline retry.
 *
 * Throws on second failure — caller MUST handle refund.
 */
export async function generateImage(
  params: GenerateImageParams,
): Promise<GenerateImageResult> {
  try {
    return await callGeminiOnce(params);
  } catch (firstErr) {
    const firstMsg =
      firstErr instanceof Error ? firstErr.message : String(firstErr);
    console.warn(`[gemini-client] First attempt failed: ${firstMsg}. Retrying once.`);
    try {
      return await callGeminiOnce(params);
    } catch (secondErr) {
      const secondMsg =
        secondErr instanceof Error ? secondErr.message : String(secondErr);
      throw new Error(
        `Gemini generation failed after 1 retry. First: ${firstMsg}. Second: ${secondMsg}`,
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 2: Product refinement
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the refinement prompt — instructs Gemini to EDIT the previous output
 * (not regenerate from scratch), correcting only the product packaging while
 * leaving face / pose / scene untouched.
 *
 * Why this works better than asking Gemini to nail the product in one pass:
 *   - In stage 1, Gemini's attention is split across face anchor, scene, lighting,
 *     product. Even with strong product anchor language, small text suffers.
 *   - In stage 2, the model has FAR less to imagine — face/scene already correct,
 *     only the product needs fixing. With reduced cognitive load, attention
 *     concentrates on copying product details accurately.
 *   - Diffusion models are also fundamentally better at "preserve this region
 *     from reference" than "generate this from scratch."
 */
function buildRefinementPrompt(aspectRatio: string): string {
  return [
    "REFINEMENT TASK — read carefully:",
    "You are editing an already-generated lifestyle photograph (the FIRST attached image). Your ONLY job is to correct the product packaging in that image so it pixel-matches the product reference (the SECOND attached image).",
    "",
    "STRICT RULES — DO NOT change anything else:",
    "  ✗ DO NOT change the person's face, hair, skin texture, body, or expression",
    "  ✗ DO NOT change the pose, hand position, or finger grip on the product",
    "  ✗ DO NOT change the lighting, shadows, background, or scene at all",
    "  ✗ DO NOT change the camera angle, framing, or composition",
    "",
    "WHAT TO FIX — the product packaging only:",
    "  ✓ Replace the product with the EXACT packaging from the reference",
    "  ✓ Brand wordmark — exact font, exact spelling, exact placement, exact colour",
    "  ✓ ALL text on the package readable, character-for-character match",
    "  ✓ Pack format unchanged (tube stays tube, jar stays jar, etc.)",
    "  ✓ Body colour, cap colour, surface finish — all match reference exactly",
    "  ✓ Every label, tagline, volume marking from reference preserved",
    "  ✓ Maintain the product's existing position, scale, angle, and lighting in the scene",
    "",
    "Think of it as wrapping the reference packaging's surface graphics around the product silhouette already in the image. Same hand grip, same perspective, same shadows — only the labels and colours come from the reference.",
    "",
    "If a viewer cannot read the brand name and product variant clearly in your output, you have failed the assignment.",
    "",
    `Output: photorealistic image, ${aspectRatio} aspect ratio, IDENTICAL to the first attached image except for the product, which now matches the second attached image.`,
  ].join("\n");
}

/**
 * One refinement call. Throws on any failure. Caller wraps with retry logic.
 */
async function callRefineOnce(params: {
  generatedImage: ImageInput;
  productImage: ImageInput;
  aspectRatio: string;
}): Promise<GenerateImageResult> {
  const finalPrompt = buildRefinementPrompt(params.aspectRatio);

  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [
    { text: finalPrompt },
    {
      inlineData: {
        mimeType: params.generatedImage.mimeType,
        data: bytesToBase64(params.generatedImage.bytes),
      },
    },
    {
      inlineData: {
        mimeType: params.productImage.mimeType,
        data: bytesToBase64(params.productImage.bytes),
      },
    },
  ];

  const client = getClient();
  const modelName = getModel();
  let response;
  try {
    response = await client.models.generateContent({
      model: modelName,
      contents: [{ role: "user", parts }],
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Gemini refinement SDK call failed (model=${modelName}): ${msg.slice(0, 500)}`,
    );
  }

  // Walk candidates → content.parts → first inlineData with image MIME.
  const candidates = response.candidates ?? [];
  for (const cand of candidates) {
    const candParts = cand.content?.parts ?? [];
    for (const part of candParts) {
      const inline = (
        part as { inlineData?: { mimeType?: string; data?: string } }
      ).inlineData;
      if (inline?.data && inline.mimeType?.startsWith("image/")) {
        return {
          bytes: base64ToBytes(inline.data),
          mimeType: inline.mimeType,
          finalPrompt,
        };
      }
    }
  }

  // Surface text response if Gemini refused to produce an image
  const textParts: string[] = [];
  for (const cand of candidates) {
    for (const part of cand.content?.parts ?? []) {
      const t = (part as { text?: string }).text;
      if (t) textParts.push(t);
    }
  }
  const textMsg = textParts.join(" ").slice(0, 200);
  throw new Error(
    `Gemini refinement returned no image. ${textMsg ? `Reason: ${textMsg}` : "Response empty."}`,
  );
}

/**
 * Stage 2: refine the product packaging in a generated image.
 *
 * Takes the stage-1 output + the original product reference, and asks Gemini
 * to correct ONLY the product (label, text, colours) while preserving every
 * other pixel of the scene.
 *
 * 1 inline retry. Throws on second failure — caller decides whether to fall
 * back to stage-1 output or surface the error.
 */
export async function refineProductInImage(params: {
  generatedImage: ImageInput;
  productImage: ImageInput;
  aspectRatio: string;
}): Promise<GenerateImageResult> {
  try {
    return await callRefineOnce(params);
  } catch (firstErr) {
    const firstMsg =
      firstErr instanceof Error ? firstErr.message : String(firstErr);
    console.warn(
      `[gemini-client] Refinement first attempt failed: ${firstMsg}. Retrying once.`,
    );
    try {
      return await callRefineOnce(params);
    } catch (secondErr) {
      const secondMsg =
        secondErr instanceof Error ? secondErr.message : String(secondErr);
      throw new Error(
        `Gemini refinement failed after 1 retry. First: ${firstMsg}. Second: ${secondMsg}`,
      );
    }
  }
}
