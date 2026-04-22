import { describe, expect, it } from "vitest";
import {
  getLicenseTemplate,
  LICENSE_TEMPLATE_KEYS,
  LICENSE_TEMPLATES,
  templateRequiresIgPost,
} from "../templates";

describe("LICENSE_TEMPLATES", () => {
  it("has creation + creation_promotion", () => {
    expect(LICENSE_TEMPLATE_KEYS).toEqual(["creation", "creation_promotion"]);
  });

  it("creation defaults: ₹6,000 / 25 / 90 days / no IG post", () => {
    expect(LICENSE_TEMPLATES.creation).toMatchObject({
      default_price_paise: 600000,
      default_image_quota: 25,
      default_validity_days: 90,
      ig_post_required: false,
    });
  });

  it("creation_promotion defaults: ₹15,000 / 10 / 30 days / IG required", () => {
    expect(LICENSE_TEMPLATES.creation_promotion).toMatchObject({
      default_price_paise: 1500000,
      default_image_quota: 10,
      default_validity_days: 30,
      ig_post_required: true,
    });
  });
});

describe("getLicenseTemplate", () => {
  it("returns the template for a known key", () => {
    expect(getLicenseTemplate("creation")).toBe(LICENSE_TEMPLATES.creation);
  });

  it("returns undefined for unknown input", () => {
    expect(getLicenseTemplate("bogus")).toBeUndefined();
  });
});

describe("templateRequiresIgPost", () => {
  it("false for creation", () => {
    expect(templateRequiresIgPost("creation")).toBe(false);
  });

  it("true for creation_promotion", () => {
    expect(templateRequiresIgPost("creation_promotion")).toBe(true);
  });
});
