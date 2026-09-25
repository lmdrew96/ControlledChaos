import { describe, it, expect } from "vitest";
import { buildWakeSummaryBody, buildDigestBody } from "@/lib/notifications/wake-summary";

const TZ = "America/New_York";
const at = (h: number, m = 0) => new Date(Date.UTC(2026, 8, 24, h + 4, m)); // EDT

describe("buildWakeSummaryBody", () => {
  it("lists items soonest first with times read off the data", () => {
    const body = buildWakeSummaryBody(
      [
        { at: at(16), title: "AAP call", kind: "event" },
        { at: at(12, 45), title: "ARSC 105", kind: "event" },
        { at: at(14, 20), title: "LING essay", kind: "deadline" },
        { at: at(17, 45), title: "Perusall", kind: "target" },
      ],
      TZ
    );
    expect(body).toBe(
      "Today: 12:45 PM ARSC 105 · 2:20 PM LING essay (due) · 4:00 PM AAP call · 5:45 PM Perusall (your target)"
    );
  });

  it("drops exact duplicates and caps the list", () => {
    const items = Array.from({ length: 8 }, (_, i) => ({
      at: at(9 + i),
      title: `Item ${i}`,
      kind: "session" as const,
    }));
    items.push({ ...items[0] });
    const body = buildWakeSummaryBody(items, TZ);
    expect(body.endsWith("+2 more")).toBe(true);
    expect(body.match(/Item 0/g)).toHaveLength(1);
  });
});

describe("buildDigestBody", () => {
  it("labels other-day items with a weekday and near ones with a distance", () => {
    const now = at(20, 30); // Thu 8:30 PM EDT
    const body = buildDigestBody(
      [
        { at: new Date(Date.UTC(2026, 8, 25, 16, 40)), title: "CGSC 170", kind: "event" },
        { at: at(20, 40), title: "Suburani translation", kind: "session" },
      ],
      TZ,
      { heading: "Coming up", now }
    );
    expect(body).toBe("Coming up: 8:40 PM Suburani translation (in 10 min) · Fri 12:40 PM CGSC 170");
  });
});
