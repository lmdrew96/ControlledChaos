import { describe, it, expect } from "vitest";
import {
  getTimezoneOffsetMs,
  getCalendarParts,
  getHourInTimezone,
  startOfDayInTimezone,
  todayInTimezone,
  startOfWeekInTimezone,
  toUTC,
  toUserLocal,
  formatForDisplay,
  DISPLAY_DATE,
  DISPLAY_TIME,
  DISPLAY_DATETIME,
  DISPLAY_FULL_DATETIME,
} from "../timezone";

// ---------------------------------------------------------------------------
// getTimezoneOffsetMs
// ---------------------------------------------------------------------------

describe("getTimezoneOffsetMs", () => {
  it("returns 0 for UTC", () => {
    const date = new Date("2026-07-01T12:00:00Z");
    expect(getTimezoneOffsetMs(date, "UTC")).toBe(0);
  });

  it("returns +4h for America/New_York during EDT (summer)", () => {
    // July 1 is EDT (UTC-4). The round-trip method returns UTC repr - TZ repr,
    // which is positive when TZ is behind UTC.
    const date = new Date("2026-07-01T12:00:00Z");
    expect(getTimezoneOffsetMs(date, "America/New_York")).toBe(4 * 3_600_000);
  });

  it("returns +5h for America/New_York during EST (winter)", () => {
    // January 1 is EST (UTC-5)
    const date = new Date("2026-01-01T12:00:00Z");
    expect(getTimezoneOffsetMs(date, "America/New_York")).toBe(5 * 3_600_000);
  });

  it("returns -5:30 for Asia/Kolkata", () => {
    const date = new Date("2026-07-01T12:00:00Z");
    expect(getTimezoneOffsetMs(date, "Asia/Kolkata")).toBe(-5.5 * 3_600_000);
  });
});

// ---------------------------------------------------------------------------
// getCalendarParts
// ---------------------------------------------------------------------------

describe("getCalendarParts", () => {
  it("returns zero-padded parts in the given timezone", () => {
    // 2026-04-14 03:00 UTC = 2026-04-13 23:00 EDT
    const date = new Date("2026-04-14T03:00:00Z");
    const parts = getCalendarParts(date, "America/New_York");
    expect(parts).toEqual({ year: "2026", month: "04", day: "13" });
  });

  it("returns same day for UTC", () => {
    const date = new Date("2026-04-14T03:00:00Z");
    const parts = getCalendarParts(date, "UTC");
    expect(parts).toEqual({ year: "2026", month: "04", day: "14" });
  });
});

// ---------------------------------------------------------------------------
// getHourInTimezone
// ---------------------------------------------------------------------------

describe("getHourInTimezone", () => {
  it("returns correct hour for America/New_York during EDT", () => {
    // 2026-04-14 17:00 UTC = 2026-04-14 13:00 EDT
    const date = new Date("2026-04-14T17:00:00Z");
    expect(getHourInTimezone(date, "America/New_York")).toBe(13);
  });

  it("returns correct hour for Asia/Tokyo", () => {
    // 2026-04-14 17:00 UTC = 2026-04-15 02:00 JST (UTC+9)
    const date = new Date("2026-04-14T17:00:00Z");
    expect(getHourInTimezone(date, "Asia/Tokyo")).toBe(2);
  });

  it("handles midnight boundary", () => {
    // 2026-04-14 04:00 UTC = 2026-04-14 00:00 EDT
    const date = new Date("2026-04-14T04:00:00Z");
    expect(getHourInTimezone(date, "America/New_York")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// startOfDayInTimezone
// ---------------------------------------------------------------------------

describe("startOfDayInTimezone", () => {
  it("returns T04:00:00Z for America/New_York during EDT", () => {
    // Any time on April 14 EDT should return midnight EDT = 04:00 UTC
    const date = new Date("2026-04-14T15:30:00Z"); // 11:30 AM EDT
    const result = startOfDayInTimezone(date, "America/New_York");
    expect(result.toISOString()).toBe("2026-04-14T04:00:00.000Z");
  });

  it("returns T00:00:00Z for UTC", () => {
    const date = new Date("2026-04-14T15:30:00Z");
    const result = startOfDayInTimezone(date, "UTC");
    expect(result.toISOString()).toBe("2026-04-14T00:00:00.000Z");
  });

  it("handles date rollback near midnight UTC", () => {
    // 2026-04-14 03:00 UTC = April 13 23:00 EDT → start of April 13
    const date = new Date("2026-04-14T03:00:00Z");
    const result = startOfDayInTimezone(date, "America/New_York");
    expect(result.toISOString()).toBe("2026-04-13T04:00:00.000Z");
  });

  it("handles DST spring forward (March 8, 2026)", () => {
    // March 8, 2026: clocks spring forward at 2 AM EST → 3 AM EDT
    // Midnight is still EST (UTC-5) on that day
    const date = new Date("2026-03-08T12:00:00Z"); // 8 AM EDT
    const result = startOfDayInTimezone(date, "America/New_York");
    expect(result.toISOString()).toBe("2026-03-08T05:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// todayInTimezone
// ---------------------------------------------------------------------------

describe("todayInTimezone", () => {
  it("returns YYYY-MM-DD format", () => {
    const result = todayInTimezone("America/New_York");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// startOfWeekInTimezone
// ---------------------------------------------------------------------------

describe("startOfWeekInTimezone", () => {
  it("returns a Monday at midnight in the given timezone", () => {
    const result = startOfWeekInTimezone("America/New_York");
    // The result should be a Monday
    const dayName = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
    }).format(result);
    expect(dayName).toBe("Mon");

    // The hour in the timezone should be 0
    expect(getHourInTimezone(result, "America/New_York")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// toUTC
// ---------------------------------------------------------------------------

describe("toUTC", () => {
  it("converts local 9 AM EDT to 1 PM UTC", () => {
    // April 14, 2026 is EDT (UTC-4)
    const result = toUTC("2026-04-14T09:00:00", "America/New_York");
    expect(result).toBe("2026-04-14T13:00:00.000Z");
  });

  it("strips trailing Z and treats as local time", () => {
    const result = toUTC("2026-04-14T09:00:00Z", "America/New_York");
    expect(result).toBe("2026-04-14T13:00:00.000Z");
  });

  it("strips +offset and treats as local time", () => {
    const result = toUTC("2026-04-14T09:00:00+05:00", "America/New_York");
    expect(result).toBe("2026-04-14T13:00:00.000Z");
  });

  it("returns empty string for empty input", () => {
    expect(toUTC("", "America/New_York")).toBe("");
  });

  it("returns input unchanged for invalid date format", () => {
    expect(toUTC("not-a-date", "America/New_York")).toBe("not-a-date");
  });

  it("handles date-only input (no time part)", () => {
    // Treats as midnight local time
    const result = toUTC("2026-04-14", "America/New_York");
    expect(result).toBe("2026-04-14T04:00:00.000Z");
  });

  it("handles Asia/Kolkata (+5:30)", () => {
    // 9 AM IST = 3:30 AM UTC
    const result = toUTC("2026-04-14T09:00:00", "Asia/Kolkata");
    expect(result).toBe("2026-04-14T03:30:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// toUserLocal
// ---------------------------------------------------------------------------

describe("toUserLocal", () => {
  it("decomposes UTC date into EDT local fields", () => {
    // 2026-04-14 13:00 UTC = 9:00 AM EDT
    const date = new Date("2026-04-14T13:00:00Z");
    const local = toUserLocal(date, "America/New_York");
    expect(local).toEqual({
      year: 2026,
      month: 4,
      day: 14,
      hour: 9,
      minute: 0,
      second: 0,
    });
  });

  it("handles midnight boundary crossing", () => {
    // 2026-04-14 03:30 UTC = April 13, 11:30 PM EDT
    const date = new Date("2026-04-14T03:30:00Z");
    const local = toUserLocal(date, "America/New_York");
    expect(local).toEqual({
      year: 2026,
      month: 4,
      day: 13,
      hour: 23,
      minute: 30,
      second: 0,
    });
  });

  it("handles UTC timezone (no shift)", () => {
    const date = new Date("2026-04-14T13:45:30Z");
    const local = toUserLocal(date, "UTC");
    expect(local).toEqual({
      year: 2026,
      month: 4,
      day: 14,
      hour: 13,
      minute: 45,
      second: 30,
    });
  });
});

// ---------------------------------------------------------------------------
// formatForDisplay
// ---------------------------------------------------------------------------

describe("formatForDisplay", () => {
  const date = new Date("2026-04-14T17:30:00Z"); // 1:30 PM EDT

  it("formats with DISPLAY_TIME", () => {
    const result = formatForDisplay(date, "America/New_York", DISPLAY_TIME);
    expect(result).toMatch(/1:30\sPM/);
  });

  it("formats with DISPLAY_DATE", () => {
    const result = formatForDisplay(date, "America/New_York", DISPLAY_DATE);
    expect(result).toContain("Apr");
    expect(result).toContain("14");
  });

  it("formats with DISPLAY_DATETIME", () => {
    const result = formatForDisplay(date, "America/New_York", DISPLAY_DATETIME);
    expect(result).toContain("Tue");
    expect(result).toContain("Apr");
    expect(result).toMatch(/1:30\sPM/);
  });

  it("formats with DISPLAY_FULL_DATETIME", () => {
    const result = formatForDisplay(date, "America/New_York", DISPLAY_FULL_DATETIME);
    expect(result).toContain("Tuesday");
    expect(result).toContain("April");
    expect(result).toContain("2026");
  });

  it("uses DISPLAY_DATETIME as default", () => {
    const result = formatForDisplay(date, "America/New_York");
    expect(result).toContain("Tue");
    expect(result).toContain("Apr");
  });
});
