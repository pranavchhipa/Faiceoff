import { describe, expect, it } from "vitest";
import {
  AcceptLicenseSchema,
  CreateLicenseRequestSchema,
  CreateListingSchema,
  LISTING_MAX_PRICE_PAISE,
  LISTING_MIN_PRICE_PAISE,
  RejectLicenseSchema,
  UpdateListingSchema,
} from "../types";

describe("CreateListingSchema", () => {
  const valid = {
    template: "creation" as const,
    price_paise: 600000,
    image_quota: 25,
    validity_days: 90,
  };

  it("accepts a valid listing", () => {
    expect(CreateListingSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects template not in enum", () => {
    const res = CreateListingSchema.safeParse({
      ...valid,
      template: "exclusive",
    });
    expect(res.success).toBe(false);
  });

  it("rejects price below floor", () => {
    const res = CreateListingSchema.safeParse({
      ...valid,
      price_paise: LISTING_MIN_PRICE_PAISE - 1,
    });
    expect(res.success).toBe(false);
  });

  it("rejects price above ceiling", () => {
    const res = CreateListingSchema.safeParse({
      ...valid,
      price_paise: LISTING_MAX_PRICE_PAISE + 1,
    });
    expect(res.success).toBe(false);
  });

  it("rejects non-integer price", () => {
    const res = CreateListingSchema.safeParse({
      ...valid,
      price_paise: 600000.5,
    });
    expect(res.success).toBe(false);
  });

  it("rejects quota of 0", () => {
    const res = CreateListingSchema.safeParse({ ...valid, image_quota: 0 });
    expect(res.success).toBe(false);
  });

  it("rejects validity_days > 365", () => {
    const res = CreateListingSchema.safeParse({
      ...valid,
      validity_days: 366,
    });
    expect(res.success).toBe(false);
  });
});

describe("UpdateListingSchema", () => {
  it("accepts a single-field update", () => {
    const res = UpdateListingSchema.safeParse({ price_paise: 700000 });
    expect(res.success).toBe(true);
  });

  it("accepts is_active toggle alone", () => {
    const res = UpdateListingSchema.safeParse({ is_active: false });
    expect(res.success).toBe(true);
  });

  it("rejects empty object", () => {
    const res = UpdateListingSchema.safeParse({});
    expect(res.success).toBe(false);
  });

  it("still applies bounds on provided fields", () => {
    const res = UpdateListingSchema.safeParse({ image_quota: 9999 });
    expect(res.success).toBe(false);
  });
});

describe("CreateLicenseRequestSchema", () => {
  // Zod v4's .uuid() enforces RFC 4122 variant/version bits — use a v4 UUID.
  const VALID_UUID = "b4e0f0e4-1234-4567-89ab-cdef01234567";

  it("accepts minimal body with just listing_id", () => {
    const res = CreateLicenseRequestSchema.safeParse({
      listing_id: VALID_UUID,
    });
    expect(res.success).toBe(true);
  });

  it("accepts brand_notes + reference image URLs", () => {
    const res = CreateLicenseRequestSchema.safeParse({
      listing_id: VALID_UUID,
      brand_notes: "Please match our holiday aesthetic.",
      reference_image_urls: [
        "https://example.com/ref1.jpg",
        "https://example.com/ref2.png",
      ],
    });
    expect(res.success).toBe(true);
  });

  it("rejects non-uuid listing_id", () => {
    const res = CreateLicenseRequestSchema.safeParse({
      listing_id: "not-a-uuid",
    });
    expect(res.success).toBe(false);
  });

  it("rejects >5 reference images", () => {
    const res = CreateLicenseRequestSchema.safeParse({
      listing_id: VALID_UUID,
      reference_image_urls: Array.from(
        { length: 6 },
        (_, i) => `https://example.com/${i}.jpg`,
      ),
    });
    expect(res.success).toBe(false);
  });

  it("rejects brand_notes >1000 chars", () => {
    const res = CreateLicenseRequestSchema.safeParse({
      listing_id: VALID_UUID,
      brand_notes: "x".repeat(1001),
    });
    expect(res.success).toBe(false);
  });
});

describe("AcceptLicenseSchema", () => {
  it("accepts integer scroll_depth", () => {
    expect(
      AcceptLicenseSchema.safeParse({ scroll_depth_percent: 100 }).success,
    ).toBe(true);
  });

  it("rejects >100 scroll_depth", () => {
    expect(
      AcceptLicenseSchema.safeParse({ scroll_depth_percent: 101 }).success,
    ).toBe(false);
  });

  it("rejects negative", () => {
    expect(
      AcceptLicenseSchema.safeParse({ scroll_depth_percent: -1 }).success,
    ).toBe(false);
  });
});

describe("RejectLicenseSchema", () => {
  it("accepts 10-500 char reason", () => {
    expect(
      RejectLicenseSchema.safeParse({
        reason: "This doesn't fit my brand positioning.",
      }).success,
    ).toBe(true);
  });

  it("rejects <10 chars", () => {
    expect(RejectLicenseSchema.safeParse({ reason: "short" }).success).toBe(
      false,
    );
  });

  it("rejects >500 chars", () => {
    expect(
      RejectLicenseSchema.safeParse({ reason: "x".repeat(501) }).success,
    ).toBe(false);
  });
});
