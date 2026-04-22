// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { BalanceChip } from "../balance-chip";

afterEach(() => cleanup());

describe("BalanceChip", () => {
  it("renders rupee value with ₹ prefix", () => {
    render(<BalanceChip paise={1234500} />);
    expect(screen.getByText(/12,345/)).toBeInTheDocument();
  });
  it("rounds sub-rupee paise", () => {
    render(<BalanceChip paise={99} />);
    expect(screen.getByText(/0\.99/)).toBeInTheDocument();
  });
  it("exposes aria-label with formatted value", () => {
    render(<BalanceChip paise={250000} ariaLabel="Credits balance" />);
    const chip = screen.getByRole("status");
    expect(chip).toHaveAttribute("aria-label", expect.stringContaining("Credits balance"));
    expect(chip).toHaveAttribute("aria-label", expect.stringContaining("₹2,500"));
  });
});
