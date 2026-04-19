import { describe, it, expect } from "vitest";
import { StructuredBriefSchema } from "../structured-brief";

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
});
