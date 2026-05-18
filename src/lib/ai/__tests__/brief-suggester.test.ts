import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock openrouter-client before importing the unit under test
// ---------------------------------------------------------------------------

vi.mock("@/lib/ai/openrouter-client", () => ({
  chatCompletion: vi.fn(),
}));

vi.mock("@/lib/observability/cost-tracker", () => ({
  trackCost: vi.fn(),
  computeTokenCostMicros: vi.fn(() => 0),
  perCallCostMicros: vi.fn(() => 0),
}));

import { chatCompletion } from "@/lib/ai/openrouter-client";
import { suggestBriefFromProduct, EMPTY_RESULT } from "../brief-suggester";

function chatReply(content: string) {
  return {
    id: "test",
    choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
  };
}

const dummyImage = {
  productImageBytes: new Uint8Array([1, 2, 3, 4]),
  productImageMime: "image/jpeg",
};

describe("suggestBriefFromProduct", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns EMPTY_RESULT when chatCompletion throws", async () => {
    vi.mocked(chatCompletion).mockRejectedValue(new Error("OpenRouter down"));
    const r = await suggestBriefFromProduct(dummyImage);
    expect(r).toEqual(EMPTY_RESULT);
  });

  it("returns EMPTY_RESULT when LLM response has no JSON block", async () => {
    vi.mocked(chatCompletion).mockResolvedValue(
      chatReply("Sorry I can't help with that"),
    );
    const r = await suggestBriefFromProduct(dummyImage);
    expect(r).toEqual(EMPTY_RESULT);
  });

  it("returns EMPTY_RESULT when JSON parse fails", async () => {
    vi.mocked(chatCompletion).mockResolvedValue(
      chatReply("{ this is not valid json }"),
    );
    const r = await suggestBriefFromProduct(dummyImage);
    expect(r).toEqual(EMPTY_RESULT);
  });

  it("parses a clean response into the expected shape", async () => {
    vi.mocked(chatCompletion).mockResolvedValue(
      chatReply(
        JSON.stringify({
          product_category: "beverage",
          suggestions: {
            interaction: ["drinking_eating", "holding"],
            setting: ["cafe", "outdoor_street"],
            pose_energy: ["relaxed"],
            outfit_style: ["casual"],
            time_lighting: ["golden_hour"],
            mood_palette: ["warm_earthy"],
            expression: ["relaxed"],
            camera_framing: ["medium_shot"],
          },
          extracted_pack_text: {
            primary: "Glenfiddich",
            secondary: "12 Year Old — Single Malt",
            fine_print: "Distilled in Scotland",
          },
          label_bbox: { x: 0.2, y: 0.3, w: 0.5, h: 0.2 },
          reasoning: "Bottle with prominent wordmark; whisky vibe",
          confidence: "high",
        }),
      ),
    );

    const r = await suggestBriefFromProduct(dummyImage);
    expect(r.productCategory).toBe("beverage");
    expect(r.extractedPackText.primary).toBe("Glenfiddich");
    expect(r.extractedPackText.secondary).toBe("12 Year Old — Single Malt");
    expect(r.labelBbox).toEqual({ x: 0.2, y: 0.3, w: 0.5, h: 0.2 });
    expect(r.confidence).toBe("high");
  });

  it("DROPS invalid pill keys silently — never returns keys outside whitelist", async () => {
    vi.mocked(chatCompletion).mockResolvedValue(
      chatReply(
        JSON.stringify({
          product_category: "beverage",
          suggestions: {
            interaction: [
              "drinking_eating",           // valid
              "totally_made_up_key",       // invalid → drop
              "holding",                    // valid
            ],
            setting: ["not_a_real_setting"],  // invalid → drop → empty array
          },
          extracted_pack_text: { primary: "", secondary: "", fine_print: "" },
          label_bbox: null,
          confidence: "low",
        }),
      ),
    );

    const r = await suggestBriefFromProduct(dummyImage);
    expect(r.suggestions.interaction).toEqual(["drinking_eating", "holding"]);
    expect(r.suggestions.setting).toEqual([]);
  });

  it("dedupes pill keys", async () => {
    vi.mocked(chatCompletion).mockResolvedValue(
      chatReply(
        JSON.stringify({
          product_category: "beverage",
          suggestions: {
            interaction: ["holding", "holding", "holding"],
          },
          extracted_pack_text: { primary: "", secondary: "", fine_print: "" },
          label_bbox: null,
          confidence: "low",
        }),
      ),
    );
    const r = await suggestBriefFromProduct(dummyImage);
    expect(r.suggestions.interaction).toEqual(["holding"]);
  });

  it("rejects invalid label_bbox (zero / negative dimensions)", async () => {
    vi.mocked(chatCompletion).mockResolvedValue(
      chatReply(
        JSON.stringify({
          product_category: "beverage",
          suggestions: {},
          extracted_pack_text: { primary: "", secondary: "", fine_print: "" },
          label_bbox: { x: 0.2, y: 0.3, w: 0, h: 0.1 },
          confidence: "low",
        }),
      ),
    );
    const r = await suggestBriefFromProduct(dummyImage);
    expect(r.labelBbox).toBeNull();
  });

  it("clamps label_bbox values into the 0..1 range", async () => {
    vi.mocked(chatCompletion).mockResolvedValue(
      chatReply(
        JSON.stringify({
          product_category: "beverage",
          suggestions: {},
          extracted_pack_text: { primary: "", secondary: "", fine_print: "" },
          label_bbox: { x: -0.5, y: 1.5, w: 2, h: 0.5 },
          confidence: "low",
        }),
      ),
    );
    const r = await suggestBriefFromProduct(dummyImage);
    expect(r.labelBbox).toEqual({ x: 0, y: 1, w: 1, h: 0.5 });
  });

  it("falls back to 'low' confidence when the LLM returns an invalid value", async () => {
    vi.mocked(chatCompletion).mockResolvedValue(
      chatReply(
        JSON.stringify({
          product_category: "beverage",
          suggestions: {},
          extracted_pack_text: { primary: "", secondary: "", fine_print: "" },
          label_bbox: null,
          confidence: "extremely-very-high",
        }),
      ),
    );
    const r = await suggestBriefFromProduct(dummyImage);
    expect(r.confidence).toBe("low");
  });
});
