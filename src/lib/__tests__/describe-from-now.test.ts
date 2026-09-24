import { describe, it, expect } from "vitest";
import { describeFromNow } from "@/lib/timezone";

const NOW = Date.UTC(2026, 8, 24, 14, 10); // 10:10 AM EDT

describe("describeFromNow", () => {
  it("labels future times with the gap to THAT time", () => {
    expect(describeFromNow(new Date(Date.UTC(2026, 8, 24, 14, 30)), NOW)).toBe("in 20 minutes");
    expect(describeFromNow(new Date(Date.UTC(2026, 8, 24, 15, 30)), NOW)).toBe("in 1 hour 20 minutes");
  });

  it("labels past times as ago", () => {
    expect(describeFromNow(new Date(Date.UTC(2026, 8, 24, 13, 45)), NOW)).toBe("25 minutes ago");
  });

  it("says now inside the same minute", () => {
    expect(describeFromNow(new Date(NOW + 20_000), NOW)).toBe("now");
  });
});
