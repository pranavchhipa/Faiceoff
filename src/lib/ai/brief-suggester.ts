/**
 * Phase 6a + 6b — vision-call brief suggester.
 *
 * Given an uploaded product image, returns:
 *   - product category (rough classification)
 *   - suggested pill values for interaction/setting/pose/outfit
 *   - extracted pack text (primary brand line + secondary line + fine print)
 *   - optional label bounding box (normalized 0..1) for downstream
 *     composite + OCR validation
 *
 * Uses Gemini 2.5 Flash via OpenRouter (image input as data URL). The model
 * is asked for strict JSON. Invalid pill keys are dropped silently. Failure
 * returns an EMPTY structure (never throws) so the Studio UI just falls
 * back to manual entry.
 */

import { chatCompletion } from "./openrouter-client";
import {
  SETTING_OPTIONS,
  TIME_LIGHTING_OPTIONS,
  MOOD_PALETTE_OPTIONS,
  INTERACTION_OPTIONS,
  POSE_ENERGY_OPTIONS,
  EXPRESSION_OPTIONS,
  OUTFIT_STYLE_OPTIONS,
  CAMERA_FRAMING_OPTIONS,
  type PillOption,
} from "@/config/campaign-options";

const VISION_MODEL = "google/gemini-2.5-flash";

export interface SuggestBriefInput {
  productImageBytes: Uint8Array;
  productImageMime: string;
  /** Optional — only set when there's already a generation row to attribute. */
  generationId?: string | null;
}

export interface SuggestBriefResult {
  productCategory: string;
  suggestions: {
    interaction: string[];
    setting: string[];
    pose_energy: string[];
    outfit_style: string[];
    time_lighting: string[];
    mood_palette: string[];
    expression: string[];
    camera_framing: string[];
  };
  extractedPackText: {
    primary: string;
    secondary: string;
    finePrint: string;
  };
  /**
   * Normalised 0..1 bounding box of the primary product label. Used by
   * Phase 6c (composite) and Phase 6e (OCR crop). Null when the model
   * couldn't isolate a label (e.g. apparel with no flat label face).
   */
  labelBbox: { x: number; y: number; w: number; h: number } | null;
  reasoning: string;
  confidence: "high" | "medium" | "low";
}

const EMPTY_RESULT: SuggestBriefResult = {
  productCategory: "",
  suggestions: {
    interaction: [],
    setting: [],
    pose_energy: [],
    outfit_style: [],
    time_lighting: [],
    mood_palette: [],
    expression: [],
    camera_framing: [],
  },
  extractedPackText: { primary: "", secondary: "", finePrint: "" },
  labelBbox: null,
  reasoning: "",
  confidence: "low",
};

const VALID_KEYS: Record<keyof SuggestBriefResult["suggestions"], Set<string>> = {
  interaction: new Set(INTERACTION_OPTIONS.map((o: PillOption) => o.key)),
  setting: new Set(SETTING_OPTIONS.map((o: PillOption) => o.key)),
  pose_energy: new Set(POSE_ENERGY_OPTIONS.map((o: PillOption) => o.key)),
  outfit_style: new Set(OUTFIT_STYLE_OPTIONS.map((o: PillOption) => o.key)),
  time_lighting: new Set(TIME_LIGHTING_OPTIONS.map((o: PillOption) => o.key)),
  mood_palette: new Set(MOOD_PALETTE_OPTIONS.map((o: PillOption) => o.key)),
  expression: new Set(EXPRESSION_OPTIONS.map((o: PillOption) => o.key)),
  camera_framing: new Set(CAMERA_FRAMING_OPTIONS.map((o: PillOption) => o.key)),
};

function listKeys(field: keyof SuggestBriefResult["suggestions"]): string {
  return Array.from(VALID_KEYS[field]).join(", ");
}

const SYSTEM_PROMPT = `You are a commercial photography art director analyzing a product image to help a brand quickly compose a campaign brief.

Look at the attached product image and return a SINGLE JSON object describing it. No prose, no markdown — just JSON.

Required JSON shape:
{
  "product_category": "string (one of: beverage, food, cosmetic, skincare, supplement, fashion_apparel, sportswear, footwear, accessory, electronics, vehicle, packaged_good, other)",
  "suggestions": {
    "interaction": ["array of 1-3 pill keys from this whitelist: ${listKeys("interaction")}"],
    "setting":     ["array of 1-3 pill keys from this whitelist: ${listKeys("setting")}"],
    "pose_energy": ["array of 1-2 pill keys from this whitelist: ${listKeys("pose_energy")}"],
    "outfit_style":["array of 1-2 pill keys from this whitelist: ${listKeys("outfit_style")}"],
    "time_lighting":["array of 1-2 pill keys from this whitelist: ${listKeys("time_lighting")}"],
    "mood_palette":["array of 1-2 pill keys from this whitelist: ${listKeys("mood_palette")}"],
    "expression":  ["array of 1-2 pill keys from this whitelist: ${listKeys("expression")}"],
    "camera_framing":["array of 1-2 pill keys from this whitelist: ${listKeys("camera_framing")}"]
  },
  "extracted_pack_text": {
    "primary":  "string — main brand name / wordmark exactly as it appears, e.g. 'Glenfiddich'",
    "secondary":"string — variant / tagline / size line, e.g. '12 Year Old — Single Malt — 750 ml'",
    "fine_print":"string — joined ingredients / disclaimers / regulatory text, or empty string"
  },
  "label_bbox": { "x": 0..1, "y": 0..1, "w": 0..1, "h": 0..1 } | null,
  "reasoning": "string — one sentence explaining the category + setting suggestion",
  "confidence": "high" | "medium" | "low"
}

Rules:
- ONLY use keys from the whitelists above. NEVER invent new pill keys.
- If the product has no visible label (e.g. plain apparel), set label_bbox to null and extracted_pack_text fields to empty strings.
- For apparel/accessories, primary is the brand wordmark on the garment if any, else empty.
- label_bbox values are normalised (0..1) relative to the image, with (0,0) at top-left.
- Output strictly valid JSON, no trailing commas, no comments.`;

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function validBbox(raw: unknown):
  | { x: number; y: number; w: number; h: number }
  | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const x = typeof r.x === "number" ? clamp01(r.x) : NaN;
  const y = typeof r.y === "number" ? clamp01(r.y) : NaN;
  const w = typeof r.w === "number" ? clamp01(r.w) : NaN;
  const h = typeof r.h === "number" ? clamp01(r.h) : NaN;
  if ([x, y, w, h].some(Number.isNaN)) return null;
  if (w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

function dedupValidKeys(
  field: keyof SuggestBriefResult["suggestions"],
  values: unknown,
): string[] {
  if (!Array.isArray(values)) return [];
  const allowed = VALID_KEYS[field];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    if (typeof v !== "string") continue;
    if (!allowed.has(v)) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function parseResult(raw: string): SuggestBriefResult {
  // Tolerate markdown fences around the JSON.
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return EMPTY_RESULT;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  } catch {
    return EMPTY_RESULT;
  }

  const suggestions = (parsed.suggestions ?? {}) as Record<string, unknown>;
  const packText = (parsed.extracted_pack_text ?? {}) as Record<string, unknown>;

  return {
    productCategory:
      typeof parsed.product_category === "string" ? parsed.product_category : "",
    suggestions: {
      interaction: dedupValidKeys("interaction", suggestions.interaction),
      setting: dedupValidKeys("setting", suggestions.setting),
      pose_energy: dedupValidKeys("pose_energy", suggestions.pose_energy),
      outfit_style: dedupValidKeys("outfit_style", suggestions.outfit_style),
      time_lighting: dedupValidKeys("time_lighting", suggestions.time_lighting),
      mood_palette: dedupValidKeys("mood_palette", suggestions.mood_palette),
      expression: dedupValidKeys("expression", suggestions.expression),
      camera_framing: dedupValidKeys("camera_framing", suggestions.camera_framing),
    },
    extractedPackText: {
      primary: typeof packText.primary === "string" ? packText.primary : "",
      secondary: typeof packText.secondary === "string" ? packText.secondary : "",
      finePrint:
        typeof packText.fine_print === "string"
          ? packText.fine_print
          : typeof packText.finePrint === "string"
            ? packText.finePrint
            : "",
    },
    labelBbox: validBbox(parsed.label_bbox),
    reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
    confidence:
      parsed.confidence === "high" ||
      parsed.confidence === "medium" ||
      parsed.confidence === "low"
        ? parsed.confidence
        : "low",
  };
}

/**
 * Run the vision-call brief suggester. Never throws — returns EMPTY_RESULT
 * on network/parse failure so the Studio UI can fall back to manual entry.
 */
export async function suggestBriefFromProduct(
  input: SuggestBriefInput,
): Promise<SuggestBriefResult> {
  try {
    const dataUrl = `data:${input.productImageMime};base64,${Buffer.from(
      input.productImageBytes,
    ).toString("base64")}`;

    const response = await chatCompletion({
      model: VISION_MODEL,
      generationId: input.generationId ?? null,
      callType: "brief_suggester",
      temperature: 0.2,
      max_tokens: 1500,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          // OpenAI-compatible vision payload: text + image_url part. The
          // data URL works the same as a public URL for the model.
          content: [
            {
              type: "text",
              text: "Please analyse the product in the following image and return the JSON described in the system message.",
            },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    });

    const text = response.choices?.[0]?.message?.content ?? "";
    return parseResult(text);
  } catch {
    return EMPTY_RESULT;
  }
}

/** Exported for tests. */
export { EMPTY_RESULT };
