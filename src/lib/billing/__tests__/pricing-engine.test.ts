// ─────────────────────────────────────────────────────────────────────────────
// pricing-engine.test.ts — pure function tests, no mocking required.
//
// Tests the computeRate function across combinations of:
//   - scope (digital / digital_print / digital_print_packaging)
//   - exclusivity (true / false)
//   - creator rates (₹100, ₹500, ₹1000 per generation)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from "vitest";

import {
  EXCLUSIVITY_RATE,
  GST_ON_COMMISSION_RATE,
  PLATFORM_COMMISSION_RATE,
  SCOPE_ADDONS_PAISE,
  computeRate,
} from "../pricing-engine";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

describe("pricing-engine — constants", () => {
  it("has correct scope addons in paise", () => {
    expect(SCOPE_ADDONS_PAISE.digital).toBe(0);
    expect(SCOPE_ADDONS_PAISE.digital_print).toBe(50000);          // ₹500
    expect(SCOPE_ADDONS_PAISE.digital_print_packaging).toBe(100000); // ₹1000
  });

  it("has correct commission rate (25%)", () => {
    expect(PLATFORM_COMMISSION_RATE).toBe(0.25);
  });

  it("has correct GST rate on commission (18%)", () => {
    expect(GST_ON_COMMISSION_RATE).toBe(0.18);
  });

  it("has correct exclusivity rate (50%)", () => {
    expect(EXCLUSIVITY_RATE).toBe(0.5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Invariants that must hold for all combinations
// ─────────────────────────────────────────────────────────────────────────────

describe("computeRate — invariants", () => {
  const rates = [10000, 50000, 100000]; // ₹100, ₹500, ₹1000
  const scopes = ["digital", "digital_print", "digital_print_packaging"] as const;

  for (const rate of rates) {
    for (const scope of scopes) {
      for (const isExclusive of [false, true]) {
        const label = `rate=₹${rate / 100}, scope=${scope}, exclusive=${isExclusive}`;

        it(`total = creator_share + platform_share + gst [${label}]`, () => {
          const r = computeRate({ creatorRatePaise: rate, scope, isExclusive });
          expect(r.total_paise).toBe(
            r.creator_share_paise + r.platform_share_paise + r.gst_owed_paise,
          );
        });

        it(`creator_share + platform_share = total_rate [${label}]`, () => {
          const r = computeRate({ creatorRatePaise: rate, scope, isExclusive });
          expect(r.creator_share_paise + r.platform_share_paise).toBe(
            r.breakdown.total_rate,
          );
        });

        it(`creator_share_paise > 0 [${label}]`, () => {
          const r = computeRate({ creatorRatePaise: rate, scope, isExclusive });
          expect(r.creator_share_paise).toBeGreaterThan(0);
        });
      }
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Worked examples — ₹100/gen (10000 paise)
// ─────────────────────────────────────────────────────────────────────────────

describe("computeRate — ₹100 per generation", () => {
  const RATE = 10000; // ₹100

  it("digital, non-exclusive", () => {
    const r = computeRate({ creatorRatePaise: RATE, scope: "digital", isExclusive: false });
    // effective_rate = 10000 + 0 = 10000
    // exclusivity = 0
    // total_rate = 10000
    // commission = round(10000 * 0.25) = 2500
    // gst = round(2500 * 0.18) = 450
    // creator_share = 10000 - 2500 = 7500
    // total = 7500 + 2500 + 450 = 10450
    expect(r.breakdown.base).toBe(10000);
    expect(r.breakdown.scope_addon).toBe(0);
    expect(r.breakdown.effective_rate).toBe(10000);
    expect(r.breakdown.exclusivity_premium).toBe(0);
    expect(r.breakdown.total_rate).toBe(10000);
    expect(r.breakdown.commission).toBe(2500);
    expect(r.breakdown.gst).toBe(450);
    expect(r.creator_share_paise).toBe(7500);
    expect(r.platform_share_paise).toBe(2500);
    expect(r.gst_owed_paise).toBe(450);
    expect(r.total_paise).toBe(10450);
  });

  it("digital_print, non-exclusive", () => {
    const r = computeRate({ creatorRatePaise: RATE, scope: "digital_print", isExclusive: false });
    // effective_rate = 10000 + 50000 = 60000
    // commission = round(60000 * 0.25) = 15000
    // gst = round(15000 * 0.18) = 2700
    // creator_share = 60000 - 15000 = 45000
    // total = 45000 + 15000 + 2700 = 62700
    expect(r.breakdown.scope_addon).toBe(50000);
    expect(r.breakdown.effective_rate).toBe(60000);
    expect(r.breakdown.commission).toBe(15000);
    expect(r.breakdown.gst).toBe(2700);
    expect(r.creator_share_paise).toBe(45000);
    expect(r.total_paise).toBe(62700);
  });

  it("digital_print_packaging, non-exclusive", () => {
    const r = computeRate({ creatorRatePaise: RATE, scope: "digital_print_packaging", isExclusive: false });
    // effective_rate = 10000 + 100000 = 110000
    // commission = round(110000 * 0.25) = 27500
    // gst = round(27500 * 0.18) = 4950
    // creator_share = 110000 - 27500 = 82500
    // total = 82500 + 27500 + 4950 = 114950
    expect(r.breakdown.scope_addon).toBe(100000);
    expect(r.breakdown.effective_rate).toBe(110000);
    expect(r.breakdown.commission).toBe(27500);
    expect(r.breakdown.gst).toBe(4950);
    expect(r.creator_share_paise).toBe(82500);
    expect(r.total_paise).toBe(114950);
  });

  it("digital, exclusive — +50% on effective_rate", () => {
    const r = computeRate({ creatorRatePaise: RATE, scope: "digital", isExclusive: true });
    // effective_rate = 10000
    // exclusivity = round(10000 * 0.50) = 5000
    // total_rate = 15000
    // commission = round(10000 * 0.25) = 2500
    // gst = round(2500 * 0.18) = 450
    // creator_share = 15000 - 2500 = 12500
    // total = 12500 + 2500 + 450 = 15450
    expect(r.breakdown.exclusivity_premium).toBe(5000);
    expect(r.breakdown.total_rate).toBe(15000);
    expect(r.breakdown.commission).toBe(2500);
    expect(r.creator_share_paise).toBe(12500);
    expect(r.total_paise).toBe(15450);
  });

  it("digital_print_packaging, exclusive", () => {
    const r = computeRate({ creatorRatePaise: RATE, scope: "digital_print_packaging", isExclusive: true });
    // effective_rate = 10000 + 100000 = 110000
    // exclusivity = round(110000 * 0.50) = 55000
    // total_rate = 165000
    // commission = round(110000 * 0.25) = 27500
    // gst = round(27500 * 0.18) = 4950
    // creator_share = 165000 - 27500 = 137500
    // total = 137500 + 27500 + 4950 = 169950
    expect(r.breakdown.exclusivity_premium).toBe(55000);
    expect(r.breakdown.total_rate).toBe(165000);
    expect(r.creator_share_paise).toBe(137500);
    expect(r.total_paise).toBe(169950);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Worked examples — ₹500/gen (50000 paise)
// ─────────────────────────────────────────────────────────────────────────────

describe("computeRate — ₹500 per generation", () => {
  const RATE = 50000; // ₹500

  it("digital, non-exclusive", () => {
    const r = computeRate({ creatorRatePaise: RATE, scope: "digital", isExclusive: false });
    // commission = round(50000 * 0.25) = 12500
    // gst = round(12500 * 0.18) = 2250
    // creator_share = 50000 - 12500 = 37500
    // total = 37500 + 12500 + 2250 = 52250
    expect(r.breakdown.commission).toBe(12500);
    expect(r.breakdown.gst).toBe(2250);
    expect(r.creator_share_paise).toBe(37500);
    expect(r.total_paise).toBe(52250);
  });

  it("digital_print, exclusive", () => {
    const r = computeRate({ creatorRatePaise: RATE, scope: "digital_print", isExclusive: true });
    // effective_rate = 50000 + 50000 = 100000
    // exclusivity = round(100000 * 0.50) = 50000
    // total_rate = 150000
    // commission = round(100000 * 0.25) = 25000
    // gst = round(25000 * 0.18) = 4500
    // creator_share = 150000 - 25000 = 125000
    // total = 125000 + 25000 + 4500 = 154500
    expect(r.breakdown.effective_rate).toBe(100000);
    expect(r.breakdown.exclusivity_premium).toBe(50000);
    expect(r.breakdown.total_rate).toBe(150000);
    expect(r.breakdown.commission).toBe(25000);
    expect(r.creator_share_paise).toBe(125000);
    expect(r.total_paise).toBe(154500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Worked examples — ₹1000/gen (100000 paise)
// ─────────────────────────────────────────────────────────────────────────────

describe("computeRate — ₹1000 per generation", () => {
  const RATE = 100000; // ₹1000

  it("digital, non-exclusive", () => {
    const r = computeRate({ creatorRatePaise: RATE, scope: "digital", isExclusive: false });
    // commission = round(100000 * 0.25) = 25000
    // gst = round(25000 * 0.18) = 4500
    // creator_share = 100000 - 25000 = 75000
    // total = 75000 + 25000 + 4500 = 104500
    expect(r.breakdown.commission).toBe(25000);
    expect(r.breakdown.gst).toBe(4500);
    expect(r.creator_share_paise).toBe(75000);
    expect(r.total_paise).toBe(104500);
  });

  it("digital_print_packaging, exclusive", () => {
    const r = computeRate({ creatorRatePaise: RATE, scope: "digital_print_packaging", isExclusive: true });
    // effective_rate = 100000 + 100000 = 200000
    // exclusivity = round(200000 * 0.50) = 100000
    // total_rate = 300000
    // commission = round(200000 * 0.25) = 50000
    // gst = round(50000 * 0.18) = 9000
    // creator_share = 300000 - 50000 = 250000
    // total = 250000 + 50000 + 9000 = 309000
    expect(r.breakdown.effective_rate).toBe(200000);
    expect(r.breakdown.exclusivity_premium).toBe(100000);
    expect(r.breakdown.total_rate).toBe(300000);
    expect(r.breakdown.commission).toBe(50000);
    expect(r.creator_share_paise).toBe(250000);
    expect(r.total_paise).toBe(309000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe("computeRate — edge cases", () => {
  it("throws for negative creatorRatePaise", () => {
    expect(() =>
      computeRate({ creatorRatePaise: -1, scope: "digital", isExclusive: false }),
    ).toThrow();
  });

  it("throws for non-integer creatorRatePaise", () => {
    expect(() =>
      computeRate({ creatorRatePaise: 100.5, scope: "digital", isExclusive: false }),
    ).toThrow();
  });

  it("zero rate, digital, non-exclusive — all zeros", () => {
    const r = computeRate({ creatorRatePaise: 0, scope: "digital", isExclusive: false });
    expect(r.creator_share_paise).toBe(0);
    expect(r.platform_share_paise).toBe(0);
    expect(r.gst_owed_paise).toBe(0);
    expect(r.total_paise).toBe(0);
  });

  it("zero rate, digital_print — only scope addon cost", () => {
    const r = computeRate({ creatorRatePaise: 0, scope: "digital_print", isExclusive: false });
    // effective_rate = 0 + 50000 = 50000
    // commission = round(50000 * 0.25) = 12500
    // gst = round(12500 * 0.18) = 2250
    // creator_share = 50000 - 12500 = 37500
    // total = 37500 + 12500 + 2250 = 52250
    expect(r.breakdown.effective_rate).toBe(50000);
    expect(r.creator_share_paise).toBe(37500);
    expect(r.total_paise).toBe(52250);
  });

  it("breakdown.total matches total_paise", () => {
    const r = computeRate({ creatorRatePaise: 77777, scope: "digital_print", isExclusive: true });
    expect(r.breakdown.total).toBe(r.total_paise);
  });
});
