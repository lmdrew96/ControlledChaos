import { describe, it, expect, vi, beforeEach } from "vitest";

const callHaiku = vi.fn();
vi.mock("@/lib/ai", () => ({ callHaiku }));

const { parseBrainDump } = await import("@/lib/ai/parse-dump");

function respond(body: unknown) {
  callHaiku.mockResolvedValueOnce({ text: JSON.stringify(body) });
}

const context = {
  existingGoals: [{ title: "Run a 5K" }],
  existingTasks: [],
};

describe("parseBrainDump — new goals", () => {
  beforeEach(() => callHaiku.mockReset());

  it("keeps one new goal and lets its tasks link to it", async () => {
    respond({
      tasks: [
        { title: "Email advisor about tutoring", priority: "normal", energyLevel: "low", goalConnection: "raise my gpa to 3.5" },
      ],
      events: [],
      goals: [
        { title: "Raise my GPA to 3.5", description: "Scholarship renewal", targetDate: "2026-12-15" },
        { title: "Second goal", description: "should be dropped" },
      ],
      summary: "ok",
    });
    const result = await parseBrainDump("dump", "text", "America/New_York", context);
    expect(result.goals).toEqual([
      { title: "Raise my GPA to 3.5", description: "Scholarship renewal", targetDate: "2026-12-15T00:00:00.000Z" },
    ]);
    // Matched case-insensitively, stored with the goal's own casing.
    expect(result.tasks[0].goalConnection).toBe("Raise my GPA to 3.5");
  });

  it("drops a goal that repeats an existing one, and a malformed target day", async () => {
    respond({
      tasks: [],
      events: [],
      goals: [{ title: "run a 5k" }],
      summary: "ok",
    });
    expect((await parseBrainDump("dump", "text", "America/New_York", context)).goals).toEqual([]);

    respond({
      tasks: [],
      events: [],
      goals: [{ title: "Learn Romanian", targetDate: "next spring" }],
      summary: "ok",
    });
    const result = await parseBrainDump("dump", "text", "America/New_York", context);
    expect(result.goals).toEqual([{ title: "Learn Romanian", description: undefined, targetDate: undefined }]);
  });

  it("still discards a goalConnection that names no real or new goal", async () => {
    respond({
      tasks: [{ title: "Stretch", priority: "normal", energyLevel: "low", goalConnection: "Get flexible" }],
      events: [],
      summary: "ok",
    });
    const result = await parseBrainDump("dump", "text", "America/New_York", context);
    expect(result.goals).toEqual([]);
    expect(result.tasks[0].goalConnection).toBeUndefined();
  });
});
