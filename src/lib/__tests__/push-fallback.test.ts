import { describe, it, expect, vi, beforeEach } from "vitest";

// triggers.ts pulls in the db layer at module load, which throws without
// DATABASE_URL. Same shim the other trigger tests use.
vi.mock("@/lib/db/queries", () => ({
  getRecentNotifications: vi.fn(),
  getLastTaskCompletion: vi.fn(),
  getPendingTasks: vi.fn(),
  getRecentTaskActivity: vi.fn(),
  getCalendarEventsByDateRange: vi.fn(),
  getCurrentLocation: vi.fn(),
  getSavedLocations: vi.fn(),
  getCommuteTimes: vi.fn(),
  getSessionsStartingBetween: vi.fn(),
}));

const callHaiku = vi.fn();
vi.mock("@/lib/ai", () => ({ callHaiku }));

const { generatePushMessage, eventReminderIntervals } = await import("@/lib/notifications/triggers");

/**
 * Pushes arrive titled only "ControlledChaos", so copy that says "this"
 * without naming the task has no referent (reported 2026-09-13: "you've got
 * this scheduled for 3pm"). Whatever the AI does, the fallbacks must name it.
 */
describe("generatePushMessage fallbacks name the task", () => {
  beforeEach(() => {
    callHaiku.mockReset();
    // The throw path logs the error on purpose; keep it out of test output.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  const cases = [
    { type: "scheduled" as const, taskTitle: "Fellowship essay", at: new Date("2026-09-13T19:00:00Z") },
    {
      type: "target_reminder" as const,
      taskTitle: "Fellowship essay",
      minutesUntil: 600,
      at: new Date("2026-09-14T01:00:00Z"),
    },
  ];

  it("tells the writer the alerting task's sitting and deadline", async () => {
    callHaiku.mockResolvedValue({ text: "Fellowship essay time — it's a 25-minute sitting." });
    await generatePushMessage(
      {
        type: "scheduled",
        taskTitle: "Fellowship essay",
        at: new Date("2026-09-13T19:00:00Z"),
        sessionMinutes: 25,
        estimatedMinutes: 90,
        deadline: new Date("2026-09-16T03:59:00Z"),
        targetDate: null,
      },
      null,
      "America/New_York"
    );
    const userMsg: string = callHaiku.mock.calls[0][0].user;
    expect(userMsg).toContain("Planned start (user's local time)");
    expect(userMsg).toContain("This session: 25 minutes");
    expect(userMsg).toContain("Estimated time for the whole task: 1 hour 30 minutes");
    expect(userMsg).toContain("Hard deadline (user's local time)");
    expect(userMsg).not.toContain("Soft self-set target");
  });

  for (const ctx of cases) {
    it(`${ctx.type}: names the task when the AI call throws`, async () => {
      callHaiku.mockImplementation(async () => {
        throw new Error("boom");
      });
      const msg = await generatePushMessage(ctx);
      expect(msg).toContain("Fellowship essay");
    });

    it(`${ctx.type}: names the task when the AI returns nothing usable`, async () => {
      callHaiku.mockResolvedValue({ text: "   " });
      const msg = await generatePushMessage(ctx);
      expect(msg).toContain("Fellowship essay");
    });
  }
});

describe("tentative events", () => {
  const oneOff = { seriesId: null, source: "controlledchaos", title: "Open mic" };
  const ladder = [1440, 60, 10];

  it("get exactly one rung: the largest same-day one", () => {
    expect(eventReminderIntervals({ ...oneOff, isTentative: true }, ladder)).toEqual([60]);
    expect(eventReminderIntervals({ ...oneOff, isTentative: true }, [1440, 120, 30])).toEqual([120]);
  });

  it("fall back to the day-before rung when it's the only one", () => {
    expect(eventReminderIntervals({ ...oneOff, isTentative: true }, [1440])).toEqual([1440]);
  });

  it("stay silent when event reminders are off", () => {
    expect(eventReminderIntervals({ ...oneOff, isTentative: true }, [])).toEqual([]);
  });

  it("leave mandatory events on the full ladder", () => {
    expect(eventReminderIntervals({ ...oneOff, isTentative: false }, ladder)).toEqual(ladder);
  });

  const ctx = {
    type: "event_reminder" as const,
    eventTitle: "Open mic",
    minutesUntil: 60,
    at: new Date("2026-09-27T22:00:00Z"), // 6 PM ET
    tentative: true,
  };

  it("tell the writer it's a maybe", async () => {
    callHaiku.mockResolvedValue({ text: "Open mic is on at 6 if you feel like it." });
    await generatePushMessage(ctx, null, "America/New_York");
    const userMsg: string = callHaiku.mock.calls.at(-1)![0].user;
    expect(userMsg).toContain("Commitment: TENTATIVE");
  });

  it("fall back to invitational copy, not a countdown", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    callHaiku.mockImplementation(async () => {
      throw new Error("boom");
    });
    const msg = await generatePushMessage(ctx, null, "America/New_York");
    expect(msg).toBe("Open mic is on at 6:00 PM if you feel like it.");
  });
});
