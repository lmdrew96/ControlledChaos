import { describe, it, expect } from "vitest";
import { trimIncompleteTail } from "@/lib/ai/validate";

describe("trimIncompleteTail", () => {
  it("leaves complete text untouched", () => {
    const text = "You knocked out the Bio reading — solid day. Rest up, Nae.";
    expect(trimIncompleteTail(text)).toBe(text);
  });

  it("accepts terminal punctuation wrapped in a closing quote or bracket", () => {
    const text = 'She said "get the hard stuff done early."';
    expect(trimIncompleteTail(text)).toBe(text);
  });

  it("rewinds a mid-word cut to the last completed sentence", () => {
    // The exact failure from the 2026-09-08 evening wrap-up.
    const cut =
      "Nice work today, Nae. Tomorrow's got a packed class schedule (psy";
    expect(trimIncompleteTail(cut)).toBe("Nice work today, Nae.");
  });

  it("keeps whole words and marks the cut when no sentence ever completed", () => {
    expect(trimIncompleteTail("Tomorrow's got a packed class schedule (psy")).toBe(
      "Tomorrow's got a packed class schedule…"
    );
  });

  it("strips a dangling separator before the ellipsis", () => {
    expect(trimIncompleteTail("Your quiz is at 1pm — rev")).toBe("Your quiz is at 1pm…");
  });

  it("returns empty string for empty or whitespace-only input", () => {
    expect(trimIncompleteTail("")).toBe("");
    expect(trimIncompleteTail("   \n ")).toBe("");
  });
});
