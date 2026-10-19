import { describe, it, expect } from "vitest";
import {
  NOT_ENOUGH_DATA,
  chunkingInsight,
  heatmapInsight,
  median,
  parsePeriod,
} from "@/lib/momentum";

const cell = (dayOfWeek: number, hour: number, count: number) => ({ dayOfWeek, hour, count });

describe("heatmapInsight", () => {
  it("says nothing about patterns under 10 items", () => {
    expect(heatmapInsight([cell(1, 10, 9)])).toBe(NOT_ENOUGH_DATA);
  });

  it("names the busiest day and stretch with counts the grid can confirm", () => {
    const s = heatmapInsight([cell(1, 13, 6), cell(1, 14, 2), cell(3, 9, 4)]);
    expect(s).toContain("**Tuesday** (8 of 12)");
    expect(s).toContain("**afternoons**, 12p–5p (8 of 12)");
  });

  it("leaves out a tied half instead of picking one", () => {
    const s = heatmapInsight([cell(0, 10, 5), cell(2, 15, 5)]);
    expect(s).toBe("No single busiest day or time. It's spread out.");
  });
});

describe("chunkingInsight", () => {
  const r = (finished: number, total: number) => ({ finished, total });

  it("needs 10 on each side", () => {
    expect(chunkingInsight(r(7, 8), r(2, 40))).toBe(NOT_ENOUGH_DATA);
  });

  it("only says it helps past the margin", () => {
    expect(chunkingInsight(r(8, 10), r(6, 10))).toMatch(/more often/);
    expect(chunkingInsight(r(7, 10), r(65, 100))).toBe("About the same either way.");
    expect(chunkingInsight(r(4, 10), r(6, 10))).toMatch(/less often/);
  });
});

describe("helpers", () => {
  it("median handles odd, even and empty", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
  });

  it("parsePeriod falls back to the week", () => {
    expect(parsePeriod("4w")).toBe("4w");
    expect(parsePeriod("bogus")).toBe("week");
    expect(parsePeriod(null)).toBe("week");
  });
});
