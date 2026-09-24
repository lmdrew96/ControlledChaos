import { describe, it, expect } from "vitest";
import { resolveSessionMinutes, sessionMarkers } from "@/lib/calendar/session-minutes";

const s = (id: string, minutes: number | null = null, extra = {}) => ({ id, minutes, ...extra });

describe("resolveSessionMinutes", () => {
  it("a single sitting still gets the whole estimate", () => {
    expect(resolveSessionMinutes(120, [s("a")]).get("a")).toBe(120);
  });

  it("splits the estimate evenly instead of cloning it", () => {
    const r = resolveSessionMinutes(120, [s("a"), s("b")]);
    expect(r.get("a")).toBe(60);
    expect(r.get("b")).toBe(60);
  });

  it("an explicit length is kept and the rest re-divide what's left", () => {
    const r = resolveSessionMinutes(120, [s("a", 90), s("b"), s("c")]);
    expect(r.get("a")).toBe(90);
    expect(r.get("b")).toBe(15);
    expect(r.get("c")).toBe(15);
  });

  it("never resolves below the minimum sitting length", () => {
    const r = resolveSessionMinutes(60, [s("a", 60), s("b")]);
    expect(r.get("b")).toBe(15);
  });

  it("with no estimate, auto sittings stay null for the default block", () => {
    expect(resolveSessionMinutes(null, [s("a"), s("b", 45)]).get("a")).toBeNull();
  });

  it("logged progress comes off the top; skipped rolls into the rest", () => {
    const r = resolveSessionMinutes(120, [
      s("a", null, { status: "partial", actualMinutes: 30 }),
      s("b", null, { status: "skipped", actualMinutes: 0 }),
      s("c"),
      s("d"),
    ]);
    expect(r.get("a")).toBe(30);
    expect(r.get("c")).toBe(45);
    expect(r.get("d")).toBe(45);
  });
});

describe("sessionMarkers", () => {
  const at = (h: number, m = 0) => new Date(Date.UTC(2026, 8, 24, h + 4, m)); // EDT

  it("at 4:08 PM, a 9:45 AM + 9:00 PM plan shows 9:00 PM next, 9:45 AM passed", () => {
    const r = sessionMarkers(
      [
        { startsAt: at(21), minutes: 30 },
        { startsAt: at(9, 45), minutes: 30 },
      ],
      at(16, 8)
    );
    expect(r.nextAt).toEqual(at(21));
    expect(r.passedAt).toEqual(at(9, 45));
  });

  it("a sitting that's underway is still the next one", () => {
    const r = sessionMarkers([{ startsAt: at(16), minutes: 60 }], at(16, 30));
    expect(r.nextAt).toEqual(at(16));
    expect(r.passedAt).toBeNull();
  });

  it("with every sitting ended, only passedAt is set", () => {
    const r = sessionMarkers([{ startsAt: at(9), minutes: 30 }], at(12));
    expect(r.nextAt).toBeNull();
    expect(r.passedAt).toEqual(at(9));
  });
});
