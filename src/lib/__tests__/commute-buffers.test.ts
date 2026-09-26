import { describe, it, expect } from "vitest";
import {
  travelBuffers,
  commuteContextFrom,
  shortestCommuteMinutes,
} from "@/lib/calendar/commute-buffers";

const saved = [
  { id: "home", name: "Home" },
  { id: "smith", name: "Smith Hall" },
  { id: "gym", name: "Gym" },
];
const commutes = [
  { fromLocationId: "home", toLocationId: "smith", travelMinutes: 20 },
  { fromLocationId: "home", toLocationId: "smith", travelMinutes: 35 }, // slower mode
  { fromLocationId: "smith", toLocationId: "home", travelMinutes: 20 },
  { fromLocationId: "smith", toLocationId: "gym", travelMinutes: 10 },
];

const at = (hhmm: string) => new Date(`2026-09-28T${hhmm}:00Z`);
const ev = (start: string, end: string, location: string | null, isAllDay = false) => ({
  startTime: at(start),
  endTime: at(end),
  location,
  isAllDay,
});

describe("shortestCommuteMinutes", () => {
  it("takes the fastest mode and returns null when none is saved", () => {
    expect(shortestCommuteMinutes("home", "smith", commutes)).toBe(20);
    expect(shortestCommuteMinutes("gym", "home", commutes)).toBeNull();
  });
});

describe("travelBuffers", () => {
  it("blocks the commute before an event at a different location", () => {
    const buffers = travelBuffers(
      [ev("09:00", "10:00", "Smith Hall Rm 2"), ev("12:00", "13:00", "Home")],
      saved,
      commutes
    );
    expect(buffers).toHaveLength(1);
    expect(buffers[0].start).toEqual(at("11:40"));
    expect(buffers[0].end).toEqual(at("12:00"));
    expect(buffers[0].destination).toBe("Home");
  });

  it("never reaches back before the previous event ended", () => {
    const [b] = travelBuffers(
      [ev("09:00", "10:00", "Smith Hall"), ev("10:05", "11:00", "Gym")],
      saved,
      commutes
    );
    expect(b.start).toEqual(at("10:00"));
    expect(b.end).toEqual(at("10:05"));
  });

  it("adds nothing for same place, no commute, or unknown in-between locations", () => {
    expect(travelBuffers([ev("09:00", "10:00", "Smith Hall"), ev("11:00", "12:00", "Smith Hall")], saved, commutes)).toEqual([]);
    expect(travelBuffers([ev("09:00", "10:00", "Gym"), ev("11:00", "12:00", "Home")], saved, commutes)).toEqual([]);
    expect(
      travelBuffers(
        [ev("09:00", "10:00", "Home"), ev("10:30", "11:00", "Dentist, 12 Main St"), ev("12:00", "13:00", "Smith Hall")],
        saved,
        commutes
      )
    ).toEqual([]);
  });

  it("carries the location across events that have none, without overlapping them", () => {
    const [b] = travelBuffers(
      [ev("09:00", "10:00", "Home"), ev("10:00", "11:50", null), ev("12:00", "13:00", "Smith Hall")],
      saved,
      commutes
    );
    expect(b.start).toEqual(at("11:50"));
    expect(b.end).toEqual(at("12:00"));
  });

  it("seeds the first hop from the current location, floored at now", () => {
    const [b] = travelBuffers([ev("09:00", "10:00", "Smith Hall")], saved, commutes, {
      startLocationId: "home",
      now: at("08:50"),
    });
    expect(b.start).toEqual(at("08:50"));
    expect(b.end).toEqual(at("09:00"));
  });

  it("ignores all-day events", () => {
    expect(
      travelBuffers([ev("00:00", "23:59", "Gym", true), ev("12:00", "13:00", "Smith Hall")], saved, commutes, {
        startLocationId: "home",
      })
    ).toHaveLength(1);
  });
});

describe("commuteContextFrom", () => {
  it("lists one leg per reachable destination", () => {
    expect(commuteContextFrom("smith", saved, commutes)).toEqual([
      { to: "Home", minutes: 20 },
      { to: "Gym", minutes: 10 },
    ]);
    expect(commuteContextFrom(null, saved, commutes)).toEqual([]);
  });
});
