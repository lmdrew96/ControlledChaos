import { describe, it, expect } from "vitest";
import {
  allDayRange,
  addDaysToDateKey,
  toDateKeyInTimezone,
  startOfDayInTimezone,
} from "@/lib/timezone";

/**
 * All-day events are stored as [local midnight, next local midnight).
 *
 * The bug this replaces: the create dialog sent a naive "YYYY-MM-DDT00:00:00"
 * string and the API parsed it with `new Date()`, which resolves in the
 * RUNTIME's timezone. On a New York dev machine that produced local midnight
 * and looked correct; on Vercel (UTC) it produced UTC midnight, four hours
 * early, which lands inside the PREVIOUS day's range.
 */
describe("allDayRange", () => {
  const NY = "America/New_York";
  const TOKYO = "Asia/Tokyo";

  it("anchors start to local midnight, not UTC midnight", () => {
    const { startISO } = allDayRange("2026-09-15", NY);
    // EDT is UTC-4, so local midnight is 04:00Z the same date.
    expect(startISO).toBe("2026-09-15T04:00:00.000Z");
    expect(startISO).not.toBe("2026-09-15T00:00:00.000Z");
  });

  it("ends at the NEXT local midnight, exclusive", () => {
    const { endISO } = allDayRange("2026-09-15", NY);
    expect(endISO).toBe("2026-09-16T04:00:00.000Z");
  });

  it("agrees exactly with the boundary every range query builds", () => {
    // This is the whole point: an all-day event's start and the range's start
    // must be the same instant, or the event falls in a neighbouring day.
    const { startISO, endISO } = allDayRange("2026-09-15", NY);
    const rangeStart = startOfDayInTimezone(new Date(startISO), NY);
    expect(new Date(startISO).getTime()).toBe(rangeStart.getTime());

    const rangeEnd = startOfDayInTimezone(new Date(endISO), NY);
    expect(new Date(endISO).getTime()).toBe(rangeEnd.getTime());
  });

  it("round-trips back to the day the user picked", () => {
    for (const key of ["2026-01-01", "2026-06-15", "2026-12-31"]) {
      const { startISO } = allDayRange(key, NY);
      expect(toDateKeyInTimezone(new Date(startISO), NY)).toBe(key);
    }
  });

  it("handles a positive UTC offset, where local midnight is the day before in UTC", () => {
    const { startISO, endISO } = allDayRange("2026-09-15", TOKYO);
    // JST is UTC+9, so local midnight is 15:00Z on the PREVIOUS date.
    expect(startISO).toBe("2026-09-14T15:00:00.000Z");
    expect(endISO).toBe("2026-09-15T15:00:00.000Z");
    // ...and it still resolves back to the 15th locally.
    expect(toDateKeyInTimezone(new Date(startISO), TOKYO)).toBe("2026-09-15");
  });

  describe("DST transitions", () => {
    it("spans 23 hours across the spring-forward day", () => {
      // 2026-03-08: America/New_York loses an hour at 02:00.
      const { startISO, endISO } = allDayRange("2026-03-08", NY);
      expect(startISO).toBe("2026-03-08T05:00:00.000Z"); // EST, UTC-5
      expect(endISO).toBe("2026-03-09T04:00:00.000Z"); // EDT, UTC-4
      const hours =
        (new Date(endISO).getTime() - new Date(startISO).getTime()) / 3_600_000;
      expect(hours).toBe(23);
    });

    it("spans 25 hours across the fall-back day", () => {
      // 2026-11-01: America/New_York gains an hour at 02:00.
      const { startISO, endISO } = allDayRange("2026-11-01", NY);
      expect(startISO).toBe("2026-11-01T04:00:00.000Z"); // EDT
      expect(endISO).toBe("2026-11-02T05:00:00.000Z"); // EST
      const hours =
        (new Date(endISO).getTime() - new Date(startISO).getTime()) / 3_600_000;
      expect(hours).toBe(25);
    });

    it("still round-trips to the right day on both transition days", () => {
      for (const key of ["2026-03-08", "2026-11-01"]) {
        const { startISO } = allDayRange(key, NY);
        expect(toDateKeyInTimezone(new Date(startISO), NY)).toBe(key);
      }
    });
  });
});

describe("addDaysToDateKey", () => {
  it("does plain calendar arithmetic", () => {
    expect(addDaysToDateKey("2026-09-15", 1)).toBe("2026-09-16");
    expect(addDaysToDateKey("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDaysToDateKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToDateKey("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("crosses a DST boundary without drifting", () => {
    // Adding 24h to an instant would land on the wrong day here; date-key
    // arithmetic is immune because it never touches clocks.
    expect(addDaysToDateKey("2026-03-08", 1)).toBe("2026-03-09");
    expect(addDaysToDateKey("2026-11-01", 1)).toBe("2026-11-02");
  });

  it("handles leap years", () => {
    expect(addDaysToDateKey("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDaysToDateKey("2026-02-28", 1)).toBe("2026-03-01");
  });
});
