import { describe, it, expect } from "vitest";
import { enforceWordLimit } from "@/lib/ai/validate";

const words = (n: number, w = "word") => Array.from({ length: n }, () => w).join(" ");

describe("enforceWordLimit", () => {
  it("leaves short text alone", () => {
    expect(enforceWordLimit("Short and sweet.", 35)).toBe("Short and sweet.");
  });

  it("cuts at a sentence boundary inside the limit", () => {
    const text = `${words(8)}. ${words(8)}`;
    expect(enforceWordLimit(text, 10)).toBe(`${words(8)}.`);
  });

  it("finishes the sentence instead of chopping it with ...", () => {
    const text = `${words(12)} end. Extra sentence here.`;
    const out = enforceWordLimit(text, 10);
    expect(out).toBe(`${words(12)} end.`);
    expect(out).not.toMatch(/\.\.\.$/);
  });

  it("keeps offsets right when the text has newlines", () => {
    const text = `${words(6)}\n\n${words(6)} done. More.`;
    expect(enforceWordLimit(text, 8)).toBe(`${words(6)}\n\n${words(6)} done.`);
  });

  it("returns the whole text when no sentence ever ends", () => {
    expect(enforceWordLimit(words(40), 35)).toBe(words(40));
  });
});
