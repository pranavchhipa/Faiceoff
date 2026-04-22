import { describe, it, expect } from "vitest";
import { ROLE_HOME, getRoleHome, isBrandPath, isCreatorPath, isAdminPath, isPublicPath, isAuthPath } from "../routes";

describe("routes", () => {
  describe("ROLE_HOME", () => {
    it("maps every role to its home path", () => {
      expect(ROLE_HOME.brand).toBe("/brand/dashboard");
      expect(ROLE_HOME.creator).toBe("/creator/dashboard");
      expect(ROLE_HOME.admin).toBe("/admin");
    });
  });

  describe("getRoleHome", () => {
    it("returns role home for known roles", () => {
      expect(getRoleHome("brand")).toBe("/brand/dashboard");
      expect(getRoleHome("creator")).toBe("/creator/dashboard");
      expect(getRoleHome("admin")).toBe("/admin");
    });
    it("falls back to /login for unknown role", () => {
      expect(getRoleHome(null)).toBe("/login");
    });
  });

  describe("path matchers", () => {
    it("isBrandPath matches /brand and children", () => {
      expect(isBrandPath("/brand")).toBe(true);
      expect(isBrandPath("/brand/dashboard")).toBe(true);
      expect(isBrandPath("/brands")).toBe(false);
      expect(isBrandPath("/creator/brand")).toBe(false);
    });
    it("isCreatorPath matches /creator and children", () => {
      expect(isCreatorPath("/creator")).toBe(true);
      expect(isCreatorPath("/creator/listings")).toBe(true);
      expect(isCreatorPath("/creators")).toBe(false);
    });
    it("isAdminPath matches /admin and children", () => {
      expect(isAdminPath("/admin")).toBe(true);
      expect(isAdminPath("/admin/ledgers")).toBe(true);
      expect(isAdminPath("/administrator")).toBe(false);
    });
    it("isPublicPath includes /, marketing pages, /u/*", () => {
      expect(isPublicPath("/")).toBe(true);
      expect(isPublicPath("/for-brands")).toBe(true);
      expect(isPublicPath("/pricing")).toBe(true);
      expect(isPublicPath("/terms")).toBe(true);
      expect(isPublicPath("/u/generations/abc")).toBe(true);
      expect(isPublicPath("/brand/dashboard")).toBe(false);
    });
    it("isAuthPath matches /login, /signup, /auth/*", () => {
      expect(isAuthPath("/login")).toBe(true);
      expect(isAuthPath("/signup")).toBe(true);
      expect(isAuthPath("/signup/brand")).toBe(true);
      expect(isAuthPath("/auth/verify")).toBe(true);
      expect(isAuthPath("/brand/dashboard")).toBe(false);
    });
  });
});
