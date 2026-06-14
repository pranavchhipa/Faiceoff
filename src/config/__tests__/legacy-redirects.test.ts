import { describe, it, expect } from "vitest";
import { resolveLegacyRedirect } from "../legacy-redirects";

describe("resolveLegacyRedirect", () => {
  it("maps /dashboard to role home", () => {
    expect(resolveLegacyRedirect("/dashboard", "brand")).toBe("/brand/dashboard");
    expect(resolveLegacyRedirect("/dashboard", "creator")).toBe("/creator/dashboard");
  });

  it("maps /dashboard/campaigns to role collabs", () => {
    expect(resolveLegacyRedirect("/dashboard/campaigns", "brand")).toBe("/brand/collabs");
    expect(resolveLegacyRedirect("/dashboard/campaigns", "creator")).toBe("/creator/collabs");
  });

  it("maps /dashboard/campaigns/<id> to brand collabs (id preserved for brand)", () => {
    expect(resolveLegacyRedirect("/dashboard/campaigns/abc-123", "brand"))
      .toBe("/brand/collabs/abc-123");
    expect(resolveLegacyRedirect("/dashboard/campaigns/abc-123", "creator"))
      .toBe("/creator/collabs");
  });

  it("maps /dashboard/creators to /brand/discover (brand only)", () => {
    expect(resolveLegacyRedirect("/dashboard/creators", "brand")).toBe("/brand/discover");
    expect(resolveLegacyRedirect("/dashboard/creators/xyz", "brand")).toBe("/brand/discover/xyz");
  });

  it("creator visiting /dashboard/creators gets sent to their dashboard", () => {
    expect(resolveLegacyRedirect("/dashboard/creators", "creator")).toBe("/creator/dashboard");
  });

  it("maps /dashboard/approvals to /creator/approvals", () => {
    expect(resolveLegacyRedirect("/dashboard/approvals", "creator")).toBe("/creator/approvals");
    expect(resolveLegacyRedirect("/dashboard/approvals/xyz", "creator"))
      .toBe("/creator/approvals");
  });

  it("brand visiting /dashboard/approvals gets sent to their dashboard", () => {
    expect(resolveLegacyRedirect("/dashboard/approvals", "brand")).toBe("/brand/dashboard");
  });

  it("maps /dashboard/wallet per role", () => {
    expect(resolveLegacyRedirect("/dashboard/wallet", "brand")).toBe("/brand/wallet");
    expect(resolveLegacyRedirect("/dashboard/wallet", "creator")).toBe("/creator/earnings");
  });

  it("passes through /dashboard/onboarding and /dashboard/brand-setup (still live there)", () => {
    expect(resolveLegacyRedirect("/dashboard/onboarding", "brand")).toBeNull();
    expect(resolveLegacyRedirect("/dashboard/onboarding", "creator")).toBeNull();
    expect(resolveLegacyRedirect("/dashboard/brand-setup", "brand")).toBeNull();
  });

  it("maps /dashboard/likeness to /creator/likeness", () => {
    expect(resolveLegacyRedirect("/dashboard/likeness", "creator"))
      .toBe("/creator/likeness");
  });

  it("maps /dashboard/settings to role settings", () => {
    expect(resolveLegacyRedirect("/dashboard/settings", "brand")).toBe("/brand/settings");
    expect(resolveLegacyRedirect("/dashboard/settings", "creator")).toBe("/creator/settings");
  });

  it("maps /dashboard/analytics — creator gets analytics, brand bounces to dashboard", () => {
    expect(resolveLegacyRedirect("/dashboard/analytics", "brand")).toBe("/brand/dashboard");
    expect(resolveLegacyRedirect("/dashboard/analytics", "creator")).toBe("/creator/analytics");
  });

  it("unknown /dashboard/* path falls back to role home", () => {
    expect(resolveLegacyRedirect("/dashboard/mystery", "brand")).toBe("/brand/dashboard");
    expect(resolveLegacyRedirect("/dashboard/mystery", "creator")).toBe("/creator/dashboard");
  });

  it("returns null if not a legacy path", () => {
    expect(resolveLegacyRedirect("/brand/dashboard", "brand")).toBeNull();
    expect(resolveLegacyRedirect("/login", null)).toBeNull();
  });

  it("unknown role can't resolve, returns null", () => {
    expect(resolveLegacyRedirect("/dashboard", null)).toBeNull();
  });
});
