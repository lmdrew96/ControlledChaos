import { describe, it, expect } from "vitest";
import { trailingDateKeys } from "@/lib/db/queries/momentum";
import { toDateKeyInTimezone, startOfDayInTimezone } from "@/lib/timezone";

describe("momentum date keys", () => {
  it("counts back 14 local days from today's key, across a month boundary", () => {
    const keys = trailingDateKeys("2026-10-03", 14);
    expect(keys).toHaveLength(14);
    expect(keys[0]).toBe("2026-09-20");
    expect(keys[13]).toBe("2026-10-03");
  });

  it("crosses a DST change without skipping or repeating a day", () => {
    const keys = trailingDateKeys("2026-11-03", 3);
    expect(keys).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
  });

  // The bug: local midnight in a UTC+ zone is the previous UTC date, so
  // toISOString().slice(0, 10) named the wrong day.
  it.each([
    ["Asia/Tokyo", "2026-09-25T03:00:00Z", "2026-09-25"], // UTC+9, noon local
    ["America/Los_Angeles", "2026-09-25T19:00:00Z", "2026-09-25"], // UTC-7, noon local
  ])("keys local midnight in %s to its own date", (tz, instant, expected) => {
    const midnight = startOfDayInTimezone(new Date(instant), tz);
    expect(toDateKeyInTimezone(midnight, tz)).toBe(expected);
  });

  it("toISOString would have been wrong in Tokyo (documents the bug)", () => {
    const midnight = startOfDayInTimezone(new Date("2026-09-25T03:00:00Z"), "Asia/Tokyo");
    expect(midnight.toISOString().slice(0, 10)).toBe("2026-09-24");
  });
});
