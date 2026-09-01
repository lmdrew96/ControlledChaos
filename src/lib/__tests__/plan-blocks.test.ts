import { describe, it, expect } from "vitest";
import {
  DEFAULT_PLAN_BLOCK_MINUTES,
  planBlockMinutes,
  planBlockEnd,
  todayPlanningWindow,
  isPlanBlockCurrent,
  planBlocksAsBusyIntervals,
  planBlocksAsBusy,
  eventsAsBusyIntervals,
  findConflict,
  type BusyInterval,
} from "@/lib/calendar/plan-blocks";

const NY = "America/New_York"; // UTC-4 in September (EDT)
const SYD = "Australia/Sydney"; // UTC+10 in September (AEST)

describe("planBlockMinutes / planBlockEnd", () => {
  it("falls back to the shared default when a task has no estimate", () => {
    expect(planBlockMinutes(null)).toBe(DEFAULT_PLAN_BLOCK_MINUTES);
    expect(planBlockMinutes(45)).toBe(45);
  });

  it("derives the block end from the estimate", () => {
    const start = new Date("2026-09-01T15:00:00Z");
    expect(planBlockEnd(start, 45).toISOString()).toBe("2026-09-01T15:45:00.000Z");
    expect(planBlockEnd(start, null).toISOString()).toBe("2026-09-01T15:30:00.000Z");
  });
});

describe("todayPlanningWindow — today only, now until bedtime", () => {
  it("starts from now when the day is already underway", () => {
    // 12:00 EDT on 1 Sep
    const now = new Date("2026-09-01T16:00:00Z");
    const w = todayPlanningWindow(NY, 7, 22, now);
    expect(w).not.toBeNull();
    expect(w!.start.toISOString()).toBe(now.toISOString());
    // 22:00 EDT the same day
    expect(w!.end.toISOString()).toBe("2026-09-02T02:00:00.000Z");
  });

  it("starts at wake time when planning before the day begins", () => {
    // 04:00 EDT — a 4am planning session still plans from wake, not from now
    const now = new Date("2026-09-01T08:00:00Z");
    const w = todayPlanningWindow(NY, 7, 22, now);
    expect(w!.start.toISOString()).toBe("2026-09-01T11:00:00.000Z"); // 07:00 EDT
  });

  it("returns null once the sleep hour has passed", () => {
    // 23:00 EDT, sleep hour was 22:00 — nothing left to plan today
    const now = new Date("2026-09-02T03:00:00Z");
    expect(todayPlanningWindow(NY, 7, 22, now)).toBeNull();
  });

  it("is computed in the user's timezone, not the server's", () => {
    // Same instant: 12:00 in Sydney, 22:00 the previous day in New York.
    const now = new Date("2026-09-01T02:00:00Z");

    const syd = todayPlanningWindow(SYD, 7, 22, now);
    expect(syd).not.toBeNull();
    expect(syd!.end.toISOString()).toBe("2026-09-01T12:00:00.000Z"); // 22:00 AEST

    // In New York that same instant is 22:00 on 31 Aug — the window has closed.
    expect(todayPlanningWindow(NY, 7, 22, now)).toBeNull();
  });
});

describe("isPlanBlockCurrent — plans do not survive the night", () => {
  it("keeps a block scheduled later today", () => {
    const now = new Date("2026-09-01T16:00:00Z"); // 12:00 EDT
    expect(isPlanBlockCurrent(new Date("2026-09-01T20:00:00Z"), NY, now)).toBe(true);
  });

  it("keeps a block from earlier today, so the day stays readable", () => {
    const now = new Date("2026-09-01T20:00:00Z");
    expect(isPlanBlockCurrent(new Date("2026-09-01T13:00:00Z"), NY, now)).toBe(true);
  });

  it("drops a block from a previous day", () => {
    const now = new Date("2026-09-01T16:00:00Z");
    expect(isPlanBlockCurrent(new Date("2026-08-31T18:00:00Z"), NY, now)).toBe(false);
  });

  it("uses the user's local midnight, not UTC midnight", () => {
    // 02:00 UTC on 1 Sep is still 22:00 on 31 Aug in New York. A block at that
    // instant belongs to yesterday for a NY user and must be dropped, even
    // though the UTC date already rolled over.
    const now = new Date("2026-09-01T16:00:00Z");
    expect(isPlanBlockCurrent(new Date("2026-09-01T02:00:00Z"), NY, now)).toBe(false);
  });
});

describe("planBlocksAsBusyIntervals", () => {
  it("turns committed plans into busy time so a second run cannot double-book", () => {
    const intervals = planBlocksAsBusyIntervals([
      {
        id: "t1",
        title: "Read chapter 2",
        scheduledFor: "2026-09-01T18:00:00Z",
        estimatedMinutes: 60,
      },
    ]);

    expect(intervals).toHaveLength(1);
    expect(intervals[0].startTime).toBe("2026-09-01T18:00:00.000Z");
    expect(intervals[0].endTime).toBe("2026-09-01T19:00:00.000Z");
    expect(intervals[0].isAllDay).toBe(false);
  });

  it("ignores tasks with no planned time", () => {
    expect(
      planBlocksAsBusyIntervals([
        { id: "t2", title: "Unplanned", scheduledFor: null, estimatedMinutes: 30 },
      ])
    ).toHaveLength(0);
  });
});

describe("findConflict", () => {
  const busy: BusyInterval[] = [
    { startMs: Date.parse("2026-09-01T14:00:00Z"), endMs: Date.parse("2026-09-01T15:00:00Z"), label: "Lecture" },
    { startMs: Date.parse("2026-09-01T16:00:00Z"), endMs: Date.parse("2026-09-01T16:30:00Z"), label: "Read ch. 4", taskId: "task-a" },
  ];

  const at = (start: string, end: string) =>
    findConflict(Date.parse(start), Date.parse(end), busy);

  it("returns null for a slot that touches nothing", () => {
    expect(at("2026-09-01T12:00:00Z", "2026-09-01T13:00:00Z")).toBeNull();
  });

  it("treats back-to-back blocks as clear, not conflicting", () => {
    expect(at("2026-09-01T13:00:00Z", "2026-09-01T14:00:00Z")).toBeNull();
    expect(at("2026-09-01T15:00:00Z", "2026-09-01T16:00:00Z")).toBeNull();
  });

  it("catches a partial overlap at either edge", () => {
    expect(at("2026-09-01T13:30:00Z", "2026-09-01T14:30:00Z")?.label).toBe("Lecture");
    expect(at("2026-09-01T14:30:00Z", "2026-09-01T15:30:00Z")?.label).toBe("Lecture");
  });

  it("catches a slot fully inside a busy interval, and one that swallows it", () => {
    expect(at("2026-09-01T14:15:00Z", "2026-09-01T14:45:00Z")?.label).toBe("Lecture");
    expect(at("2026-09-01T13:00:00Z", "2026-09-01T18:00:00Z")?.label).toBe("Lecture");
  });

  it("reports a collision with another task's committed plan block", () => {
    expect(at("2026-09-01T16:10:00Z", "2026-09-01T16:40:00Z")?.label).toBe("Read ch. 4");
  });

  it("lets a task move within its own block without self-conflicting", () => {
    const conflict = findConflict(
      Date.parse("2026-09-01T16:10:00Z"),
      Date.parse("2026-09-01T16:40:00Z"),
      busy,
      { ignoreTaskId: "task-a" }
    );
    expect(conflict).toBeNull();
  });
});

describe("eventsAsBusyIntervals", () => {
  it("ignores all-day events, which never occupy a slot", () => {
    const intervals = eventsAsBusyIntervals([
      { title: "Reading day", startTime: "2026-09-01T04:00:00Z", endTime: "2026-09-02T04:00:00Z", isAllDay: true },
      { title: "Lecture", startTime: "2026-09-01T14:00:00Z", endTime: "2026-09-01T15:00:00Z", isAllDay: false },
    ]);
    expect(intervals.map((i) => i.label)).toEqual(["Lecture"]);
  });

  it("recovers the task id from a plan block round-tripped through the event shape", () => {
    const [interval] = eventsAsBusyIntervals([
      { title: "Read ch. 4", startTime: "2026-09-01T16:00:00Z", endTime: "2026-09-01T16:30:00Z", externalId: "plan-task-a" },
    ]);
    expect(interval.taskId).toBe("task-a");
  });

  it("leaves taskId undefined for a real calendar event", () => {
    const [interval] = eventsAsBusyIntervals([
      { title: "Lecture", startTime: "2026-09-01T14:00:00Z", endTime: "2026-09-01T15:00:00Z", externalId: "canvas-123" },
    ]);
    expect(interval.taskId).toBeUndefined();
  });
});

describe("planBlocksAsBusy", () => {
  it("uses the default block length when a task has no estimate", () => {
    const [interval] = planBlocksAsBusy([
      { id: "t1", title: "Untimed", scheduledFor: "2026-09-01T16:00:00Z", estimatedMinutes: null },
    ]);
    expect(interval.endMs - interval.startMs).toBe(DEFAULT_PLAN_BLOCK_MINUTES * 60_000);
    expect(interval.taskId).toBe("t1");
  });

  it("skips tasks that have no planned start", () => {
    expect(
      planBlocksAsBusy([{ id: "t1", title: "Unplanned", scheduledFor: null, estimatedMinutes: 30 }])
    ).toEqual([]);
  });
});
