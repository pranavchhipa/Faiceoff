import { chatCompletion } from "./openrouter-client";

/**
 * LLM-powered prompt assembler.
 *
 * Takes the structured brief from the campaign form and produces a
 * professional photography-grade prompt optimised for FLUX / Stable Diffusion
 * image generation models.
 *
 * Uses a fast, cheap LLM via OpenRouter (Google Gemini Flash).
 */

const SYSTEM_PROMPT = `You are a commercial photography art director writing prompts for Nano Banana Pro (Google Gemini Image), a multi-reference photorealistic generator.

Given a structured brief (JSON with product info, scene, composition, aspect_ratio), output ONE prompt string in this exact structure:

"A candid photograph of a person [interaction verb: holding / wearing / using] [product_name]. [scene_description in one sentence].

Technical: shot on Sony A7IV with 85mm f/1.4 prime, natural window light from camera left, golden hour, shallow depth of field, subsurface scattering on skin, visible pores, 35mm film grain, slight chromatic aberration, unretouched, Kodak Portra 400 color palette.

Composition: [composition_hint from brief]. Aspect: [aspect_ratio from brief].

CRITICAL: Preserve the exact product from the product reference image — its shape, colour, label typography, and any text on the pack must remain pixel-faithful. Preserve the exact person identity from the face reference pack — same facial structure, skin tone, and hair.

Avoid: plastic skin, waxy finish, cgi look, 3d render, airbrushing, over-smooth skin, glossy artificial highlights, uncanny eyes, distorted anatomy, extra fingers, malformed hands, blurry focus, jpeg artifacts, watermarks, text overlays, fabricated logos, product text distortion."

Rules:
- No LoRA trigger words (Nano Banana is not LoRA — do NOT include "TOK" or similar; the face pack handles identity)
- No stylistic adjectives like "beautiful", "stunning", "amazing" — they flatten realism
- Use product_name exactly as given — do not rename or paraphrase
- Keep under 900 characters total
- Output prompt text only, no prose, no markdown, no quotes`;

/**
 * Negative guidance for v3 (Kontext Max) pipeline which accepts a structured
 * negative_prompt parameter. v2 (Nano Banana Pro) has the same text merged
 * inline into the user prompt via the system prompt above, since Gemini
 * Image has no separate negative parameter.
 */
export const NEGATIVE_PROMPT =
  "plastic skin, waxy, cgi, 3d render, airbrushed, over-smooth, smooth skin, perfect skin, glossy, artificial, uncanny, distorted anatomy, extra fingers, six fingers, malformed hands, blurry, low quality, jpeg artifacts, watermark, text overlay, logo mismatch, product text distortion";

interface StructuredBrief {
  subject?: string;
  setting?: string;
  pose?: string;
  expression?: string;
  style?: string;
  outfit?: string;
  props?: string;
  notes?: string;
  product_name?: string;
  product_description?: string;
  category?: string;
  [key: string]: unknown;
}

/**
 * Assemble a professional prompt from a structured brief using an LLM.
 * Falls back to simple concatenation if LLM call fails.
 */
export async function assemblePromptWithLLM(
  brief: StructuredBrief
): Promise<{ prompt: string; method: "llm" | "fallback" }> {
  // Build the user message from brief fields
  const briefLines: string[] = [];
  if (brief.subject) briefLines.push(`subject: ${brief.subject}`);
  if (brief.setting) briefLines.push(`setting: ${brief.setting}`);
  if (brief.pose) briefLines.push(`pose: ${brief.pose}`);
  if (brief.expression) briefLines.push(`expression: ${brief.expression}`);
  if (brief.style) briefLines.push(`style: ${brief.style}`);
  if (brief.outfit) briefLines.push(`outfit: ${brief.outfit}`);
  if (brief.product_name)
    briefLines.push(`product_name: ${brief.product_name}`);
  if (brief.product_description)
    briefLines.push(`product_description: ${brief.product_description}`);
  if (brief.props) briefLines.push(`props: ${brief.props}`);
  if (brief.category) briefLines.push(`category: ${brief.category}`);
  if (brief.notes) briefLines.push(`additional_notes: ${brief.notes}`);

  const userMessage = briefLines.join("\n");

  try {
    const response = await chatCompletion({
      model: "google/gemini-flash-1.5",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 300,
    });

    const llmPrompt = response.choices?.[0]?.message?.content?.trim();

    if (llmPrompt && llmPrompt.length > 20) {
      return { prompt: llmPrompt, method: "llm" };
    }

    // LLM returned empty/short — fall back
    return { prompt: buildFallbackPrompt(brief), method: "fallback" };
  } catch (error) {
    console.error("[prompt-assembler] LLM call failed, using fallback:", error);
    return { prompt: buildFallbackPrompt(brief), method: "fallback" };
  }
}

/**
 * Simple string concatenation fallback (used when LLM is unavailable).
 */
function buildFallbackPrompt(brief: StructuredBrief): string {
  const parts: string[] = [];

  if (brief.style) parts.push(`A ${brief.style}`);
  if (brief.setting) parts.push(`${brief.setting}`);
  parts.push(`photo of ${brief.subject ?? "the creator"}`);
  if (brief.pose) parts.push(String(brief.pose).toLowerCase());
  if (brief.expression)
    parts.push(`with a ${brief.expression} expression`);
  if (brief.outfit) parts.push(`wearing ${brief.outfit}`);
  if (brief.product_name)
    parts.push(`, showcasing ${brief.product_name}`);
  if (brief.product_description)
    parts.push(`(${brief.product_description})`);
  if (brief.props) parts.push(String(brief.props));
  if (brief.notes) parts.push(`. ${brief.notes}`);

  parts.push(", professional lighting, 8K, commercial photography");

  return parts.join(" ").replace(/\s{2,}/g, " ") || "portrait photo";
}
