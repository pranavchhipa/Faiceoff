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

const SYSTEM_PROMPT = `You are a world-class AI prompt engineer specialising in commercial product photography and influencer marketing content.

Your job is to take a structured brief and produce a single, highly detailed image-generation prompt that will create stunning, photorealistic marketing content.

RULES:
1. Output ONLY the final prompt — no explanations, no quotes, no markdown
2. The prompt must be a single paragraph, 40-80 words
3. Always include the subject name exactly as given (this is the LoRA trigger word)
4. Use professional photography terminology: lighting styles, lens effects, composition techniques
5. If a product is mentioned, describe the subject naturally interacting with it (holding, wearing, using, showcasing)
6. Include quality markers: "8K", "commercial photography", "sharp focus", "professional lighting"
7. NEVER include negative prompts, NEVER use brackets/parentheses for emphasis
8. Make it feel natural — like a real photoshoot brief from a creative director
9. If product description is given, weave specific product details (color, material, shape) into the scene naturally
10. Always end with technical quality descriptors

EXAMPLE INPUT:
subject: Pranav
setting: Cafe
pose: Sitting
expression: Laughing
style: Photorealistic
outfit: pink tshirt
product_name: boAt Rockerz 450
product_description: Matte black over-ear wireless headphones with red accents

EXAMPLE OUTPUT:
Professional lifestyle photograph of Pranav sitting at a sunlit cafe table, laughing naturally while wearing boAt Rockerz 450 matte black over-ear headphones with red accents around his neck, dressed in a casual pink tshirt, warm golden-hour window light creating soft highlights, shallow depth of field with subject in sharp focus, blurred cafe background with bokeh, commercial product photography, 8K resolution, photorealistic`;

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
