import { chatCompletion } from "./openrouter-client";

/**
 * LLM-powered prompt assembler.
 *
 * Takes the structured brief from the campaign form and produces a
 * professional photography-grade prompt optimised for modern multi-reference
 * image generators (Gemini 3 Pro Image / Flux Kontext Max). Output is
 * provider-agnostic — the same text is consumed by v2 and v3 pipelines.
 *
 * Uses Google's best Gemini model via OpenRouter for maximum prompt
 * craftsmanship. Prompt-assembly is a low-token operation (~300 tokens out),
 * so the Pro-tier cost is pennies per generation and pays for itself in
 * output quality.
 */

/**
 * LLM used for the prompt-assembly step. Overridable via env var for
 * experimentation (e.g., try a newer model without redeploying code).
 * Default: `google/gemini-2.5-pro` — Google's current strongest non-thinking
 * model, ~₹0.20 per prompt assembly.
 */
const PROMPT_LLM_MODEL =
  process.env.PROMPT_ASSEMBLER_MODEL ?? "google/gemini-2.5-pro";

const SYSTEM_PROMPT = `You are a senior commercial photography art director writing prompts for a modern multi-reference photorealistic image generator. The generator takes (a) a person's face reference pack, (b) a brand's product reference photo, and (c) your text prompt, then composes them into one photograph.

Given a structured brief (JSON with product info, scene, composition, aspect_ratio), output ONE prompt string in this exact structure:

"A candid photograph of a person [interaction verb: holding / wearing / using / applying / drinking / eating / showing] [product_name]. [scene_description in one vivid sentence].

Technical: shot on Sony A7IV with 85mm f/1.4 prime, natural window light from camera left, golden hour, shallow depth of field, subsurface scattering on skin, visible pores, 35mm film grain, slight chromatic aberration, unretouched, Kodak Portra 400 color palette.

Composition: [composition_hint from brief]. Aspect: [aspect_ratio from brief].

CRITICAL PRESERVATION RULES:
- Product: match the reference photo pixel-for-pixel — exact shape, colour, label typography, brand mark, every character of on-pack text. Do NOT redesign the packaging, do NOT invent additional branding, do NOT translate or transliterate the brand name. If the pack says "Harpic", the output must say "Harpic" — never "Chanel", "Dove", or any Western lookalike.
- Identity: match the face reference pack exactly — same facial structure, skin tone, hair, age. Do NOT substitute a generic stock-photo face.
- Indian context: product names from Indian brands (Harpic, Dabur, Boat, Patanjali, Amul, MDH, Fogg, Parle, Britannia, etc.) stay as-is in their original English spelling. Devanagari / regional-script text on the pack must be preserved character-for-character.

Avoid: plastic skin, waxy finish, cgi look, 3d render, airbrushing, over-smooth skin, glossy artificial highlights, uncanny eyes, distorted anatomy, extra fingers, malformed hands, blurry focus, jpeg artifacts, watermarks, text overlays, fabricated logos, substituted brand names, Western brand lookalikes replacing the actual product, product text distortion."

Rules for your output:
- No LoRA trigger words (no "TOK", no "<s0>" etc. — the face pack handles identity)
- No stylistic adjectives like "beautiful", "stunning", "amazing", "perfect" — they flatten realism and push the model toward AI-generated look
- Use product_name EXACTLY as given in the brief — character-for-character, including capitalisation
- Keep under 1100 characters total
- Output prompt text only, no prose, no markdown, no quotes, no preamble`;

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
      model: PROMPT_LLM_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      // Low temperature: we want the model to follow the template tightly,
      // not invent creative variations. Creativity lives in the scene
      // description the brand writes; the assembler's job is to wrap it in
      // the anti-AI technical recipe consistently.
      temperature: 0.4,
      // Pro model outputs a bit more narrative than Flash. The template is
      // ~500 tokens rendered; 600 gives headroom without letting the model
      // ramble.
      max_tokens: 600,
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
