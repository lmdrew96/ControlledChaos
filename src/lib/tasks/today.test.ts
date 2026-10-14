import { describe, expect, it } from "vitest";
import { bucketToday, nextDueAfterToday, todayBucket } from "./today";

const task = (fields: { status?: string; deadline?: string | null; nextSessionAt?: string | null }) => ({
  status: "pending",
  deadline: null,
  nextSessionAt: null,
  ...fields,
});

describe("todayBucket", () => {
  // 9:28 AM EDT, Wed Oct 14 2026
  const now = new Date("2026-10-14T13:28:00Z");

  it("puts an 11:59 PM deadline in due today (New York)", () => {
    // 11:59 PM EDT Oct 14 = 03:59 UTC Oct 15
    expect(todayBucket(task({ deadline: "2026-10-15T03:59:00Z" }), now, "America/New_York")).toBe("due");
  });

  it("reads the same instant as tomorrow in Bucharest", () => {
    // 4:28 PM in Bucharest; 03:59 UTC Oct 15 is 6:59 AM Oct 15 there
    expect(todayBucket(task({ deadline: "2026-10-15T03:59:00Z" }), now, "Europe/Bucharest")).toBeNull();
  });

  it("marks a passed deadline overdue, even one planned today", () => {
    expect(
      todayBucket(
        task({ deadline: "2026-10-13T03:59:00Z", nextSessionAt: "2026-10-14T19:30:00Z" }),
        now,
        "America/New_York"
      )
    ).toBe("overdue");
  });

  it("prefers due over planned for the same task", () => {
    expect(
      todayBucket(
        task({ deadline: "2026-10-15T03:59:00Z", nextSessionAt: "2026-10-14T19:30:00Z" }),
        now,
        "America/New_York"
      )
    ).toBe("due");
  });

  it("buckets a sitting starting today as planned", () => {
    expect(todayBucket(task({ nextSessionAt: "2026-10-14T19:30:00Z" }), now, "America/New_York")).toBe("planned");
  });

  it("ignores finished and cancelled tasks", () => {
    expect(todayBucket(task({ status: "completed", deadline: "2026-10-13T00:00:00Z" }), now, "UTC")).toBeNull();
    expect(todayBucket(task({ status: "cancelled", deadline: "2026-10-13T00:00:00Z" }), now, "UTC")).toBeNull();
  });
});

describe("bucketToday / nextDueAfterToday", () => {
  const now = new Date("2026-10-14T13:28:00Z");

  it("sorts each bucket soonest first", () => {
    const a = task({ deadline: "2026-10-15T03:59:00Z" });
    const b = task({ deadline: "2026-10-14T20:00:00Z" });
    expect(bucketToday([a, b], now, "America/New_York").due).toEqual([b, a]);
  });

  it("finds the next deadline after today", () => {
    const thu = task({ deadline: "2026-10-16T03:59:00Z" });
    const mon = task({ deadline: "2026-10-20T03:59:00Z" });
    const tonight = task({ deadline: "2026-10-15T03:59:00Z" });
    expect(nextDueAfterToday([mon, tonight, thu], now, "America/New_York")).toBe(thu);
  });
});
