import { describe, it, expect } from "vitest";
import {
  planBlocksAsBusy,
  planBlocksAsBusyIntervals,
  findConflict,
  DEFAULT_PLAN_BLOCK_MINUTES,
  type PlanBlockSource,
} from "@/lib/calendar/plan-blocks";

/**
 * A task can be planned across several sittings, so a plan block's identity is
 * its SESSION, not its task. These cover the two places that distinction
 * actually bites: unique keys, and per-sitting durations.
 */

const AT_9 = "2026-09-15T13:00:00.000Z";
const AT_2 = "2026-09-15T18:00:00.000Z";

function block(over: Partial<PlanBlockSource> = {}): PlanBlockSource {
  return {
    id: "task-1",
    title: "Write the essay",
    scheduledFor: AT_9,
    estimatedMinutes: 60,
    ...over,
  };
}

describe("plan blocks with multiple sittings", () => {
  it("gives two sittings of one task distinct block ids", () => {
    const blocks = planBlocksAsBusyIntervals([
      block({ sessionId: "s1", scheduledFor: AT_9 }),
      block({ sessionId: "s2", scheduledFor: AT_2 }),
    ]);

    expect(blocks).toHaveLength(2);
    expect(blocks[0].id).not.toBe(blocks[1].id);
    // ...while both still point back at the same task.
    expect(blocks[0].externalId).toBe("plan-task-1");
    expect(blocks[1].externalId).toBe("plan-task-1");
  });

  it("falls back to the task id when there is no session (legacy rows)", () => {
    const [only] = planBlocksAsBusyIntervals([block()]);
    expect(only.id).toBe("plan-task-1");
  });

  it("uses the sitting's own length when one is set", () => {
    const [busy] = planBlocksAsBusy([
      block({ sessionId: "s1", estimatedMinutes: 180, sessionMinutes: 45 }),
    ]);
    expect((busy.endMs - busy.startMs) / 60_000).toBe(45);
  });

  it("falls back to the task estimate when the sitting has no length", () => {
    const [busy] = planBlocksAsBusy([
      block({ sessionId: "s1", estimatedMinutes: 90, sessionMinutes: null }),
    ]);
    expect((busy.endMs - busy.startMs) / 60_000).toBe(90);
  });

  it("falls back to the default when neither is set", () => {
    const [busy] = planBlocksAsBusy([
      block({ sessionId: "s1", estimatedMinutes: null, sessionMinutes: null }),
    ]);
    expect((busy.endMs - busy.startMs) / 60_000).toBe(
      DEFAULT_PLAN_BLOCK_MINUTES
    );
  });

  it("keeps the task id on every sitting, so a move can ignore its own blocks", () => {
    const busy = planBlocksAsBusy([
      block({ sessionId: "s1", scheduledFor: AT_9 }),
      block({ sessionId: "s2", scheduledFor: AT_2 }),
    ]);
    expect(busy.every((b) => b.taskId === "task-1")).toBe(true);
  });

  describe("conflict checking across sittings", () => {
    const busy = planBlocksAsBusy([
      block({ sessionId: "s1", scheduledFor: AT_9, estimatedMinutes: 60 }),
    ]);
    const startMs = new Date(AT_9).getTime();
    const endMs = startMs + 60 * 60_000;

    it("lets a task move onto its own slot when replacing its plan", () => {
      expect(findConflict(startMs, endMs, busy, { ignoreTaskId: "task-1" })).toBeNull();
    });

    it("blocks a SECOND sitting landing on top of the first", () => {
      // The add path deliberately does not pass ignoreTaskId — otherwise a
      // task could be planned on top of itself.
      const conflict = findConflict(startMs, endMs, busy, {});
      expect(conflict).not.toBeNull();
      expect(conflict?.label).toBe("Write the essay");
    });

    it("allows a second sitting at a different time", () => {
      const laterStart = new Date(AT_2).getTime();
      expect(
        findConflict(laterStart, laterStart + 60 * 60_000, busy, {})
      ).toBeNull();
    });
  });
});
