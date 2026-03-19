import { describe, expect, it } from "vitest";
import { stringWidth } from "./chars.js";

describe("stringWidth", () => {
  it("returns correct width for plain ASCII text", () => {
    expect(stringWidth("hello")).toBe(5);
  });

  it("returns correct width for full-width characters", () => {
    expect(stringWidth("日本語")).toBe(6);
  });

  it("strips SGR color codes", () => {
    // "\x1b[31mred\x1b[0m" should have width 3 ("red")
    expect(stringWidth("\x1b[31mred\x1b[0m")).toBe(3);
  });

  it("strips bold/dim/italic SGR codes", () => {
    expect(stringWidth("\x1b[1mbold\x1b[0m")).toBe(4);
    expect(stringWidth("\x1b[2mdim\x1b[0m")).toBe(3);
  });

  it("strips OSC sequences", () => {
    // OSC hyperlink: \x1b]8;;url\x1b\\text\x1b]8;;\x1b\\
    expect(stringWidth("\x1b]8;;https://example.com\x1b\\link\x1b]8;;\x1b\\")).toBe(4);
  });

  it("handles mixed ANSI codes and full-width characters", () => {
    // "\x1b[31m日本\x1b[0m" should have width 4
    expect(stringWidth("\x1b[31m日本\x1b[0m")).toBe(4);
  });

  it("handles strings without escape sequences (fast path)", () => {
    expect(stringWidth("no escapes")).toBe(10);
  });

  it("returns 0 for empty string", () => {
    expect(stringWidth("")).toBe(0);
  });

  it("handles multiple SGR sequences in one string", () => {
    // "\x1b[1mA\x1b[0m\x1b[31mB\x1b[0m" = "AB" = width 2
    expect(stringWidth("\x1b[1mA\x1b[0m\x1b[31mB\x1b[0m")).toBe(2);
  });
});
