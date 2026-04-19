import { describe, it, expect } from "vitest";
import { StructuredBriefSchema } from "../structured-brief";

// In the test environment NEXT_PUBLIC_SUPABASE_URL is not set, so the
// host allowlist falls back to "accept any https URL with no userinfo and
// default port". These tests exercise that fallback path.

describe("StructuredBriefSchema", () => {
  it("accepts a fully-specified brief with preset enums", () => {
    const result = StructuredBriefSchema.safeParse({
      product_name: "Pourfect Coffee",
      product_image_url: "https://r2.example.com/product.png",
      setting: "home_kitchen",
      time_lighting: "soft_daylight",
      mood_palette: "warm_earthy",
      interaction: "holding",
      pose_energy: "candid",
      expression: "warm_smile",
      outfit_style: "western_casual",
      camera_framing: "half_body",
      aspect_ratio: "1:1",
      custom_notes: "Label must be visible",
    });
    expect(result.success).toBe(true);
  });

  it("accepts custom:<text> overrides per field", () => {
    const result = StructuredBriefSchema.safeParse({
      product_name: "Pourfect Coffee",
      product_image_url: "https://r2.example.com/product.png",
      setting: "custom:rooftop infinity pool at dawn",
      aspect_ratio: "1:1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid preset key", () => {
    const result = StructuredBriefSchema.safeParse({
      product_name: "X",
      product_image_url: "https://r2.example.com/p.png",
      setting: "made_up_setting",
      aspect_ratio: "1:1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty product_name and invalid aspect_ratio", () => {
    expect(
      StructuredBriefSchema.safeParse({
        product_name: "",
        product_image_url: "https://x",
        aspect_ratio: "1:1",
      }).success
    ).toBe(false);
    expect(
      StructuredBriefSchema.safeParse({
        product_name: "X",
        product_image_url: "https://x",
        aspect_ratio: "2:3",
      }).success
    ).toBe(false);
  });

  it("allows pill fields to be omitted (null/undefined)", () => {
    const result = StructuredBriefSchema.safeParse({
      product_name: "X",
      product_image_url: "https://x",
      aspect_ratio: "1:1",
    });
    expect(result.success).toBe(true);
  });

  // --- product_image_url SSRF hardening ---

  it("rejects http:// product_image_url", () => {
    const result = StructuredBriefSchema.safeParse({
      product_name: "X",
      product_image_url: "http://r2.example.com/product.png",
      aspect_ratio: "1:1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects URLs with userinfo (user:pass@host)", () => {
    const result = StructuredBriefSchema.safeParse({
      product_name: "X",
      product_image_url: "https://admin:secret@r2.example.com/product.png",
      aspect_ratio: "1:1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects URLs with non-standard ports", () => {
    const result = StructuredBriefSchema.safeParse({
      product_name: "X",
      product_image_url: "https://r2.example.com:8080/product.png",
      aspect_ratio: "1:1",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid https URL with no userinfo and default port (test fallback mode)", () => {
    const result = StructuredBriefSchema.safeParse({
      product_name: "X",
      product_image_url: "https://anything.supabase.co/storage/v1/object/public/p.png",
      aspect_ratio: "1:1",
    });
    expect(result.success).toBe(true);
  });
});
