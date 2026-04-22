import { describe, it, expect } from "vitest";
import { resolveRoleFromUserRow } from "../get-session-role";

describe("resolveRoleFromUserRow", () => {
  it("returns role from users.role column", () => {
    expect(resolveRoleFromUserRow({ role: "brand" })).toBe("brand");
    expect(resolveRoleFromUserRow({ role: "creator" })).toBe("creator");
    expect(resolveRoleFromUserRow({ role: "admin" })).toBe("admin");
  });
  it("returns null for unknown role value", () => {
    expect(resolveRoleFromUserRow({ role: "guest" })).toBeNull();
    expect(resolveRoleFromUserRow({ role: null })).toBeNull();
    expect(resolveRoleFromUserRow(null)).toBeNull();
  });
});
