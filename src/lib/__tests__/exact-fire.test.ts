import { describe, it, expect } from "vitest";
import { fireTimesFor, FIRE_OFFSET_MS } from "@/lib/notifications/exact-fire";

const t = (hhmmss: string) => new Date(`2026-09-28T${hhmmss}Z`);

describe("fireTimesFor", () => {
  const now = t("12:30:00");

  it("fires just after each band opens", () => {
    expect(fireTimesFor([t("12:35:00")], now)).toEqual([
      new Date(t("12:35:00").getTime() + FIRE_OFFSET_MS),
    ]);
  });

  it("shares one fire per minute, timed after the last opening in it", () => {
    const fires = fireTimesFor([t("12:35:40"), t("12:35:00"), t("12:35:10")], now);
    expect(fires).toEqual([new Date(t("12:35:40").getTime() + FIRE_OFFSET_MS)]);
  });

  it("keeps different minutes apart, in order", () => {
    const fires = fireTimesFor([t("12:39:00"), t("12:31:00")], now);
    expect(fires.map((d) => d.toISOString())).toEqual([
      new Date(t("12:31:00").getTime() + FIRE_OFFSET_MS).toISOString(),
      new Date(t("12:39:00").getTime() + FIRE_OFFSET_MS).toISOString(),
    ]);
  });

  it("skips openings at or before now", () => {
    expect(fireTimesFor([t("12:30:00"), t("12:29:00")], now)).toEqual([]);
  });
});
