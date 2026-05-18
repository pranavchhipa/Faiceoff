import { describe, it, expect } from "vitest";
import {
  levenshtein,
  normalizedEditDistance,
  shouldTriggerStage2,
  OCR_CONSTANTS,
} from "../ocr-client";

// ---------------------------------------------------------------------------
// Levenshtein
// ---------------------------------------------------------------------------

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("abc", "abc")).toBe(0);
    expect(levenshtein("", "")).toBe(0);
  });

  it("returns length of the other when one side is empty", () => {
    expect(levenshtein("abc", "")).toBe(3);
    expect(levenshtein("", "xyz")).toBe(3);
  });

  it("computes a single substitution", () => {
    expect(levenshtein("abc", "abd")).toBe(1);
  });

  it("computes a single insertion / deletion", () => {
    expect(levenshtein("abc", "abcd")).toBe(1);
    expect(levenshtein("abcd", "abc")).toBe(1);
  });

  it("matches the classic kitten/sitting example (distance = 3)", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// normalizedEditDistance
// ---------------------------------------------------------------------------

describe("normalizedEditDistance", () => {
  it("returns 0 for identical strings (case + whitespace independent)", () => {
    expect(normalizedEditDistance("Glenfiddich 12", "glenfiddich  12  ")).toBe(0);
    expect(normalizedEditDistance("Hello World", "  hello   world")).toBe(0);
  });

  it("returns ~1 for completely different strings", () => {
    expect(normalizedEditDistance("abc", "xyz")).toBeCloseTo(1, 5);
  });

  it("returns 0 when both sides are empty / whitespace only", () => {
    expect(normalizedEditDistance("", "")).toBe(0);
    expect(normalizedEditDistance("  ", "\t \n")).toBe(0);
  });

  it("normalizes a single-character typo to a small fraction", () => {
    const d = normalizedEditDistance("Glenfiddich", "Glenfidich");
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(0.15);
  });

  it("Budweiser → Buddwiser is below the 0.3 stage 2 trigger threshold", () => {
    // 1 substitution out of 9 → ~0.11 — should NOT trigger stage 2.
    const d = normalizedEditDistance("Budweiser", "Buddwiser");
    expect(d).toBeLessThan(OCR_CONSTANTS.STAGE2_DRIFT_THRESHOLD);
  });

  it("'Coca-Cola' → 'Coal Coda' is above the trigger threshold (drift > 0.3)", () => {
    const d = normalizedEditDistance("Coca-Cola", "Coal Coda");
    expect(d).toBeGreaterThan(OCR_CONSTANTS.STAGE2_DRIFT_THRESHOLD);
  });
});

// ---------------------------------------------------------------------------
// shouldTriggerStage2
// ---------------------------------------------------------------------------

describe("shouldTriggerStage2", () => {
  it("triggers manual when high_detail_mode is true (ignores other inputs)", () => {
    const r = shouldTriggerStage2({
      highDetailMode: true,
      ocrDrift: 0.0,
      packTextLength: 0,
    });
    expect(r).toEqual({ trigger: true, reason: "manual" });
  });

  it("triggers ocr_fail when drift > 0.3 and manual is off", () => {
    const r = shouldTriggerStage2({
      highDetailMode: false,
      ocrDrift: 0.35,
      packTextLength: 10,
    });
    expect(r).toEqual({ trigger: true, reason: "ocr_fail" });
  });

  it("does NOT trigger when drift is below threshold", () => {
    const r = shouldTriggerStage2({
      highDetailMode: false,
      ocrDrift: 0.2,
      packTextLength: 10,
    });
    expect(r).toEqual({ trigger: false, reason: "skipped" });
  });

  it("triggers dense_label proactively when pack_text > 50 chars", () => {
    const r = shouldTriggerStage2({
      highDetailMode: false,
      ocrDrift: null,
      packTextLength: 80,
    });
    expect(r).toEqual({ trigger: true, reason: "dense_label" });
  });

  it("manual outranks ocr_fail outranks dense_label (precedence check)", () => {
    expect(
      shouldTriggerStage2({
        highDetailMode: true,
        ocrDrift: 0.9,
        packTextLength: 200,
      }).reason,
    ).toBe("manual");
    expect(
      shouldTriggerStage2({
        highDetailMode: false,
        ocrDrift: 0.9,
        packTextLength: 200,
      }).reason,
    ).toBe("ocr_fail");
    expect(
      shouldTriggerStage2({
        highDetailMode: false,
        ocrDrift: 0.1,
        packTextLength: 200,
      }).reason,
    ).toBe("dense_label");
  });

  it("skips when nothing fires (small clean label, ocrDrift unknown)", () => {
    const r = shouldTriggerStage2({
      highDetailMode: false,
      ocrDrift: null,
      packTextLength: 20,
    });
    expect(r).toEqual({ trigger: false, reason: "skipped" });
  });
});
