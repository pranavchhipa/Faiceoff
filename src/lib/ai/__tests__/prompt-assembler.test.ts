import { describe, it, expect } from "vitest";
import { briefToAssemblerLines } from "../prompt-assembler";

describe("briefToAssemblerLines", () => {
  it("maps preset enum keys to human labels", () => {
    const lines = briefToAssemblerLines({
      product_name: "Pourfect Coffee",
      product_image_url: "https://x",
      setting: "home_kitchen",
      mood_palette: "warm_earthy",
      aspect_ratio: "1:1",
    });
    expect(lines).toContain("setting: Home kitchen");
    expect(lines).toContain("mood_palette: Warm earthy");
    expect(lines).toContain("product_name: Pourfect Coffee");
    expect(lines).toContain("aspect_ratio: 1:1");
  });

  it("forwards custom: values verbatim without prefix", () => {
    const lines = briefToAssemblerLines({
      product_name: "X",
      product_image_url: "https://x",
      setting: "custom:rooftop infinity pool at dawn",
      aspect_ratio: "1:1",
    });
    expect(lines).toContain("setting: rooftop infinity pool at dawn");
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

  it("includes custom_notes when present", () => {
    const lines = briefToAssemblerLines({
      product_name: "X",
      product_image_url: "https://x",
      aspect_ratio: "1:1",
      custom_notes: "No sunglasses",
    });
    expect(lines).toContain("custom_notes: No sunglasses");
  });
});
