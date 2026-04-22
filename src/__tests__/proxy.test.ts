import { describe, it, expect } from "vitest";
import { decideRedirect } from "../proxy-logic";
import type { Role } from "@/config/routes";

describe("decideRedirect — proxy routing matrix", () => {
  const cases: Array<[string, Role | null, string, string | null]> = [
    // [pathname, role, description, expectedRedirect | null(=pass through)]
    ["/",                   null,      "public, anon",               null],
    ["/for-brands",         null,      "marketing, anon",            null],
    ["/login",              null,      "auth page, anon",            null],
    ["/login",              "brand",   "logged-in brand hits login", "/brand/dashboard"],
    ["/login",              "creator", "logged-in creator hits login", "/creator/dashboard"],
    ["/auth/verify",        "brand",   "logged-in hits verify",      "/brand/dashboard"],
    ["/brand/dashboard",    null,      "protected, anon",            "/login?redirect=%2Fbrand%2Fdashboard"],
    ["/brand/dashboard",    "brand",   "brand in /brand",            null],
    ["/brand/dashboard",    "creator", "creator in /brand",          "/creator/dashboard"],
    ["/creator/dashboard",  "brand",   "brand in /creator",          "/brand/dashboard"],
    ["/admin",              "brand",   "non-admin in /admin",        "/brand/dashboard"],
    ["/admin",              "admin",   "admin in /admin",            null],
    ["/dashboard",          "brand",   "legacy root as brand",       "/brand/dashboard"],
    ["/dashboard/campaigns","brand",   "legacy campaigns as brand",  "/brand/sessions"],
    ["/dashboard/approvals","creator", "legacy approvals as creator","/creator/approvals"],
    ["/dashboard/wallet",   "brand",   "legacy wallet as brand",     "/brand/credits"],
    ["/dashboard/wallet",   "creator", "legacy wallet as creator",   "/creator/earnings"],
    ["/u/generations/abc",  null,      "public utility, anon",       null],
    ["/api/health",         null,      "api route anon",             null],
  ];

  for (const [pathname, role, description, expected] of cases) {
    it(`${description}: ${pathname} [role=${role ?? "anon"}]`, () => {
      const result = decideRedirect(pathname, role);
      expect(result).toBe(expected);
    });
  }
});
