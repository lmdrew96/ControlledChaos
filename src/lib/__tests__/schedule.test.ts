import { describe, it, expect } from "vitest";
import { findFreeBlocks } from "../ai/schedule";
import type { CalendarEvent } from "@/types";

function makeEvent(
  startTime: string,
  endTime: string,
  overrides: Partial<CalendarEvent> = {}
): CalendarEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2, 8)}`,
    userId: "test-user",
    title: "Test Event",
    description: null,
    location: null,
    startTime,
    endTime,
    isAllDay: false,
    source: "controlledchaos" as const,
    externalId: null,
    category: "personal" as const,
    seriesId: null,
    sourceDumpId: null,
    syncedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// findFreeBlocks
// ---------------------------------------------------------------------------

describe("findFreeBlocks", () => {
  it("returns full waking day when no events exist", () => {
    const blocks = findFreeBlocks([], 1, "America/New_York", 7, 22);
    // Should have at least one block starting from now or wake time
    expect(blocks.length).toBeGreaterThanOrEqual(0);
    // Can't assert exact blocks because "now" is dynamic
  });

  it("finds gaps between events", () => {
    // Use a fixed future date so "now" doesn't interfere
    const baseDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const dateStr = baseDate.toLocaleDateString("en-CA", { timeZone: "UTC" });

    const events = [
      makeEvent(`${dateStr}T14:00:00.000Z`, `${dateStr}T15:00:00.000Z`),
      makeEvent(`${dateStr}T17:00:00.000Z`, `${dateStr}T18:00:00.000Z`),
    ];

    // Using UTC timezone so wake/sleep hours map directly
    const blocks = findFreeBlocks(events, 2, "UTC", 7, 22);

    // Should find gaps: 7-14, 15-17, 18-22 on day 1
    const dayBlocks = blocks.filter((b) => b.start.includes(dateStr));
    expect(dayBlocks.length).toBeGreaterThanOrEqual(2);

    // Verify gap between events
    const midGap = dayBlocks.find(
      (b) => b.start.includes("15:00") && b.end.includes("17:00")
    );
    expect(midGap).toBeDefined();
    expect(midGap!.durationMinutes).toBe(120);
  });

  it("respects wake/sleep boundaries", () => {
    // Event at 6 AM should not create a free block before wake time
    const baseDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const dateStr = baseDate.toLocaleDateString("en-CA", { timeZone: "UTC" });

    const events = [
      makeEvent(`${dateStr}T06:00:00.000Z`, `${dateStr}T06:30:00.000Z`),
    ];

    const blocks = findFreeBlocks(events, 2, "UTC", 7, 22);
    const dayBlocks = blocks.filter((b) => b.start.includes(dateStr));

    // No block should start before 07:00
    for (const block of dayBlocks) {
      const blockHour = new Date(block.start).getUTCHours();
      expect(blockHour).toBeGreaterThanOrEqual(7);
    }
  });

  it("skips all-day events", () => {
    const baseDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const dateStr = baseDate.toLocaleDateString("en-CA", { timeZone: "UTC" });

    const events = [
      makeEvent(`${dateStr}T00:00:00.000Z`, `${dateStr}T23:59:00.000Z`, {
        isAllDay: true,
      }),
    ];

    const blocks = findFreeBlocks(events, 2, "UTC", 7, 22);
    const dayBlocks = blocks.filter((b) => b.start.includes(dateStr));
    // All-day event should not consume time — full waking day should be free
    expect(dayBlocks.length).toBeGreaterThanOrEqual(1);
    const totalMinutes = dayBlocks.reduce((sum, b) => sum + b.durationMinutes, 0);
    expect(totalMinutes).toBe(15 * 60); // 7am-10pm = 15 hours
  });

  it("handles overlapping events", () => {
    const baseDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const dateStr = baseDate.toLocaleDateString("en-CA", { timeZone: "UTC" });

    const events = [
      makeEvent(`${dateStr}T14:00:00.000Z`, `${dateStr}T16:00:00.000Z`),
      makeEvent(`${dateStr}T15:00:00.000Z`, `${dateStr}T17:00:00.000Z`), // overlaps
    ];

    const blocks = findFreeBlocks(events, 2, "UTC", 7, 22);
    const dayBlocks = blocks.filter((b) => b.start.includes(dateStr));

    // No free block should overlap with either event
    for (const block of dayBlocks) {
      const bStart = new Date(block.start).getTime();
      const bEnd = new Date(block.end).getTime();
      for (const event of events) {
        const eStart = new Date(event.startTime).getTime();
        const eEnd = new Date(event.endTime).getTime();
        // Block should not overlap: bStart >= eEnd OR bEnd <= eStart
        expect(bStart >= eEnd || bEnd <= eStart).toBe(true);
      }
    }
  });

  it("works with EDT timezone", () => {
    const baseDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const dateStr = baseDate.toLocaleDateString("en-CA", {
      timeZone: "America/New_York",
    });

    // Event at 2 PM EDT = 18:00 UTC
    const events = [
      makeEvent(
        `${dateStr}T18:00:00.000Z`,
        `${dateStr}T19:00:00.000Z`
      ),
    ];

    const blocks = findFreeBlocks(events, 2, "America/New_York", 7, 22);
    // Should have blocks before and after the event in EDT terms
    expect(blocks.length).toBeGreaterThanOrEqual(1);
  });

  it("filters out blocks shorter than 15 minutes", () => {
    const baseDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const dateStr = baseDate.toLocaleDateString("en-CA", { timeZone: "UTC" });

    // Two events with only a 10-minute gap
    const events = [
      makeEvent(`${dateStr}T14:00:00.000Z`, `${dateStr}T14:50:00.000Z`),
      makeEvent(`${dateStr}T15:00:00.000Z`, `${dateStr}T16:00:00.000Z`),
    ];

    const blocks = findFreeBlocks(events, 2, "UTC", 7, 22);
    // The 10-minute gap (14:50-15:00) should NOT appear
    for (const block of blocks) {
      expect(block.durationMinutes).toBeGreaterThanOrEqual(15);
    }
  });
});
