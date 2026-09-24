import { describe, it, expect } from "vitest";
import { resolveSessionMinutes } from "@/lib/calendar/session-minutes";

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
