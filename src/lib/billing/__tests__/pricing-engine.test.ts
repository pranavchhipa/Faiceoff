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

  it("has correct commission rate (20%)", () => {
    expect(PLATFORM_COMMISSION_RATE).toBe(0.2);
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
    // commission = round(10000 * 0.20) = 2000
    // gst = round(2000 * 0.18) = 360
    // creator_share = 10000 - 2000 = 8000
    // total = 8000 + 2000 + 360 = 10360
    expect(r.breakdown.base).toBe(10000);
    expect(r.breakdown.scope_addon).toBe(0);
    expect(r.breakdown.effective_rate).toBe(10000);
    expect(r.breakdown.exclusivity_premium).toBe(0);
    expect(r.breakdown.total_rate).toBe(10000);
    expect(r.breakdown.commission).toBe(2000);
    expect(r.breakdown.gst).toBe(360);
    expect(r.creator_share_paise).toBe(8000);
    expect(r.platform_share_paise).toBe(2000);
    expect(r.gst_owed_paise).toBe(360);
    expect(r.total_paise).toBe(10360);
  });

  it("digital_print, non-exclusive", () => {
    const r = computeRate({ creatorRatePaise: RATE, scope: "digital_print", isExclusive: false });
    // effective_rate = 10000 + 50000 = 60000
    // commission = round(60000 * 0.20) = 12000
    // gst = round(12000 * 0.18) = 2160
    // creator_share = 60000 - 12000 = 48000
    // total = 48000 + 12000 + 2160 = 62160
    expect(r.breakdown.scope_addon).toBe(50000);
    expect(r.breakdown.effective_rate).toBe(60000);
    expect(r.breakdown.commission).toBe(12000);
    expect(r.breakdown.gst).toBe(2160);
    expect(r.creator_share_paise).toBe(48000);
    expect(r.total_paise).toBe(62160);
  });

  it("digital_print_packaging, non-exclusive", () => {
    const r = computeRate({ creatorRatePaise: RATE, scope: "digital_print_packaging", isExclusive: false });
    // effective_rate = 10000 + 100000 = 110000
    // commission = round(110000 * 0.20) = 22000
    // gst = round(22000 * 0.18) = 3960
    // creator_share = 110000 - 22000 = 88000
    // total = 88000 + 22000 + 3960 = 113960
    expect(r.breakdown.scope_addon).toBe(100000);
    expect(r.breakdown.effective_rate).toBe(110000);
    expect(r.breakdown.commission).toBe(22000);
    expect(r.breakdown.gst).toBe(3960);
    expect(r.creator_share_paise).toBe(88000);
    expect(r.total_paise).toBe(113960);
  });

  it("digital, exclusive — +50% on effective_rate", () => {
    const r = computeRate({ creatorRatePaise: RATE, scope: "digital", isExclusive: true });
    // effective_rate = 10000
    // exclusivity = round(10000 * 0.50) = 5000
    // total_rate = 15000
    // commission = round(10000 * 0.20) = 2000
    // gst = round(2000 * 0.18) = 360
    // creator_share = 15000 - 2000 = 13000
    // total = 13000 + 2000 + 360 = 15360
    expect(r.breakdown.exclusivity_premium).toBe(5000);
    expect(r.breakdown.total_rate).toBe(15000);
    expect(r.breakdown.commission).toBe(2000);
    expect(r.creator_share_paise).toBe(13000);
    expect(r.total_paise).toBe(15360);
  });

  it("digital_print_packaging, exclusive", () => {
    const r = computeRate({ creatorRatePaise: RATE, scope: "digital_print_packaging", isExclusive: true });
    // effective_rate = 10000 + 100000 = 110000
    // exclusivity = round(110000 * 0.50) = 55000
    // total_rate = 165000
    // commission = round(110000 * 0.20) = 22000
    // gst = round(22000 * 0.18) = 3960
    // creator_share = 165000 - 22000 = 143000
    // total = 143000 + 22000 + 3960 = 168960
    expect(r.breakdown.exclusivity_premium).toBe(55000);
    expect(r.breakdown.total_rate).toBe(165000);
    expect(r.creator_share_paise).toBe(143000);
    expect(r.total_paise).toBe(168960);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Worked examples — ₹500/gen (50000 paise)
// ─────────────────────────────────────────────────────────────────────────────

describe("computeRate — ₹500 per generation", () => {
  const RATE = 50000; // ₹500

  it("digital, non-exclusive", () => {
    const r = computeRate({ creatorRatePaise: RATE, scope: "digital", isExclusive: false });
    // commission = round(50000 * 0.20) = 10000
    // gst = round(10000 * 0.18) = 1800
    // creator_share = 50000 - 10000 = 40000
    // total = 40000 + 10000 + 1800 = 51800
    expect(r.breakdown.commission).toBe(10000);
    expect(r.breakdown.gst).toBe(1800);
    expect(r.creator_share_paise).toBe(40000);
    expect(r.total_paise).toBe(51800);
  });

  it("digital_print, exclusive", () => {
    const r = computeRate({ creatorRatePaise: RATE, scope: "digital_print", isExclusive: true });
    // effective_rate = 50000 + 50000 = 100000
    // exclusivity = round(100000 * 0.50) = 50000
    // total_rate = 150000
    // commission = round(100000 * 0.20) = 20000
    // gst = round(20000 * 0.18) = 3600
    // creator_share = 150000 - 20000 = 130000
    // total = 130000 + 20000 + 3600 = 153600
    expect(r.breakdown.effective_rate).toBe(100000);
    expect(r.breakdown.exclusivity_premium).toBe(50000);
    expect(r.breakdown.total_rate).toBe(150000);
    expect(r.breakdown.commission).toBe(20000);
    expect(r.creator_share_paise).toBe(130000);
    expect(r.total_paise).toBe(153600);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Worked examples — ₹1000/gen (100000 paise)
// ─────────────────────────────────────────────────────────────────────────────

describe("computeRate — ₹1000 per generation", () => {
  const RATE = 100000; // ₹1000

  it("digital, non-exclusive", () => {
    const r = computeRate({ creatorRatePaise: RATE, scope: "digital", isExclusive: false });
    // commission = round(100000 * 0.20) = 20000
    // gst = round(20000 * 0.18) = 3600
    // creator_share = 100000 - 20000 = 80000
    // total = 80000 + 20000 + 3600 = 103600
    expect(r.breakdown.commission).toBe(20000);
    expect(r.breakdown.gst).toBe(3600);
    expect(r.creator_share_paise).toBe(80000);
    expect(r.total_paise).toBe(103600);
  });

  it("digital_print_packaging, exclusive", () => {
    const r = computeRate({ creatorRatePaise: RATE, scope: "digital_print_packaging", isExclusive: true });
    // effective_rate = 100000 + 100000 = 200000
    // exclusivity = round(200000 * 0.50) = 100000
    // total_rate = 300000
    // commission = round(200000 * 0.20) = 40000
    // gst = round(40000 * 0.18) = 7200
    // creator_share = 300000 - 40000 = 260000
    // total = 260000 + 40000 + 7200 = 307200
    expect(r.breakdown.effective_rate).toBe(200000);
    expect(r.breakdown.exclusivity_premium).toBe(100000);
    expect(r.breakdown.total_rate).toBe(300000);
    expect(r.breakdown.commission).toBe(40000);
    expect(r.creator_share_paise).toBe(260000);
    expect(r.total_paise).toBe(307200);
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
    // commission = round(50000 * 0.20) = 10000
    // gst = round(10000 * 0.18) = 1800
    // creator_share = 50000 - 10000 = 40000
    // total = 40000 + 10000 + 1800 = 51800
    expect(r.breakdown.effective_rate).toBe(50000);
    expect(r.creator_share_paise).toBe(40000);
    expect(r.total_paise).toBe(51800);
  });

  it("breakdown.total matches total_paise", () => {
    const r = computeRate({ creatorRatePaise: 77777, scope: "digital_print", isExclusive: true });
    expect(r.breakdown.total).toBe(r.total_paise);
  });
});
