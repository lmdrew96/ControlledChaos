import { describe, it, expect } from "vitest";
import packageJson from "../../../package.json";
import { CHANGELOG, LATEST_VERSION, compareVersions, formatEntryDate } from "@/lib/changelog";

describe("compareVersions", () => {
  it("orders by major, then minor, then patch", () => {
    expect(compareVersions("2.10.0", "2.9.9")).toBeGreaterThan(0);
    expect(compareVersions("2.70.15", "2.73.0")).toBeLessThan(0);
    expect(compareVersions("2.73.1", "2.73.1")).toBe(0);
  });
});

describe("CHANGELOG", () => {
  it("is newest-first with no duplicate versions", () => {
    for (let i = 1; i < CHANGELOG.length; i++) {
      expect(compareVersions(CHANGELOG[i - 1].version, CHANGELOG[i].version)).toBeGreaterThan(0);
    }
  });

  it("covers the shipped package version", () => {
    expect(LATEST_VERSION).toBe(packageJson.version);
  });

  it("has a title and at least one change per entry", () => {
    for (const entry of CHANGELOG) {
      expect(entry.title.trim()).not.toBe("");
      expect(entry.changes.length).toBeGreaterThan(0);
    }
  });
});

describe("formatEntryDate", () => {
  it("never shifts the date", () => {
    expect(formatEntryDate("2026-09-25")).toBe("Sep 25, 2026");
  });
});
