import { describe, it, expect } from "vitest";
import { sanitizeUserText } from "../prompt-assembler";

describe("sanitizeUserText", () => {
  it("removes ASCII control characters", () => {
    const input = "Hello\x00World\x1fTest\x7f";
    const result = sanitizeUserText(input, 200);
    // control chars become spaces, then collapsed
    expect(result).not.toMatch(/[\x00-\x1f\x7f]/);
    expect(result).toContain("Hello");
    expect(result).toContain("World");
    expect(result).toContain("Test");
  });

  it("collapses multiple whitespace characters to a single space", () => {
    const result = sanitizeUserText("  hello   world  ", 200);
    expect(result).toBe("hello world");
  });

  it("strips quote and bracket characters that could break delimiters", () => {
    const result = sanitizeUserText(`say "hello" and 'bye' <script>{}</script>`, 200);
    expect(result).not.toMatch(/["'`<>{}]/);
    expect(result).toContain("say");
    expect(result).toContain("hello");
  });

  it("truncates to the provided max length", () => {
    const long = "a".repeat(300);
    const result = sanitizeUserText(long, 200);
    expect(result.length).toBe(200);
  });

  it("passes plain ASCII text through unchanged", () => {
    const plain = "Pourfect Coffee rooftop shoot";
    expect(sanitizeUserText(plain, 200)).toBe(plain);
  });

  it("trims leading and trailing whitespace", () => {
    expect(sanitizeUserText("  hello  ", 200)).toBe("hello");
  });

  it("handles empty string", () => {
    expect(sanitizeUserText("", 200)).toBe("");
  });
});
