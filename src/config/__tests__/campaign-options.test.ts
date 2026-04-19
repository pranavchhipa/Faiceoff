import { describe, it, expect } from "vitest";
import {
  SETTING_OPTIONS,
  TIME_LIGHTING_OPTIONS,
  MOOD_PALETTE_OPTIONS,
  INTERACTION_OPTIONS,
  POSE_ENERGY_OPTIONS,
  EXPRESSION_OPTIONS,
  OUTFIT_STYLE_OPTIONS,
  CAMERA_FRAMING_OPTIONS,
  ASPECT_RATIO_OPTIONS,
  ALL_PILL_ENUM_KEYS,
  isValidPillValue,
} from "../campaign-options";

describe("campaign-options", () => {
  it("exposes all 9 option groups with key/label pairs", () => {
    expect(SETTING_OPTIONS[0]).toEqual({ key: "home_kitchen", label: "Home kitchen" });
    expect(SETTING_OPTIONS.length).toBe(15);
    expect(TIME_LIGHTING_OPTIONS.length).toBe(9);
    expect(MOOD_PALETTE_OPTIONS.length).toBe(9);
    expect(INTERACTION_OPTIONS.length).toBe(9);
    expect(POSE_ENERGY_OPTIONS.length).toBe(8);
    expect(EXPRESSION_OPTIONS.length).toBe(8);
    expect(OUTFIT_STYLE_OPTIONS.length).toBe(8);
    expect(CAMERA_FRAMING_OPTIONS.length).toBe(8);
    expect(ASPECT_RATIO_OPTIONS.length).toBe(4);
  });

  it("ALL_PILL_ENUM_KEYS includes every key from every group except aspect_ratio", () => {
    expect(ALL_PILL_ENUM_KEYS).toContain("home_kitchen");
    expect(ALL_PILL_ENUM_KEYS).toContain("warm_smile");
    expect(ALL_PILL_ENUM_KEYS).not.toContain("1:1");
  });

  it("isValidPillValue accepts preset keys, custom strings, and null", () => {
    expect(isValidPillValue("home_kitchen")).toBe(true);
    expect(isValidPillValue("custom:rooftop infinity pool")).toBe(true);
    expect(isValidPillValue(null)).toBe(true);
    expect(isValidPillValue("")).toBe(false);
    expect(isValidPillValue("custom:")).toBe(false);
    expect(isValidPillValue("custom:" + "x".repeat(81))).toBe(false);
    expect(isValidPillValue("garbage_value")).toBe(false);
  });
});
