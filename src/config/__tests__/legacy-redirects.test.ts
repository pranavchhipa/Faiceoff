import { describe, it, expect } from "vitest";
import { resolveLegacyRedirect } from "../legacy-redirects";

describe("resolveLegacyRedirect", () => {
  it("maps /dashboard to role home", () => {
    expect(resolveLegacyRedirect("/dashboard", "brand")).toBe("/brand/dashboard");
    expect(resolveLegacyRedirect("/dashboard", "creator")).toBe("/creator/dashboard");
  });

  it("maps /dashboard/campaigns to role-specific sessions", () => {
    expect(resolveLegacyRedirect("/dashboard/campaigns", "brand")).toBe("/brand/sessions");
    expect(resolveLegacyRedirect("/dashboard/campaigns", "creator")).toBe("/creator/sessions");
  });

  it("maps /dashboard/campaigns/<id> preserving id to role sessions", () => {
    expect(resolveLegacyRedirect("/dashboard/campaigns/abc-123", "brand"))
      .toBe("/brand/sessions/abc-123");
    expect(resolveLegacyRedirect("/dashboard/campaigns/abc-123", "creator"))
      .toBe("/creator/sessions/abc-123");
  });

  it("maps /dashboard/creators for brand only", () => {
    expect(resolveLegacyRedirect("/dashboard/creators", "brand")).toBe("/brand/creators");
    expect(resolveLegacyRedirect("/dashboard/creators/xyz", "brand")).toBe("/brand/creators/xyz");
  });

  it("creator visiting /dashboard/creators gets sent to their dashboard", () => {
    expect(resolveLegacyRedirect("/dashboard/creators", "creator")).toBe("/creator/dashboard");
  });

  it("maps /dashboard/approvals to /creator/approvals", () => {
    expect(resolveLegacyRedirect("/dashboard/approvals", "creator")).toBe("/creator/approvals");
    expect(resolveLegacyRedirect("/dashboard/approvals/xyz", "creator"))
      .toBe("/creator/approvals/xyz");
  });

  it("brand visiting /dashboard/approvals gets sent to their dashboard", () => {
    expect(resolveLegacyRedirect("/dashboard/approvals", "brand")).toBe("/brand/dashboard");
  });

  it("maps /dashboard/wallet per role", () => {
    expect(resolveLegacyRedirect("/dashboard/wallet", "brand")).toBe("/brand/credits");
    expect(resolveLegacyRedirect("/dashboard/wallet", "creator")).toBe("/creator/earnings");
  });

  it("maps /dashboard/onboarding and /dashboard/brand-setup", () => {
    expect(resolveLegacyRedirect("/dashboard/onboarding", "brand")).toBe("/brand/onboarding");
    expect(resolveLegacyRedirect("/dashboard/onboarding", "creator")).toBe("/creator/onboarding");
    expect(resolveLegacyRedirect("/dashboard/brand-setup", "brand")).toBe("/brand/onboarding");
  });

  it("maps /dashboard/likeness to /creator/reference-photos", () => {
    expect(resolveLegacyRedirect("/dashboard/likeness", "creator"))
      .toBe("/creator/reference-photos");
  });

  it("maps /dashboard/settings to role settings", () => {
    expect(resolveLegacyRedirect("/dashboard/settings", "brand")).toBe("/brand/settings");
    expect(resolveLegacyRedirect("/dashboard/settings", "creator")).toBe("/creator/settings");
  });

  it("maps /dashboard/analytics to role dashboard", () => {
    expect(resolveLegacyRedirect("/dashboard/analytics", "brand")).toBe("/brand/dashboard");
    expect(resolveLegacyRedirect("/dashboard/analytics", "creator")).toBe("/creator/dashboard");
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
