import { describe, it, expect } from "vitest";
import { parseTaskUpdate } from "@/lib/db/task-update-fields";

describe("parseTaskUpdate", () => {
  describe("forbidden fields", () => {
    // The whole point of the allowlist: these must never reach .set().
    const forbidden = [
      ["deletedAt", new Date().toISOString()],
      ["createdAt", new Date().toISOString()],
      ["updatedAt", new Date().toISOString()],
      ["userId", "user_someoneelse"],
      ["id", "00000000-0000-0000-0000-000000000000"],
      ["sourceEventId", "canvas-event-123"],
      ["sourceDumpId", "00000000-0000-0000-0000-000000000000"],
      ["snoozedUntil", new Date().toISOString()],
    ] as const;

    for (const [field, value] of forbidden) {
      it(`rejects ${field}`, () => {
        const result = parseTaskUpdate({ [field]: value });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain(field);
      });
    }

    it("rejects a forbidden field even when mixed with valid ones", () => {
      const result = parseTaskUpdate({
        title: "Still a legit edit",
        deletedAt: new Date().toISOString(),
      });
      expect(result.ok).toBe(false);
    });

    it("rejects unrecognized keys outright", () => {
      const result = parseTaskUpdate({ notAColumn: true });
      expect(result.ok).toBe(false);
    });
  });

  describe("allowed fields", () => {
    it("passes through the task-detail-modal payload shape", () => {
      const result = parseTaskUpdate({
        title: "Read Ch 4",
        description: "Textbook reading",
        priority: "normal",
        energyLevel: "medium",
        category: "school",
        locationTags: ["home"],
        estimatedMinutes: 30,
        deadline: "2026-09-05T16:00:00.000Z",
        targetDate: "2026-09-03T16:00:00.000Z",
        scheduledFor: "2026-09-01T16:05:00.000Z",
        status: "pending",
        goalId: null,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.title).toBe("Read Ch 4");
      expect(result.data.deadline).toBeInstanceOf(Date);
      expect(result.data.targetDate).toBeInstanceOf(Date);
      expect(result.data.scheduledFor).toBeInstanceOf(Date);
      expect(result.data.locationTags).toEqual(["home"]);
    });

    it("accepts the task-card status-only payload", () => {
      const result = parseTaskUpdate({ status: "completed" });
      expect(result.ok).toBe(true);
    });

    it("accepts the step-advance payload", () => {
      const result = parseTaskUpdate({ currentStepIndex: 2 });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.currentStepIndex).toBe(2);
    });
  });

  describe("coercion", () => {
    it("turns empty strings and nulls into null for clearable fields", () => {
      const result = parseTaskUpdate({
        deadline: null,
        targetDate: "",
        scheduledFor: null,
        description: "",
        estimatedMinutes: null,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.deadline).toBeNull();
      expect(result.data.targetDate).toBeNull();
      expect(result.data.scheduledFor).toBeNull();
      expect(result.data.description).toBeNull();
      expect(result.data.estimatedMinutes).toBeNull();
    });

    it("normalizes an empty locationTags array to null", () => {
      const result = parseTaskUpdate({ locationTags: [] });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.locationTags).toBeNull();
    });

    it("rejects an unparseable date rather than writing Invalid Date", () => {
      const result = parseTaskUpdate({ deadline: "next tuesday-ish" });
      expect(result.ok).toBe(false);
    });

    it("rejects an empty title", () => {
      const result = parseTaskUpdate({ title: "   " });
      expect(result.ok).toBe(false);
    });

    it("rejects a non-object body", () => {
      expect(parseTaskUpdate("nope").ok).toBe(false);
      expect(parseTaskUpdate([{ title: "x" }]).ok).toBe(false);
      expect(parseTaskUpdate(null).ok).toBe(false);
    });
  });
});
