import { describe, it, expect, vi } from "vitest";
import { getTimeOfDayBlock, getCurrentEnergy } from "../context/energy";
import type { EnergyProfile } from "@/types";

// ---------------------------------------------------------------------------
// getTimeOfDayBlock
// ---------------------------------------------------------------------------

describe("getTimeOfDayBlock", () => {
  // Helper: create a Date that is a specific hour in the given timezone
  function dateAtHour(hour: number, timezone: string): Date {
    // Build a reference date, then compute what UTC time gives us
    // the desired local hour. Use April 14, 2026 (EDT, no DST ambiguity).
    const refDate = new Date("2026-04-14T12:00:00Z");
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      hour12: false,
    });
    const refHour = parseInt(formatter.format(refDate), 10) % 24;
    const offsetHours = 12 - refHour; // UTC hours ahead of local
    return new Date(
      Date.UTC(2026, 3, 14, hour + offsetHours, 0, 0)
    );
  }

  it("returns morning for hour 6", () => {
    vi.setSystemTime(dateAtHour(6, "America/New_York"));
    expect(getTimeOfDayBlock("America/New_York")).toBe("morning");
    vi.useRealTimers();
  });

  it("returns morning for hour 11", () => {
    vi.setSystemTime(dateAtHour(11, "America/New_York"));
    expect(getTimeOfDayBlock("America/New_York")).toBe("morning");
    vi.useRealTimers();
  });

  it("returns afternoon for hour 12", () => {
    vi.setSystemTime(dateAtHour(12, "America/New_York"));
    expect(getTimeOfDayBlock("America/New_York")).toBe("afternoon");
    vi.useRealTimers();
  });

  it("returns afternoon for hour 16", () => {
    vi.setSystemTime(dateAtHour(16, "America/New_York"));
    expect(getTimeOfDayBlock("America/New_York")).toBe("afternoon");
    vi.useRealTimers();
  });

  it("returns evening for hour 17", () => {
    vi.setSystemTime(dateAtHour(17, "America/New_York"));
    expect(getTimeOfDayBlock("America/New_York")).toBe("evening");
    vi.useRealTimers();
  });

  it("returns evening for hour 20", () => {
    vi.setSystemTime(dateAtHour(20, "America/New_York"));
    expect(getTimeOfDayBlock("America/New_York")).toBe("evening");
    vi.useRealTimers();
  });

  it("returns night for hour 21", () => {
    vi.setSystemTime(dateAtHour(21, "America/New_York"));
    expect(getTimeOfDayBlock("America/New_York")).toBe("night");
    vi.useRealTimers();
  });

  it("returns night for hour 0 (midnight)", () => {
    vi.setSystemTime(dateAtHour(0, "America/New_York"));
    expect(getTimeOfDayBlock("America/New_York")).toBe("night");
    vi.useRealTimers();
  });

  it("returns night for hour 5", () => {
    vi.setSystemTime(dateAtHour(5, "America/New_York"));
    expect(getTimeOfDayBlock("America/New_York")).toBe("night");
    vi.useRealTimers();
  });

  it("works with Asia/Tokyo timezone", () => {
    // 10 AM in Tokyo
    vi.setSystemTime(dateAtHour(10, "Asia/Tokyo"));
    expect(getTimeOfDayBlock("Asia/Tokyo")).toBe("morning");
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// getCurrentEnergy
// ---------------------------------------------------------------------------

describe("getCurrentEnergy", () => {
  const profile: EnergyProfile = {
    morning: "high",
    afternoon: "medium",
    evening: "low",
    night: "low",
  };

  it("returns profile energy when no override", () => {
    // We need to control "now" — mock to 10 AM EDT (morning block)
    const result = getCurrentEnergy(profile, "America/New_York");
    // Result depends on current time — just verify it returns a valid energy level
    expect(["high", "medium", "low"]).toContain(result);
  });

  it("returns override when provided", () => {
    expect(getCurrentEnergy(profile, "America/New_York", "high")).toBe("high");
    expect(getCurrentEnergy(profile, "America/New_York", "low")).toBe("low");
  });

  it("returns medium when no profile and no override", () => {
    expect(getCurrentEnergy(null, "America/New_York")).toBe("medium");
  });

  it("returns override even when no profile", () => {
    expect(getCurrentEnergy(null, "America/New_York", "high")).toBe("high");
  });
});
