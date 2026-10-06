import { describe, it, expect } from "vitest";
import { getAvailableMinutes, getBlockedMinutes, getSleepBlockedMinutes } from "../crisis-detection";
import { toUTC } from "../timezone";

// Sleep 22:00 → 07:00. Window: 6 PM one evening to 10 AM the next morning,
// so 16h total with 9h of sleep inside it. Run under two offsets.
const WAKE = 7;
const SLEEP = 22;

describe.each(["America/New_York", "Europe/Bucharest"])("crisis time math in %s", (tz) => {
  const at = (local: string) => new Date(toUTC(local, tz));
  const windowStart = at("2026-04-15T18:00:00");
  const windowEnd = at("2026-04-16T10:00:00");
  const event = (start: string, end: string) => ({
    startTime: at(start),
    endTime: at(end),
    isAllDay: false,
  });

  it("counts 9h of sleep in the window", () => {
    expect(getSleepBlockedMinutes(WAKE, SLEEP, windowStart, windowEnd, tz)).toBe(540);
  });

  it("an event fully inside the sleep window doesn't reduce available time further", () => {
    const lateEvent = event("2026-04-15T23:00:00", "2026-04-16T00:30:00");
    expect(getBlockedMinutes([lateEvent], WAKE, SLEEP, windowStart, windowEnd, tz)).toBe(540);
    expect(getAvailableMinutes([lateEvent], WAKE, SLEEP, windowStart, windowEnd, tz)).toBe(
      getAvailableMinutes([], WAKE, SLEEP, windowStart, windowEnd, tz)
    );
  });

  it("an event running into sleep counts only its awake part", () => {
    const evening = event("2026-04-15T21:00:00", "2026-04-15T23:00:00");
    expect(getBlockedMinutes([evening], WAKE, SLEEP, windowStart, windowEnd, tz)).toBe(600);
  });

  it("overlapping events count once", () => {
    const a = event("2026-04-15T19:00:00", "2026-04-15T20:00:00");
    const b = event("2026-04-15T19:30:00", "2026-04-15T20:30:00");
    expect(getBlockedMinutes([a, b], WAKE, SLEEP, windowStart, windowEnd, tz)).toBe(540 + 90);
  });

  it("ignores all-day events and clips events to the window", () => {
    const allDay = { ...event("2026-04-15T00:00:00", "2026-04-16T00:00:00"), isAllDay: true };
    const straddling = event("2026-04-15T17:00:00", "2026-04-15T19:00:00");
    expect(getBlockedMinutes([allDay, straddling], WAKE, SLEEP, windowStart, windowEnd, tz)).toBe(
      540 + 60
    );
  });
});
