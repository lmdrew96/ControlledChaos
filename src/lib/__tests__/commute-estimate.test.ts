import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/queries", () => ({
  getSavedLocations: vi.fn(),
  getUserSettings: vi.fn(),
  replaceCommuteTimes: vi.fn(),
}));

const { chooseCommute, SHORT_HOP_METERS } = await import("@/lib/calendar/commute-estimate");

describe("chooseCommute", () => {
  it("walks short hops whatever the travel mode", () => {
    expect(chooseCommute(800, 120, "driving")).toEqual({ mode: "walking", minutes: 10 });
    expect(chooseCommute(SHORT_HOP_METERS - 1, 60, "cycling").mode).toBe("walking");
  });

  it("uses the travel mode from 1 km up", () => {
    expect(chooseCommute(SHORT_HOP_METERS, 180, "driving")).toEqual({ mode: "driving", minutes: 3 });
    expect(chooseCommute(5000, 600, "cycling")).toEqual({ mode: "cycling", minutes: 20 });
    expect(chooseCommute(2500, 300, "walking")).toEqual({ mode: "walking", minutes: 30 });
  });

  it("drives on OSRM's duration, not on distance", () => {
    expect(chooseCommute(20_000, 25 * 60, "driving").minutes).toBe(25);
  });

  it("stretches straight-line distance when OSRM couldn't route the pair", () => {
    // 10 km straight → 13 km of road at 40 km/h = 19.5 → 20 min
    expect(chooseCommute(10_000, null, "driving")).toEqual({ mode: "driving", minutes: 20 });
    // 500 m straight → 650 m walked at 5 km/h = 7.8 → 8 min
    expect(chooseCommute(500, null, "driving")).toEqual({ mode: "walking", minutes: 8 });
  });

  it("never stores a zero-minute commute", () => {
    expect(chooseCommute(10, 5, "driving").minutes).toBe(1);
  });
});
