import { describe, it, expect } from "vitest";
import {
  travelBuffers,
  commuteContextFrom,
  shortestCommuteMinutes,
  inferCurrentLocation,
} from "@/lib/calendar/commute-buffers";
import { startOfDayInTimezone } from "@/lib/timezone";

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

describe("inferCurrentLocation", () => {
  const withHome = saved.map((l) => ({ ...l, isHome: l.id === "home" }));
  const dayStart = at("00:00");
  const where = (
    events: ReturnType<typeof ev>[],
    now: string,
    locs: Array<{ id: string; name: string; isHome?: boolean }> = withHome
  ) =>
    inferCurrentLocation(events, locs, at(now), dayStart)?.id ?? null;

  it("is the event's location while it's happening", () => {
    expect(where([ev("09:00", "10:00", "Smith Hall Rm 2")], "09:30")).toBe("smith");
  });

  it("stays there for 2 hours after the event ends, then goes unknown", () => {
    const events = [ev("09:00", "10:00", "Smith Hall")];
    expect(where(events, "12:00")).toBe("smith");
    expect(where(events, "12:01")).toBeNull();
  });

  it("is home before the first located event of the day", () => {
    expect(where([ev("09:00", "10:00", "Smith Hall")], "08:00")).toBe("home");
    expect(where([], "08:00")).toBe("home");
  });

  it("is unknown before the first event when no location is marked home", () => {
    expect(where([], "08:00", saved)).toBeNull();
  });

  it("is unknown when the latest event is somewhere unrecognised", () => {
    const events = [ev("09:00", "10:00", "Smith Hall"), ev("10:30", "11:00", "Coffee Shop")];
    expect(where(events, "10:45")).toBeNull();
  });

  it("ignores all-day and location-less events", () => {
    const events = [ev("00:00", "23:59", "Gym", true), ev("09:00", "10:00", null)];
    expect(where(events, "09:30")).toBe("home");
  });

  it("uses the latest started event when two overlap", () => {
    const events = [ev("09:00", "12:00", "Smith Hall"), ev("10:00", "10:30", "Gym")];
    expect(where(events, "10:15")).toBe("gym");
  });

  it("counts an event as today by the user's local day, not UTC", () => {
    // 02:00Z on 9/28 is 22:00 on 9/27 in New York but 11:00 on 9/28 in Tokyo.
    const events = [ev("01:00", "02:00", "Smith Hall")];
    const now = at("02:30");
    const ny = startOfDayInTimezone(now, "America/New_York");
    const tokyo = startOfDayInTimezone(now, "Asia/Tokyo");
    expect(inferCurrentLocation(events, withHome, now, ny)?.id).toBe("smith");
    expect(inferCurrentLocation(events, withHome, now, tokyo)?.id).toBe("smith");
    // At 08:00Z it's 04:00 on 9/28 in New York: a new local day with no
    // located event yet → home. In Tokyo it's 17:00, the same day the event
    // ended 6h ago → unknown.
    const later = at("08:00");
    const nyLater = startOfDayInTimezone(later, "America/New_York");
    const tokyoLater = startOfDayInTimezone(later, "Asia/Tokyo");
    expect(inferCurrentLocation(events, withHome, later, nyLater)?.id).toBe("home");
    expect(inferCurrentLocation(events, withHome, later, tokyoLater)).toBeNull();
  });
});
