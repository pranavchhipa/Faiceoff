/**
 * Unit tests for pure TDS / fee math helpers in payout-service.
 *
 * These functions have no dependencies and run synchronously, so no mocking
 * is required.
 */

import { describe, it, expect } from "vitest";
import {
  computeTDS,
  computeProcessingFee,
  computeNet,
  getMinPayoutPaise,
} from "../payout-service";

describe("computeTDS", () => {
  it("returns 1% of 100000 paise (₹1000) → 1000 paise", () => {
    expect(computeTDS(100_000)).toBe(1_000);
  });

  it("returns 1% of 50000 paise (₹500) → 500 paise", () => {
    expect(computeTDS(50_000)).toBe(500);
  });

  it("rounds fractional paise correctly (e.g. 33333 → 333)", () => {
    // 33333 * 0.01 = 333.33 → rounds to 333
    expect(computeTDS(33_333)).toBe(333);
  });

  it("rounds 0.5 up (e.g. 50050 → 501)", () => {
    // 50050 * 0.01 = 500.5 → Math.round → 501
    expect(computeTDS(50_050)).toBe(501);
  });

  it("returns 0 for 0 paise input", () => {
    expect(computeTDS(0)).toBe(0);
  });

  it("handles large amounts correctly (₹10,00,000 → ₹10,000 TDS)", () => {
    expect(computeTDS(100_000_000)).toBe(1_000_000);
  });
});

describe("computeProcessingFee", () => {
  it("always returns 2500 (₹25 flat)", () => {
    expect(computeProcessingFee()).toBe(2500);
  });

  it("returns the same value on repeated calls", () => {
    expect(computeProcessingFee()).toBe(computeProcessingFee());
  });
});

describe("computeNet", () => {
  it("subtracts TDS and fee from gross correctly", () => {
    // ₹1000 gross - ₹10 TDS - ₹25 fee = ₹965
    expect(computeNet({ gross: 100_000, tds: 1_000, fee: 2_500 })).toBe(96_500);
  });

  it("returns 0 when tds + fee exactly equals gross", () => {
    expect(computeNet({ gross: 3_500, tds: 1_000, fee: 2_500 })).toBe(0);
  });

  it("can produce negative net (caller must validate)", () => {
    // We intentionally do NOT clamp — validation is the caller's responsibility.
    expect(computeNet({ gross: 2_000, tds: 0, fee: 2_500 })).toBe(-500);
  });

  it("handles zero deductions", () => {
    expect(computeNet({ gross: 50_000, tds: 0, fee: 0 })).toBe(50_000);
  });
});

describe("getMinPayoutPaise", () => {
  it("returns 50000 (₹500)", () => {
    expect(getMinPayoutPaise()).toBe(50_000);
  });
});

describe("end-to-end deduction chain (₹500 withdrawal)", () => {
  it("₹500 gross → TDS 500, fee 2500, net 47000", () => {
    const gross = 50_000;
    const tds = computeTDS(gross);
    const fee = computeProcessingFee();
    const net = computeNet({ gross, tds, fee });

    expect(tds).toBe(500);
    expect(fee).toBe(2_500);
    expect(net).toBe(47_000);
  });

  it("₹1000 gross → TDS 1000, fee 2500, net 96500", () => {
    const gross = 100_000;
    const tds = computeTDS(gross);
    const fee = computeProcessingFee();
    const net = computeNet({ gross, tds, fee });

    expect(tds).toBe(1_000);
    expect(fee).toBe(2_500);
    expect(net).toBe(96_500);
  });
});
