import { describe, it, expect } from "vitest";
import {
  effectiveCheckedItems,
  toggleCheckedItem,
  isCardScheduledNow,
} from "@/lib/reference-cards";

const at = (h: number, m = 0) => h * 60 + m;
const WED = 3;
const FRI = 5;
const SAT = 6;

describe("effectiveCheckedItems — the launch pad starts clean each day", () => {
  it("drops yesterday's ticks on a daily checklist", () => {
    expect(
      effectiveCheckedItems(
        { checklistReset: "daily", checkedItems: [0, 2], checkedOn: "2026-10-03" },
        "2026-10-04"
      )
    ).toEqual([]);
  });

  it("keeps today's ticks", () => {
    expect(
      effectiveCheckedItems(
        { checklistReset: "daily", checkedItems: [0, 2], checkedOn: "2026-10-04" },
        "2026-10-04"
      )
    ).toEqual([0, 2]);
  });

  it("never drops ticks on a manual checklist", () => {
    expect(
      effectiveCheckedItems(
        { checklistReset: "manual", checkedItems: [1], checkedOn: "2026-09-01" },
        "2026-10-04"
      )
    ).toEqual([1]);
  });
});

describe("toggleCheckedItem", () => {
  it("adds and removes without duplicates, sorted", () => {
    expect(toggleCheckedItem([2], 0, true)).toEqual([0, 2]);
    expect(toggleCheckedItem([0, 2], 0, true)).toEqual([0, 2]);
    expect(toggleCheckedItem([0, 2], 2, false)).toEqual([0]);
  });
});

describe("isCardScheduledNow", () => {
  const always = { daysOfWeek: null, showFrom: null, showUntil: null };
  const evenings = { daysOfWeek: [3, 4, 5], showFrom: "17:00", showUntil: "23:30" };
  const lateNight = { daysOfWeek: [5], showFrom: "21:00", showUntil: "02:00" };

  it("shows an unscheduled card all the time", () => {
    expect(isCardScheduledNow(always, 0, at(0))).toBe(true);
    expect(isCardScheduledNow(always, SAT, at(23, 59))).toBe(true);
  });

  it("respects days and an evening window (Wed–Fri after classes)", () => {
    expect(isCardScheduledNow(evenings, WED, at(18))).toBe(true);
    expect(isCardScheduledNow(evenings, WED, at(12))).toBe(false);
    expect(isCardScheduledNow(evenings, SAT, at(18))).toBe(false);
    expect(isCardScheduledNow(evenings, FRI, at(23, 30))).toBe(false); // end is exclusive
  });

  it("lets a window wrap past midnight, keeping the tail on the start day", () => {
    expect(isCardScheduledNow(lateNight, FRI, at(22))).toBe(true);
    expect(isCardScheduledNow(lateNight, SAT, at(1))).toBe(true); // Fri night, after midnight
    expect(isCardScheduledNow(lateNight, FRI, at(1))).toBe(false); // Thu night isn't scheduled
    expect(isCardScheduledNow(lateNight, SAT, at(22))).toBe(false);
    expect(isCardScheduledNow(lateNight, SAT, at(3))).toBe(false);
  });
});
