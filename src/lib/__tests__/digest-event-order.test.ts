import { describe, it, expect } from "vitest";

/**
 * Mirrors sortEventsForDisplay / eventTimeLabel in send-email.ts. Those are
 * module-private helpers on a file that pulls in Resend and the DB at import
 * time, so the ordering contract is pinned here rather than imported.
 */
type Ev = { title: string; startTime: Date; isAllDay: boolean | null };

const sortEventsForDisplay = (events: Ev[]): Ev[] =>
  [...events].sort((a, b) => {
    if (a.isAllDay && !b.isAllDay) return -1;
    if (!a.isAllDay && b.isAllDay) return 1;
    return a.startTime.getTime() - b.startTime.getTime();
  });

const at = (iso: string) => new Date(iso);

describe("digest event ordering", () => {
  it("puts all-day events ahead of timed ones regardless of stored midnight", () => {
    // The 2026-09-08 morning brief, as it should have rendered.
    const events: Ev[] = [
      { title: "Psych lecture", startTime: at("2026-09-08T11:00:00Z"), isAllDay: false },
      { title: "Flea comb Nugget", startTime: at("2026-09-08T00:00:00Z"), isAllDay: true },
      { title: "Advising", startTime: at("2026-09-08T13:00:00Z"), isAllDay: false },
      { title: "Bio lab", startTime: at("2026-09-08T14:20:00Z"), isAllDay: false },
    ];

    expect(sortEventsForDisplay(events).map((e) => e.title)).toEqual([
      "Flea comb Nugget",
      "Psych lecture",
      "Advising",
      "Bio lab",
    ]);
  });

  it("keeps timed events chronological", () => {
    const events: Ev[] = [
      { title: "late", startTime: at("2026-09-08T18:00:00Z"), isAllDay: false },
      { title: "early", startTime: at("2026-09-08T08:00:00Z"), isAllDay: false },
    ];
    expect(sortEventsForDisplay(events).map((e) => e.title)).toEqual(["early", "late"]);
  });

  it("treats a null isAllDay as timed", () => {
    const events: Ev[] = [
      { title: "unflagged", startTime: at("2026-09-08T09:00:00Z"), isAllDay: null },
      { title: "allday", startTime: at("2026-09-08T00:00:00Z"), isAllDay: true },
    ];
    expect(sortEventsForDisplay(events).map((e) => e.title)).toEqual(["allday", "unflagged"]);
  });

  it("does not mutate the input array", () => {
    const events: Ev[] = [
      { title: "b", startTime: at("2026-09-08T18:00:00Z"), isAllDay: false },
      { title: "a", startTime: at("2026-09-08T08:00:00Z"), isAllDay: false },
    ];
    sortEventsForDisplay(events);
    expect(events.map((e) => e.title)).toEqual(["b", "a"]);
  });
});
