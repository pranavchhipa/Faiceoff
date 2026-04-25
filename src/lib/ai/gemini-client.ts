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
 * Hardcoded anchor wrapper. The brand's creative brief (LLM-assembled) is
 * inserted into {assembled_prompt}. This ensures Gemini does not drift on
 * identity or product fidelity even if the creative prompt is loose.
 */
function buildAnchorPrompt(
  assembledPrompt: string,
  aspectRatio: string,
): string {
  return [
    "CRITICAL CONSTRAINTS (do not deviate):",
    "- The person's face, skin tone, hair, and facial features MUST exactly match the first 3 reference images. This is the same individual.",
    "- The product MUST exactly match image 4. Same shape, color, label, branding. Do not redesign, restyle, or imagine variations.",
    "",
    "CREATIVE BRIEF:",
    assembledPrompt,
    "",
    `OUTPUT: photorealistic, ${aspectRatio} aspect ratio, commercial-shoot quality.`,
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
