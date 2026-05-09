import { describe, it, expect } from "vitest";
import { toEndOfDayLocal } from "@/lib/calendar/canvas-helpers";

describe("toEndOfDayLocal — Canvas all-day assignment regression", () => {
  // node-ical parses VALUE=DATE entries to midnight UTC of that calendar day.
  // For an assignment "due May 9" we must build May 9 23:59 in the user's tz,
  // NOT May 8 23:59 (which is what reading parts in NY tz would produce, since
  // 2026-05-09T00:00:00Z is May 8 8pm EDT).

  it("EDT: May 9 all-day → May 9 23:59 EDT (03:59 UTC May 10)", () => {
    const allDay = new Date("2026-05-09T00:00:00Z");
    const result = toEndOfDayLocal(allDay, "America/New_York");
    expect(result.toISOString()).toBe("2026-05-10T03:59:00.000Z");
  });

  it("EST (winter): Jan 15 all-day → Jan 15 23:59 EST (04:59 UTC Jan 16)", () => {
    const allDay = new Date("2026-01-15T00:00:00Z");
    const result = toEndOfDayLocal(allDay, "America/New_York");
    expect(result.toISOString()).toBe("2026-01-16T04:59:00.000Z");
  });

  it("PT: Mar 1 all-day → Mar 1 23:59 PST (07:59 UTC Mar 2)", () => {
    const allDay = new Date("2026-03-01T00:00:00Z");
    const result = toEndOfDayLocal(allDay, "America/Los_Angeles");
    expect(result.toISOString()).toBe("2026-03-02T07:59:00.000Z");
  });

  it("does not shift the calendar day backwards in westward timezones", () => {
    const allDay = new Date("2026-05-09T00:00:00Z");
    const result = toEndOfDayLocal(allDay, "America/New_York");
    const day = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      day: "2-digit",
    }).format(result);
    expect(day).toBe("09");
  });
});
