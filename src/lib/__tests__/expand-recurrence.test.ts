import { describe, it, expect } from "vitest";
import { expandRecurrence } from "../calendar/expand-recurrence";

describe("expandRecurrence", () => {
  it("returns a single instance for a non-recurring event", () => {
    const result = expandRecurrence({
      title: "One-off",
      startTime: "2026-09-01T14:00:00Z",
      endTime: "2026-09-01T15:00:00Z",
    });
    expect(result).toHaveLength(1);
    expect(result[0].startTime.toISOString()).toBe("2026-09-01T14:00:00.000Z");
  });

  it("expands a weekly recurrence across the requested days", () => {
    const result = expandRecurrence({
      title: "Class",
      startTime: "2026-09-01T14:00:00Z", // a Tuesday
      endTime: "2026-09-01T15:00:00Z",
      recurrence: {
        type: "weekly",
        daysOfWeek: [2, 4], // Tue, Thu
        endDate: "2026-09-17T00:00:00Z",
      },
    });
    // Tue 9/1, Thu 9/3, Tue 9/8, Thu 9/10, Tue 9/15
    expect(result).toHaveLength(5);
    result.forEach((e) => {
      expect(e.endTime.getTime() - e.startTime.getTime()).toBe(60 * 60 * 1000);
    });
  });

  it("skips dates in the exceptions list without affecting other instances", () => {
    const base = expandRecurrence({
      title: "Class",
      startTime: "2026-09-01T14:00:00Z",
      endTime: "2026-09-01T15:00:00Z",
      recurrence: {
        type: "weekly",
        daysOfWeek: [2, 4],
        endDate: "2026-09-17T00:00:00Z",
      },
    });
    expect(base).toHaveLength(5);

    const skipped = base[2]; // one middle instance
    const result = expandRecurrence({
      title: "Class",
      startTime: "2026-09-01T14:00:00Z",
      endTime: "2026-09-01T15:00:00Z",
      recurrence: {
        type: "weekly",
        daysOfWeek: [2, 4],
        endDate: "2026-09-17T00:00:00Z",
        exceptions: [skipped.startTime.toISOString()],
      },
    });

    expect(result).toHaveLength(4);
    expect(result.some((e) => e.startTime.getTime() === skipped.startTime.getTime())).toBe(false);
  });

  it("skips a bare YYYY-MM-DD exception regardless of local timezone", () => {
    const result = expandRecurrence({
      title: "Class",
      startTime: "2026-09-01T14:00:00Z",
      endTime: "2026-09-01T15:00:00Z",
      recurrence: {
        type: "weekly",
        daysOfWeek: [2, 4],
        endDate: "2026-09-17T00:00:00Z",
        exceptions: ["2026-09-08"],
      },
    });
    expect(result).toHaveLength(4);
  });

  it("ignores exceptions that don't match any generated instance", () => {
    const result = expandRecurrence({
      title: "Class",
      startTime: "2026-09-01T14:00:00Z",
      endTime: "2026-09-01T15:00:00Z",
      recurrence: {
        type: "weekly",
        daysOfWeek: [2, 4],
        endDate: "2026-09-17T00:00:00Z",
        exceptions: ["2099-01-01"],
      },
    });
    expect(result).toHaveLength(5);
  });

  describe("with timeZone (DST-safe path)", () => {
    it("preserves 9am wall-clock time in America/New_York across the Nov 1 DST transition", () => {
      const result = expandRecurrence({
        title: "MWF Class",
        startTime: "2026-10-06T13:00:00Z", // 9am EDT
        endTime: "2026-10-06T14:00:00Z",
        recurrence: {
          type: "weekly",
          daysOfWeek: [2], // one weekday, spanning both sides of the DST boundary
          endDate: "2026-11-24T00:00:00Z",
          timeZone: "America/New_York",
        },
      });

      expect(result.length).toBeGreaterThan(1);

      const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
      });
      for (const e of result) {
        expect(fmt.format(e.startTime)).toBe("09:00");
      }

      // Sanity check that this test actually crosses a DST boundary — the UTC
      // hour must differ before/after, or the wall-clock assertion above
      // would pass vacuously on a server already running in America/New_York.
      const utcHours = new Set(result.map((e) => e.startTime.getUTCHours()));
      expect(utcHours.size).toBeGreaterThan(1);
    });

    it("resolves a bare YYYY-MM-DD end_date/exception using the given timezone, not server-local", () => {
      const result = expandRecurrence({
        title: "Class",
        startTime: "2026-09-01T13:00:00Z", // 9am EDT, Tuesday
        endTime: "2026-09-01T14:00:00Z",
        recurrence: {
          type: "weekly",
          daysOfWeek: [2, 4],
          endDate: "2026-09-17",
          exceptions: ["2026-09-08"],
          timeZone: "America/New_York",
        },
      });
      // Tue 9/1, Thu 9/3, [skip Tue 9/8], Thu 9/10, Tue 9/15, Thu 9/17 (endDate is inclusive)
      expect(result).toHaveLength(5);
    });
  });
});
