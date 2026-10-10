import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { CrisisDetectionResult } from "@/types";

// An in-memory notifications table: the mocked push writes to it, and the
// REAL hasEverBeenNotified reads from it, so the dedup path is the one prod runs.
type Row = { type: string; content: unknown; sentAt: Date };
let sent: Row[] = [];

vi.mock("@/lib/db/queries", () => ({
  getRecentNotifications: async () => [...sent].reverse(),
  createNotification: vi.fn(),
}));

const sendPushToUser = vi.fn(
  async (_userId: string, payload: { tag?: string; dedupKeys?: string[] }) => {
    sent.push({
      type: "push",
      content: { dedupKey: payload.tag, dedupKeys: payload.dedupKeys },
      sentAt: new Date(),
    });
    return true;
  }
);
vi.mock("@/lib/notifications/send-push", () => ({ sendPushToUser }));

vi.mock("@/lib/notifications/triggers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/notifications/triggers")>()),
  generatePushMessage: async () => "Already working on this?",
}));

const { sendCrisisNotification, crisisTaskSetKey } = await import(
  "@/lib/crisis-detection/cron-handler"
);

const TZ = "America/New_York";
// 11:20 EDT on 10/6, when LING 202 got five pings.
const NOW = new Date("2026-10-06T15:20:00Z");

const ctx = {
  userId: "u1",
  timezone: TZ,
  tier: "nudge",
  personalityPrefs: null,
  notificationPrefs: null,
  assertivenessMode: "balanced",
  getSnapshot: async () => undefined,
  appPushRefusal: () => null,
} as unknown as Parameters<typeof sendCrisisNotification>[2];

const result = (taskIds: string[]) =>
  ({
    involvedTaskIds: taskIds,
    involvedTaskNames: taskIds.map((id) => `Task ${id}`),
  }) as unknown as CrisisDetectionResult;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  sent = [];
  sendPushToUser.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("crisis_detected push dedup across detection rows", () => {
  it("sends once when a new detection row has the same task set the same day", async () => {
    expect(await sendCrisisNotification("det-1", result(["a", "b"]), ctx)).toBe(true);
    vi.setSystemTime(new Date(NOW.getTime() + 10 * 60_000));
    // Flapped: resolved and re-created with a fresh id, tasks listed in another order.
    expect(await sendCrisisNotification("det-2", result(["b", "a"]), ctx)).toBe(false);
    expect(sendPushToUser).toHaveBeenCalledTimes(1);
  });

  it("still pushes for a genuinely different task set", async () => {
    await sendCrisisNotification("det-1", result(["a", "b"]), ctx);
    expect(await sendCrisisNotification("det-2", result(["a", "c"]), ctx)).toBe(true);
    expect(sendPushToUser).toHaveBeenCalledTimes(2);
  });

  it("pushes again for the same task set on the next local day", async () => {
    await sendCrisisNotification("det-1", result(["a"]), ctx);
    vi.setSystemTime(new Date("2026-10-07T13:00:00Z")); // 9am EDT next day
    expect(await sendCrisisNotification("det-2", result(["a"]), ctx)).toBe(true);
  });

  it("keeps each row's own check-in link on the push it sends", async () => {
    await sendCrisisNotification("det-1", result(["a"]), ctx);
    expect(sendPushToUser.mock.calls[0][1]).toMatchObject({ url: "/crisis?checkin=det-1" });
  });
});

describe("crisisTaskSetKey", () => {
  it("ignores order and duplicates", () => {
    expect(crisisTaskSetKey(["b", "a", "a"], "2026-10-06")).toBe(
      crisisTaskSetKey(["a", "b"], "2026-10-06")
    );
  });
});
