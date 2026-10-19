import { describe, it, expect } from "vitest";
import {
  NOT_ENOUGH_DATA,
  chunkingInsight,
  deadlineBucket,
  deadlineInsight,
  planInsight,
  planOutcome,
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

describe("deadlines", () => {
  it("buckets by time to spare", () => {
    expect(deadlineBucket(2 * 86400)).toBe("early");
    expect(deadlineBucket(86400)).toBe("early");
    expect(deadlineBucket(3600)).toBe("justInTime");
    expect(deadlineBucket(0)).toBe("justInTime");
    expect(deadlineBucket(-60)).toBe("late");
  });

  it("gates and phrases the insight", () => {
    expect(deadlineInsight({ early: 5, justInTime: 2, late: 1 })).toBe(NOT_ENOUGH_DATA);
    expect(deadlineInsight({ early: 6, justInTime: 3, late: 1 })).toMatch(/day or more to spare/);
    expect(deadlineInsight({ early: 2, justInTime: 5, late: 3 })).toBe("About 3 in 10 land after the deadline.");
    expect(deadlineInsight({ early: 2, justInTime: 7, late: 1 })).toMatch(/last day/);
  });
});

describe("planOutcome", () => {
  const s = (over: Partial<Parameters<typeof planOutcome>[0]>) =>
    planOutcome({ status: null, startDay: "2026-10-18", completedDay: null, completedBeforeStart: false, ...over });

  it("Quiz 4: skipped at 3:30, finished at 8:16 the same day → done later same day", () => {
    expect(s({ status: "skipped", completedDay: "2026-10-18" })).toBe("sameDay");
  });

  it("covers every outcome", () => {
    expect(s({ status: "done" })).toBe("inSitting");
    expect(s({ completedDay: "2026-10-20" })).toBe("later");
    expect(s({ status: "skipped" })).toBe("skipped");
    expect(s({})).toBe("open");
    expect(s({ status: "partial" })).toBe("open");
  });

  it("drops a sitting the task was already finished before", () => {
    expect(s({ completedDay: "2026-10-17", completedBeforeStart: true })).toBeNull();
  });
});

describe("planInsight", () => {
  const c = (inSitting: number, sameDay: number, later: number, open: number, skipped: number) => ({
    inSitting, sameDay, later, open, skipped,
  });
  it("gates under 10", () => expect(planInsight(c(3, 3, 0, 0, 0))).toBe(NOT_ENOUGH_DATA));
  it("same-day recovery reads as positive", () => {
    expect(planInsight(c(2, 5, 1, 1, 1))).toMatch(/same day/);
  });
  it("mostly kept", () => expect(planInsight(c(6, 1, 1, 1, 1))).toMatch(/as planned/));
});
