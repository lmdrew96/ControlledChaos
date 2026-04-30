import { describe, it, expect } from "vitest";
import {
  assembleRecapEntries,
  type AssembleInput,
} from "../recap/assemble";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const T0 = new Date("2026-04-15T09:00:00Z"); // 9:00 UTC
const T1 = new Date("2026-04-15T11:30:00Z"); // 11:30 UTC
const T2 = new Date("2026-04-15T14:15:00Z"); // 14:15 UTC
const T3 = new Date("2026-04-15T18:45:00Z"); // 18:45 UTC
const T4 = new Date("2026-04-15T21:00:00Z"); // 21:00 UTC

function emptyInput(): AssembleInput {
  return {
    tasks: [],
    events: [],
    dumps: [],
    journal: [],
    moments: [],
    medLogs: [],
    medLookup: new Map(),
  };
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

describe("assembleRecapEntries — ordering", () => {
  it("returns an empty array for empty input", () => {
    expect(assembleRecapEntries(emptyInput())).toEqual([]);
  });

  it("sorts all kinds together reverse-chronologically", () => {
    const input: AssembleInput = {
      ...emptyInput(),
      tasks: [{ id: "t1", title: "Essay", category: "school", completedAt: T1 }],
      events: [
        {
          id: "e1",
          title: "Lecture",
          location: null,
          startTime: T0,
          endTime: new Date(T0.getTime() + 3_600_000),
          isAllDay: false,
        },
      ],
      moments: [
        {
          id: "m1",
          type: "energy_low",
          intensity: 2,
          note: null,
          occurredAt: T3,
        },
        {
          id: "m2",
          type: "energy_high",
          intensity: 4,
          note: null,
          occurredAt: T2,
        },
      ],
      dumps: [
        {
          id: "d1",
          inputType: "text",
          aiResponse: { summary: "A short thought" },
          createdAt: T4,
        },
      ],
    };

    const entries = assembleRecapEntries(input);

    // Expect reverse-chronological by `at` timestamp
    const order = entries.map((e) => e.id);
    expect(order).toEqual(["d1", "m1", "m2", "t1", "e1"]);
  });

  it("handles two entries at the same timestamp without crashing", () => {
    const sameInstant = new Date("2026-04-15T12:00:00Z");
    const input: AssembleInput = {
      ...emptyInput(),
      moments: [
        { id: "a", type: "focus_start", intensity: null, note: null, occurredAt: sameInstant },
        { id: "b", type: "focus_start", intensity: null, note: null, occurredAt: sameInstant },
      ],
    };
    const entries = assembleRecapEntries(input);
    expect(entries).toHaveLength(2);
    expect(entries[0].at).toBe(entries[1].at);
  });
});

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

describe("assembleRecapEntries — typeFilters", () => {
  const input: AssembleInput = {
    ...emptyInput(),
    tasks: [{ id: "t1", title: "T", category: null, completedAt: T0 }],
    events: [
      {
        id: "e1",
        title: "E",
        location: null,
        startTime: T1,
        endTime: T2,
        isAllDay: false,
      },
    ],
    moments: [
      {
        id: "m1",
        type: "tough_moment",
        intensity: 3,
        note: null,
        occurredAt: T3,
      },
    ],
  };

  it("omitted filter includes all kinds", () => {
    const out = assembleRecapEntries(input);
    expect(out.map((e) => e.kind).sort()).toEqual(["event", "moment", "task"]);
  });

  it("filter to a single kind excludes all others", () => {
    const out = assembleRecapEntries({ ...input, typeFilters: ["moment"] });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("moment");
  });

  it("filter to a subset includes only those kinds", () => {
    const out = assembleRecapEntries({
      ...input,
      typeFilters: ["task", "event"],
    });
    expect(out.map((e) => e.kind).sort()).toEqual(["event", "task"]);
  });

  it("empty-array filter returns no entries (defensive)", () => {
    const out = assembleRecapEntries({ ...input, typeFilters: [] });
    // `typeFilters: []` is a valid explicit "show nothing" state —
    // callers should typically omit the field to mean "all kinds"
    // (see `want()` in getRecapDay). Keep behavior predictable.
    expect(out).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Edge shapes
// ---------------------------------------------------------------------------

describe("assembleRecapEntries — edge cases", () => {
  it("skips tasks without a completedAt (shouldn't happen, defensive)", () => {
    const out = assembleRecapEntries({
      ...emptyInput(),
      tasks: [{ id: "t1", title: "Stray", category: null, completedAt: null }],
    });
    expect(out).toEqual([]);
  });

  it("skips medication logs whose medication isn't in the lookup", () => {
    const out = assembleRecapEntries({
      ...emptyInput(),
      medLogs: [{ id: "log1", medicationId: "mystery", takenAt: T2 }],
      medLookup: new Map(), // mystery not found
    });
    expect(out).toEqual([]);
  });

  it("extracts summary from aiResponse; null when missing or invalid", () => {
    const out = assembleRecapEntries({
      ...emptyInput(),
      dumps: [
        { id: "d1", inputType: "text", aiResponse: { summary: "A" }, createdAt: T1 },
        { id: "d2", inputType: "text", aiResponse: null, createdAt: T2 },
        { id: "d3", inputType: "text", aiResponse: "not an object", createdAt: T3 },
        { id: "d4", inputType: "text", aiResponse: { summary: 42 }, createdAt: T4 },
      ],
    });
    expect(out.find((e) => e.id === "d1")).toMatchObject({ summary: "A" });
    expect(out.find((e) => e.id === "d2")).toMatchObject({ summary: null });
    expect(out.find((e) => e.id === "d3")).toMatchObject({ summary: null });
    expect(out.find((e) => e.id === "d4")).toMatchObject({ summary: null });
  });
});
