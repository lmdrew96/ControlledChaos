import { describe, it, expect } from "vitest";
import { layoutOverlappingTiles } from "@/lib/calendar/overlap-layout";

const t = (id: string, start: string, end: string) => ({
  id,
  startTime: `2026-09-24T${start}:00Z`,
  endTime: `2026-09-24T${end}:00Z`,
});

describe("layoutOverlappingTiles", () => {
  it("back-to-back tiles both stay at the bottom", () => {
    const l = layoutOverlappingTiles([t("a", "16:00", "17:00"), t("b", "17:00", "18:00")]);
    expect(l.get("a")).toEqual({ z: 0 });
    expect(l.get("b")).toEqual({ z: 0 });
  });

  it("a later-starting tile is drawn on top", () => {
    const l = layoutOverlappingTiles([t("b", "17:20", "18:40"), t("a", "17:00", "17:30")]);
    expect(l.get("a")).toEqual({ z: 0 });
    expect(l.get("b")).toEqual({ z: 1 });
  });

  it("with the same start, the shorter tile goes on top", () => {
    const l = layoutOverlappingTiles([t("short", "17:00", "17:30"), t("long", "17:00", "18:30")]);
    expect(l.get("long")).toEqual({ z: 0 });
    expect(l.get("short")).toEqual({ z: 1 });
  });

  it("depth restarts after a cluster ends", () => {
    const l = layoutOverlappingTiles([
      t("a", "09:00", "10:00"),
      t("b", "09:30", "10:30"),
      t("c", "11:00", "12:00"),
    ]);
    expect(l.get("b")).toEqual({ z: 1 });
    expect(l.get("c")).toEqual({ z: 0 });
  });

  it("zero-length tiles at the same instant still stack", () => {
    const l = layoutOverlappingTiles([t("a", "09:00", "09:00"), t("b", "09:00", "09:00")]);
    expect(new Set([l.get("a")!.z, l.get("b")!.z])).toEqual(new Set([0, 1]));
  });
});
