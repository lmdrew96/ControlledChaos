import { describe, expect, it } from "vitest";
import { buildDayTimeline, type TimelineInput } from "./day-timeline";

// Wed Oct 14 2026, America/New_York (UTC-4): strip 7 AM – 10 PM local.
const at = (hhmm: string) => new Date(`2026-10-14T${hhmm}:00-04:00`);
const dayStart = at("07:00");
const dayEnd = at("22:00");

const item = (id: string, from: string, to: string, kind: TimelineInput["kind"] = "event"): TimelineInput => ({
  id,
  title: id,
  start: at(from),
  end: at(to),
  kind,
});

const oct14: TimelineInput[] = [
  item("PSYC", "10:20", "11:15"),
  item("CGSC", "12:40", "13:35"),
  item("LATN", "13:50", "14:45"),
  item("Pamoja", "15:30", "16:50", "planned"),
  item("sit-in", "17:20", "18:40", "tentative"),
  item("Voces", "18:00", "20:00", "tentative"),
];

describe("buildDayTimeline", () => {
  const now = at("09:28");
  const { items, gaps, lanes } = buildDayTimeline(oct14, dayStart, dayEnd, now);

  it("stacks overlapping tentative events into a second lane", () => {
    expect(lanes).toBe(2);
    expect(items.find((i) => i.id === "Voces")?.lane).toBe(1);
    expect(items.find((i) => i.id === "PSYC")?.lane).toBe(0);
  });

  it("finds forward gaps of 30+ minutes and counts tentative time as free", () => {
    expect(gaps.map((g) => g.minutes)).toEqual([52, 85, 45, 310]);
  });

  it("places items as percentages of the strip", () => {
    const psyc = items.find((i) => i.id === "PSYC")!;
    expect(psyc.leftPct).toBeCloseTo((200 / 900) * 100);
    expect(psyc.widthPct).toBeCloseTo((55 / 900) * 100);
  });

  it("drops items outside the strip and clips ones that cross it", () => {
    const { items: clipped } = buildDayTimeline(
      [item("early", "05:00", "06:00"), item("late", "21:30", "23:30")],
      dayStart,
      dayEnd,
      now
    );
    expect(clipped.map((i) => i.id)).toEqual(["late"]);
    expect(clipped[0].leftPct + clipped[0].widthPct).toBeCloseTo(100);
  });

  it("has no gaps once the day is over", () => {
    expect(buildDayTimeline(oct14, dayStart, dayEnd, at("22:30")).gaps).toEqual([]);
  });
});
