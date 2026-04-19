import { describe, it, expect } from "vitest";
import { briefToAssemblerLines } from "../prompt-assembler";

describe("briefToAssemblerLines", () => {
  it("maps preset enum keys to human labels (no USER_INPUT delimiter for presets)", () => {
    const lines = briefToAssemblerLines({
      product_name: "Pourfect Coffee",
      product_image_url: "https://x",
      setting: "home_kitchen",
      mood_palette: "warm_earthy",
      aspect_ratio: "1:1",
    });
    // product_name is user text — wrapped in delimiter
    expect(lines.find((l) => l.startsWith("product_name:"))).toContain("[USER_INPUT: <<< Pourfect Coffee >>>]");
    // preset values are trusted — human label, no delimiter
    expect(lines).toContain("setting: Home kitchen");
    expect(lines).toContain("mood_palette: Warm earthy");
    // aspect_ratio is trusted
    expect(lines).toContain("aspect_ratio: 1:1");
  });

  it("wraps custom: values in USER_INPUT delimiter", () => {
    const lines = briefToAssemblerLines({
      product_name: "X",
      product_image_url: "https://x",
      setting: "custom:rooftop infinity pool at dawn",
      aspect_ratio: "1:1",
    });
    expect(lines.find((l) => l.startsWith("setting:"))).toContain("[USER_INPUT: <<< rooftop infinity pool at dawn >>>]");
  });

  it("omits null or undefined pill fields", () => {
    const lines = briefToAssemblerLines({
      product_name: "X",
      product_image_url: "https://x",
      setting: null,
      aspect_ratio: "1:1",
    });
    expect(lines.find((l) => l.startsWith("setting:"))).toBeUndefined();
  });

  it("wraps custom_notes in USER_INPUT delimiter", () => {
    const lines = briefToAssemblerLines({
      product_name: "X",
      product_image_url: "https://x",
      aspect_ratio: "1:1",
      custom_notes: "No sunglasses",
    });
    expect(lines.find((l) => l.startsWith("custom_notes:"))).toContain("[USER_INPUT: <<< No sunglasses >>>]");
  });
});
