import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getRecentNotifications = vi.fn();
vi.mock("@/lib/db/queries", () => ({
  getRecentNotifications: (...args: unknown[]) => getRecentNotifications(...args),
  getLastTaskCompletion: vi.fn(),
  getPendingTasks: vi.fn(),
  getRecentTaskActivity: vi.fn(),
  getCalendarEventsByDateRange: vi.fn(),
  getUserLocation: vi.fn(),
  getSavedLocations: vi.fn(),
  getCommuteTimes: vi.fn(),
  isLocationStale: vi.fn(),
}));

const { getNotifiedDedupKeys } = await import("@/lib/notifications/triggers");

const TZ = "America/New_York";
// Noon EDT — comfortably inside the local day, so "today" is unambiguous.
const NOW = new Date("2026-09-01T16:00:00Z");

function notif(content: unknown, sentAt: Date) {
  return { type: "push", content, sentAt };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  getRecentNotifications.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("getNotifiedDedupKeys", () => {
  it("collects the single-key form used before clustering existed", async () => {
    getRecentNotifications.mockResolvedValue([
      notif({ dedupKey: "deadline-a" }, NOW),
    ]);
    const { ever, today } = await getNotifiedDedupKeys("u1", TZ);
    expect(ever.has("deadline-a")).toBe(true);
    expect(today.has("deadline-a")).toBe(true);
  });

  it("collects every key a clustered push spoke for", async () => {
    // The whole point: one push covering three alerts must suppress all three.
    getRecentNotifications.mockResolvedValue([
      notif(
        {
          dedupKey: "deadline-hw",
          dedupKeys: ["deadline-hw", "event-latn101", "event-lab"],
        },
        NOW
      ),
    ]);
    const { ever } = await getNotifiedDedupKeys("u1", TZ);
    expect(ever.has("deadline-hw")).toBe(true);
    expect(ever.has("event-latn101")).toBe(true);
    expect(ever.has("event-lab")).toBe(true);
  });

  it("keeps yesterday's keys out of the today set but in the ever set", async () => {
    const yesterday = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
    getRecentNotifications.mockResolvedValue([
      notif({ dedupKey: "old", dedupKeys: ["old", "older"] }, yesterday),
    ]);
    const { ever, today } = await getNotifiedDedupKeys("u1", TZ);
    expect(ever.has("old")).toBe(true);
    expect(ever.has("older")).toBe(true);
    expect(today.has("old")).toBe(false);
    expect(today.has("older")).toBe(false);
  });

  it("ignores rows with no content or no keys", async () => {
    getRecentNotifications.mockResolvedValue([
      notif(null, NOW),
      notif({}, NOW),
      notif({ title: "no keys here" }, NOW),
    ]);
    const { ever, today } = await getNotifiedDedupKeys("u1", TZ);
    expect(ever.size).toBe(0);
    expect(today.size).toBe(0);
  });

  it("ignores non-string entries inside dedupKeys", async () => {
    getRecentNotifications.mockResolvedValue([
      notif({ dedupKeys: ["good", 42, null, { a: 1 }] }, NOW),
    ]);
    const { ever } = await getNotifiedDedupKeys("u1", TZ);
    expect([...ever]).toEqual(["good"]);
  });

  it("reads the whole history in a single query", async () => {
    getRecentNotifications.mockResolvedValue([]);
    await getNotifiedDedupKeys("u1", TZ);
    expect(getRecentNotifications).toHaveBeenCalledTimes(1);
  });
});
