import { describe, it, expect, vi } from "vitest";

// triggers.ts pulls in the db layer at module load, which throws without
// DATABASE_URL. Same shim the other trigger tests use.
vi.mock("@/lib/db/queries", () => ({
  getRecentNotifications: vi.fn(),
  getLastTaskCompletion: vi.fn(),
  getPendingTasks: vi.fn(),
  getRecentTaskActivity: vi.fn(),
  getCalendarEventsByDateRange: vi.fn(),
  getUserLocation: vi.fn(),
  getSavedLocations: vi.fn(),
  getCommuteTimes: vi.fn(),
  isLocationStale: vi.fn(),
}));

const { formatReminderInterval } = await import("@/lib/notifications/triggers");

/**
 * This formatter used to only receive the configured reminder BANDS
 * (1440/60/10), so it only handled exact day/hour multiples. It now receives
 * real time-remaining — an arbitrary number of minutes — because describing a
 * 2-hours-away deadline as "1 day" is what made held-overnight notifications
 * say "tomorrow" about something due the same morning.
 */
describe("formatReminderInterval", () => {
  it("still renders the exact band values the settings UI offers", () => {
    expect(formatReminderInterval(1440)).toBe("1 day");
    expect(formatReminderInterval(2880)).toBe("2 days");
    expect(formatReminderInterval(60)).toBe("1 hour");
    expect(formatReminderInterval(180)).toBe("3 hours");
    expect(formatReminderInterval(10)).toBe("10 minutes");
    expect(formatReminderInterval(1)).toBe("1 minute");
  });

  it("renders arbitrary sub-day durations instead of rounding up to a day", () => {
    expect(formatReminderInterval(540)).toBe("9 hours");
    expect(formatReminderInterval(127)).toBe("2 hours 7 minutes");
    expect(formatReminderInterval(61)).toBe("1 hour 1 minute");
    expect(formatReminderInterval(59)).toBe("59 minutes");
  });

  it("drops trailing minutes once the span is measured in days", () => {
    expect(formatReminderInterval(1445)).toBe("1 day");
    expect(formatReminderInterval(1500)).toBe("1 day 1 hour");
  });

  it("handles the boundary where the moment has effectively arrived", () => {
    expect(formatReminderInterval(0)).toBe("less than a minute");
    expect(formatReminderInterval(0.4)).toBe("less than a minute");
    expect(formatReminderInterval(-5)).toBe("less than a minute");
  });
});
