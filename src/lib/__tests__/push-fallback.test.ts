import { describe, it, expect, vi, beforeEach } from "vitest";

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
  getSessionsStartingBetween: vi.fn(),
}));

const callHaiku = vi.fn();
vi.mock("@/lib/ai", () => ({ callHaiku }));

const { generatePushMessage } = await import("@/lib/notifications/triggers");

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
    { type: "scheduled" as const, taskTitle: "Fellowship essay" },
    { type: "scheduled_missed" as const, taskTitle: "Fellowship essay" },
    {
      type: "target_reminder" as const,
      taskTitle: "Fellowship essay",
      minutesUntil: 600,
      at: new Date("2026-09-14T01:00:00Z"),
    },
  ];

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
