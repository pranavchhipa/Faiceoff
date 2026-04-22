import { describe, expect, it } from "vitest";
import {
  assertTransition,
  canTransition,
  isTerminal,
  LICENSE_STATES,
  type LicenseState,
} from "../workflow";

describe("canTransition", () => {
  it("allows requested → accepted", () => {
    expect(canTransition("requested", "accepted")).toBe(true);
  });

  it("allows requested → rejected", () => {
    expect(canTransition("requested", "rejected")).toBe(true);
  });

  it("allows accepted → active", () => {
    expect(canTransition("accepted", "active")).toBe(true);
  });

  it("allows active → completed", () => {
    expect(canTransition("active", "completed")).toBe(true);
  });

  it("allows active → expired", () => {
    expect(canTransition("active", "expired")).toBe(true);
  });

  it("rejects rejected → accepted (terminal state)", () => {
    expect(canTransition("rejected", "accepted")).toBe(false);
  });

  it("rejects completed → active (terminal state)", () => {
    expect(canTransition("completed", "active")).toBe(false);
  });

  it("rejects requested → active (must go through accepted)", () => {
    expect(canTransition("requested", "active")).toBe(false);
  });

  it("rejects same-state transitions (idempotency handled elsewhere)", () => {
    for (const s of LICENSE_STATES) {
      expect(canTransition(s as LicenseState, s as LicenseState)).toBe(false);
    }
  });
});

describe("assertTransition", () => {
  it("no-op on legal transition", () => {
    expect(() => assertTransition("requested", "accepted")).not.toThrow();
  });

  it("throws on illegal transition with context", () => {
    expect(() =>
      assertTransition("rejected", "accepted", "accept route"),
    ).toThrow(/accept route.*rejected.*accepted/);
  });
});

describe("isTerminal", () => {
  it("flags rejected/expired/cancelled/completed", () => {
    expect(isTerminal("rejected")).toBe(true);
    expect(isTerminal("expired")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
    expect(isTerminal("completed")).toBe(true);
  });

  it("non-terminal: draft, requested, accepted, active", () => {
    expect(isTerminal("draft")).toBe(false);
    expect(isTerminal("requested")).toBe(false);
    expect(isTerminal("accepted")).toBe(false);
    expect(isTerminal("active")).toBe(false);
  });
});
