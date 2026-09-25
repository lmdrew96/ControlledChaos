import { describe, it, expect } from "vitest";
import { matchEventLocationToSavedLocation } from "@/lib/notifications/triggers";

const saved = [
  { id: "home", name: "Home" },
  { id: "smith", name: "Smith Hall" },
  { id: "campus", name: "Campus" },
];

describe("matchEventLocationToSavedLocation", () => {
  it("matches a saved name inside a longer event location", () => {
    expect(matchEventLocationToSavedLocation("Smith Hall Room 101", saved)?.id).toBe("smith");
    expect(matchEventLocationToSavedLocation("smith hall, rm 2", saved)?.id).toBe("smith");
  });

  it("matches an event location that is part of a saved name", () => {
    expect(
      matchEventLocationToSavedLocation("Library", [{ id: "lib", name: "Morris Library" }])?.id
    ).toBe("lib");
  });

  it("does not match inside another word", () => {
    expect(matchEventLocationToSavedLocation("Homework Lab", saved)).toBeNull();
    expect(matchEventLocationToSavedLocation("Smith Hallway", saved)).toBeNull();
  });

  it("handles regex characters in names and empty input", () => {
    expect(
      matchEventLocationToSavedLocation("Room (B) 12", [{ id: "b", name: "Room (B)" }])?.id
    ).toBe("b");
    expect(matchEventLocationToSavedLocation("  ", saved)).toBeNull();
    expect(matchEventLocationToSavedLocation(null, saved)).toBeNull();
  });
});
