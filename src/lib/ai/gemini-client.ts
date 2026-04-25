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
    // ── OPENING ANCHOR ─────────────────────────────────────────────────
    "IDENTITY LOCK (read carefully):",
    "The subject in the final image MUST be the exact same person shown in the first 3 reference images — not a similar-looking person, not an averaged or idealised version, not a model who resembles them.",
    "",
    "Preserve EXACTLY from the references:",
    "  • Face shape, including natural cheek fullness and jawline width — DO NOT slim, narrow, or sharpen the face",
    "  • Body proportions, including shoulder width and natural frame — DO NOT make the body thinner or taller than reference",
    "  • Skin texture, including pores, natural variation, and any blemishes — DO NOT airbrush, smooth, or retouch",
    "  • Eye shape, eyebrow shape, lip shape, nose shape — copy from the references",
    "  • Hairline, hair texture, hair length, hair colour",
    "",
    "The product (image 4) MUST match exactly: same packaging, same colour, same label typography, same brand mark. Do not redesign or substitute.",
    "",
    // ── CREATIVE BRIEF (sandwiched in middle, lower attention weight) ──
    "─── SCENE & STYLE ───",
    cleanedBrief,
    "",
    // ── CLOSING ANCHOR (recency-weighted, MAX attention) ───────────────
    "─── FINAL CHECK BEFORE GENERATING ───",
    "Look at the face in the references one more time. The output face must:",
    "  ✓ Have the SAME width, fullness, and shape as the references — not slimmer, not sharper",
    "  ✓ Have the SAME body proportions — not thinner, not different frame",
    "  ✓ Have the SAME skin (with all natural texture) — not smoothed, not airbrushed",
    "  ✓ Look like another candid frame from the same person's same week",
    "",
    "If your output makes the person look more conventionally attractive than the references, you have failed the assignment. Match what is real, not what is idealised.",
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
