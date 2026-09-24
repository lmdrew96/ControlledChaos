import { describe, it, expect } from "vitest";
import { layoutOverlappingTiles, shortTileTitle } from "@/lib/calendar/overlap-layout";

const t = (id: string, start: string, end: string) => ({
  id,
  startTime: `2026-09-24T${start}:00Z`,
  endTime: `2026-09-24T${end}:00Z`,
});

describe("layoutOverlappingTiles", () => {
  it("back-to-back tiles both keep the full width", () => {
    const l = layoutOverlappingTiles([t("a", "16:00", "17:00"), t("b", "17:00", "18:00")]);
    expect(l.get("a")).toMatchObject({ leftPct: 0, widthPct: 100 });
    expect(l.get("b")).toMatchObject({ leftPct: 0, widthPct: 100 });
  });

  it("tiles starting together sit side by side", () => {
    const l = layoutOverlappingTiles([t("a", "16:00", "17:00"), t("b", "16:00", "17:00")]);
    expect(l.get("a")).toMatchObject({ leftPct: 0, widthPct: 50 });
    expect(l.get("b")).toMatchObject({ leftPct: 50, widthPct: 50 });
  });

  it("a later tile cascades on top at ~80% width", () => {
    const l = layoutOverlappingTiles([t("a", "13:00", "15:00"), t("b", "14:00", "15:00")]);
    expect(l.get("a")).toMatchObject({ leftPct: 0, widthPct: 80, z: 0, compact: false });
    expect(l.get("b")).toMatchObject({ leftPct: 20, widthPct: 80, z: 1, compact: false });
  });

  it("zero-length tiles at the same instant still get their own slot", () => {
    const l = layoutOverlappingTiles([t("a", "09:00", "09:00"), t("b", "09:00", "09:00")]);
    expect(l.get("a")!.widthPct).toBe(50);
    expect(l.get("b")!.leftPct).toBe(50);
  });

  it("marks narrow side-by-side tiles compact", () => {
    const l = layoutOverlappingTiles([
      t("a", "10:00", "11:00"),
      t("b", "10:00", "11:00"),
      t("c", "10:10", "11:00"),
    ]);
    expect(l.get("c")!.compact).toBe(true);
  });
});

describe("shortTileTitle", () => {
  it("uses the course code when there is one", () => {
    expect(shortTileTitle("LATN 101 - Elementary Latin I")).toBe("LATN 101");
    expect(shortTileTitle("CGSC451 (sit-in): Cognition")).toBe("CGSC 451");
  });
  it("otherwise the first two words", () => {
    expect(shortTileTitle("Perusall Discussion: Biology and Behavior")).toBe("Perusall Discussion");
  });
});
