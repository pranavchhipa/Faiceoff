import { describe, expect, it } from "vitest";

import {
  COMMISSION_RATE,
  GST_RATE,
  TCS_RATE,
  TDS_RATE,
  calculateFinalImageRelease,
  calculateLicenseCheckout,
  calculateRefundOnExpiry,
  calculateWithdrawalDeductions,
} from "../math";

// ─────────────────────────────────────────────────────────────────────────────
// Constants sanity
// ─────────────────────────────────────────────────────────────────────────────

describe("ledger math — constants", () => {
  it("uses the tax rates locked in Chunk C decision log", () => {
    expect(COMMISSION_RATE).toBe(0.18);
    expect(GST_RATE).toBe(0.18);
    expect(TCS_RATE).toBe(0.01);
    expect(TDS_RATE).toBe(0.01);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calculateLicenseCheckout — worked example is the golden case
// ─────────────────────────────────────────────────────────────────────────────

describe("calculateLicenseCheckout", () => {
  it("calculates Priya's Creation License (spec §4.5 worked example)", () => {
    // Priya lists ₹6,000 / 25 images / 90 days.
    const result = calculateLicenseCheckout(600000, 25);
    expect(result).toEqual({
      base_paise: 600000,
      commission_paise: 108000, // 18% × ₹6,000
      gst_on_commission_paise: 19440, // 18% × ₹1,080
      total_paise: 727440, // ₹7,274.40 — matches spec
      release_per_image_paise: 24000, // ₹240 per image
      residual_paise: 0,
    });
  });

  it("handles a quota that divides base evenly (600100 / 25 = 24004)", () => {
    const result = calculateLicenseCheckout(600100, 25);
    expect(result.release_per_image_paise).toBe(24004);
    expect(result.residual_paise).toBe(0);
  });

  it("produces a residual on non-even division", () => {
    const result = calculateLicenseCheckout(600001, 25);
    expect(result.release_per_image_paise).toBe(24000);
    expect(result.residual_paise).toBe(1);
  });

  it("handles the Creation+Promotion default (₹15,000 / 10 / 30)", () => {
    const result = calculateLicenseCheckout(1500000, 10);
    expect(result.base_paise).toBe(1500000);
    expect(result.commission_paise).toBe(270000); // 18% × ₹15k
    expect(result.gst_on_commission_paise).toBe(48600); // 18% × ₹2,700
    expect(result.total_paise).toBe(1818600);
    expect(result.release_per_image_paise).toBe(150000);
    expect(result.residual_paise).toBe(0);
  });

  it("keeps total_paise conservation: total = base + commission + gst", () => {
    const base_paise = 777777;
    const r = calculateLicenseCheckout(base_paise, 13);
    expect(r.total_paise).toBe(
      r.base_paise + r.commission_paise + r.gst_on_commission_paise,
    );
  });

  it("keeps release conservation: release_per_image * quota + residual = base", () => {
    const base_paise = 999999;
    const quota = 17;
    const r = calculateLicenseCheckout(base_paise, quota);
    expect(r.release_per_image_paise * quota + r.residual_paise).toBe(base_paise);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calculateWithdrawalDeductions
// ─────────────────────────────────────────────────────────────────────────────

describe("calculateWithdrawalDeductions", () => {
  it("calculates Priya's withdrawal of ₹6,000 gross (spec §4.5)", () => {
    // Priya earns ₹6,000 gross. Spec says platform deducts TCS 1% + TDS 1%
    // + (only if creator has GSTIN) GST 18%. Priya has GSTIN → net ₹4,800.
    const result = calculateWithdrawalDeductions(600000, true);
    expect(result).toEqual({
      gross_paise: 600000,
      tcs_paise: 6000,
      tds_paise: 6000,
      gst_output_paise: 108000,
      net_paise: 480000, // ₹4,800
    });
  });

  it("deducts TCS + TDS + GST for a GSTIN creator (gross 48000 paise)", () => {
    const result = calculateWithdrawalDeductions(48000, true);
    expect(result.tcs_paise).toBe(480);
    expect(result.tds_paise).toBe(480);
    expect(result.gst_output_paise).toBe(8640); // 18%
    expect(result.net_paise).toBe(38400);
  });

  it("skips GST for a non-GSTIN creator", () => {
    const result = calculateWithdrawalDeductions(48000, false);
    expect(result.tcs_paise).toBe(480);
    expect(result.tds_paise).toBe(480);
    expect(result.gst_output_paise).toBe(0);
    expect(result.net_paise).toBe(47040);
  });

  it("keeps deduction conservation: gross = tcs + tds + gst + net", () => {
    for (const gross of [123456, 987654, 50000, 1000000]) {
      const r = calculateWithdrawalDeductions(gross, true);
      expect(r.tcs_paise + r.tds_paise + r.gst_output_paise + r.net_paise).toBe(
        gross,
      );
    }
    for (const gross of [123456, 987654, 50000, 1000000]) {
      const r = calculateWithdrawalDeductions(gross, false);
      expect(r.tcs_paise + r.tds_paise + r.gst_output_paise + r.net_paise).toBe(
        gross,
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calculateRefundOnExpiry — residual goes with the refund when slots unused
// ─────────────────────────────────────────────────────────────────────────────

describe("calculateRefundOnExpiry", () => {
  it("refunds only the unused slots when some images were approved", () => {
    // Priya's license: 25 images @ 24000 paise each, 10 approved.
    // Unused = 15 × 24000 = 360000 paise. Residual = 0 (even division).
    const refund = calculateRefundOnExpiry(600000, 25, 10);
    expect(refund).toBe(360000);
  });

  it("refunds the full base if no images were approved", () => {
    const refund = calculateRefundOnExpiry(600000, 25, 0);
    expect(refund).toBe(600000);
  });

  it("refunds nothing if every slot was used", () => {
    const refund = calculateRefundOnExpiry(600000, 25, 25);
    expect(refund).toBe(0);
  });

  it("includes the residual in the refund when any slot is unused", () => {
    // base 600001, quota 25 → release 24000, residual 1.
    // 10 approved → 15 unused × 24000 = 360000 + residual 1 = 360001.
    const refund = calculateRefundOnExpiry(600001, 25, 10);
    expect(refund).toBe(360001);
  });

  it("excludes residual when every slot used (residual belongs to creator then)", () => {
    // base 600001, quota 25 → residual 1 belongs to creator on final approval,
    // so refund on expiry with quota fully approved is 0.
    const refund = calculateRefundOnExpiry(600001, 25, 25);
    expect(refund).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calculateFinalImageRelease — residual lands on the final approved image
// ─────────────────────────────────────────────────────────────────────────────

describe("calculateFinalImageRelease", () => {
  it("returns just release_per_image when not the final image", () => {
    expect(calculateFinalImageRelease(600000, 25, false)).toBe(24000);
  });

  it("returns release_per_image when final and residual is zero", () => {
    expect(calculateFinalImageRelease(600000, 25, true)).toBe(24000);
  });

  it("adds the residual to the final image's release", () => {
    // base 600001, quota 25 → release 24000, residual 1. Final image gets 24001.
    expect(calculateFinalImageRelease(600001, 25, true)).toBe(24001);
  });

  it("non-final image release never carries residual", () => {
    expect(calculateFinalImageRelease(600001, 25, false)).toBe(24000);
  });

  it("keeps conservation across all slots: sum of releases = base_paise when fully approved", () => {
    const base_paise = 600001;
    const quota = 25;
    let sum = 0;
    for (let i = 1; i <= quota; i += 1) {
      sum += calculateFinalImageRelease(base_paise, quota, i === quota);
    }
    expect(sum).toBe(base_paise);
  });
});
