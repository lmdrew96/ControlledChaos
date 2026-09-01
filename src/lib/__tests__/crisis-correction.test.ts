import { describe, it, expect } from "vitest";
import { resolveCorrection } from "@/lib/ai/crisis-correction";

const NY = "America/New_York"; // UTC-4 in September (EDT)
const SYD = "Australia/Sydney"; // UTC+10 in September (AEST)

describe("resolveCorrection — the screenshot scenario", () => {
  it("moves a self-imposed date off the hard deadline", () => {
    // "I set those deadlines for myself. Everything just needs to be done by
    // the end of the week."
    const r = resolveCorrection(
      {
        hasHardDeadline: true,
        hardDeadline: "2026-09-04T17:00:00",
        selfImposedDeadline: "2026-09-01T23:59:00",
        summary: "Tonight was self-imposed; the real one is Friday 5pm.",
      },
      NY
    );

    expect(r.apply).toBe(true);
    expect(r.deadline?.toISOString()).toBe("2026-09-04T21:00:00.000Z"); // 17:00 EDT
    expect(r.targetDate?.toISOString()).toBe("2026-09-02T03:59:00.000Z"); // 23:59 EDT
    expect(r.summary).toContain("self-imposed");
  });

  it("clears the hard deadline entirely when there is no external one", () => {
    // "These are all just personal studying for class, no hard deadlines."
    const r = resolveCorrection(
      {
        hasHardDeadline: false,
        selfImposedDeadline: "2026-09-01T22:00:00",
        summary: "No external deadline — personal study time.",
      },
      NY
    );

    expect(r.apply).toBe(true);
    expect(r.deadline).toBeNull();
    expect(r.targetDate).not.toBeNull();
  });

  it("drops the self-imposed date too when the user abandons it", () => {
    const r = resolveCorrection(
      { hasHardDeadline: false, summary: "Not working on this tonight." },
      NY
    );

    expect(r.apply).toBe(true);
    expect(r.deadline).toBeNull();
    expect(r.targetDate).toBeNull();
  });
});

describe("resolveCorrection — refuses to erase a real deadline", () => {
  it("writes NOTHING when a hard deadline is claimed but unparseable", () => {
    // Writing here would null out a genuine deadline on the strength of a
    // malformed string — the most damaging thing this feature could do.
    const r = resolveCorrection(
      {
        hasHardDeadline: true,
        hardDeadline: "next Friday",
        summary: "Real deadline is next Friday.",
      },
      NY
    );

    expect(r.apply).toBe(false);
    expect(r.reason).toBe("unparseable_hard_deadline");
  });

  it("writes nothing when a hard deadline is claimed but omitted", () => {
    const r = resolveCorrection(
      { hasHardDeadline: true, summary: "There is a real deadline." },
      NY
    );
    expect(r.apply).toBe(false);
    expect(r.reason).toBe("unparseable_hard_deadline");
  });

  it("still clears when hasHardDeadline is explicitly false — that is not a failure", () => {
    const r = resolveCorrection(
      { hasHardDeadline: false, hardDeadline: "garbage", summary: "None." },
      NY
    );
    expect(r.apply).toBe(true);
    expect(r.deadline).toBeNull();
  });
});

describe("resolveCorrection — defensive parsing", () => {
  it("survives a missing or malformed tool input", () => {
    expect(resolveCorrection(undefined, NY).apply).toBe(true);
    expect(resolveCorrection(null, NY).deadline).toBeNull();
    expect(resolveCorrection({}, NY).apply).toBe(true);
  });

  it("falls back to a generic summary rather than throwing", () => {
    expect(resolveCorrection({ hasHardDeadline: false }, NY).summary).toBe(
      "Deadline updated."
    );
    expect(
      resolveCorrection({ hasHardDeadline: false, summary: "   " }, NY).summary
    ).toBe("Deadline updated.");
  });

  it("ignores a non-boolean hasHardDeadline rather than trusting it", () => {
    // "true" as a string must not be read as true — that would let a sloppy
    // tool call claim a deadline exists and block a legitimate clear.
    const r = resolveCorrection(
      { hasHardDeadline: "true", summary: "x" },
      NY
    );
    expect(r.apply).toBe(true);
    expect(r.deadline).toBeNull();
  });
});

describe("resolveCorrection — timezone correctness", () => {
  it("interprets the model's local clock time in the USER's timezone", () => {
    const input = {
      hasHardDeadline: true,
      hardDeadline: "2026-09-04T17:00:00",
      summary: "Friday 5pm.",
    };

    // Same wall-clock string, two users, two different instants.
    expect(resolveCorrection(input, NY).deadline?.toISOString()).toBe(
      "2026-09-04T21:00:00.000Z"
    );
    expect(resolveCorrection(input, SYD).deadline?.toISOString()).toBe(
      "2026-09-04T07:00:00.000Z"
    );
  });
});
