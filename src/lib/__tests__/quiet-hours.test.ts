import { describe, it, expect } from "vitest";
import { isQuietHours } from "@/lib/notifications/quiet-hours";
import type { NotificationPrefs } from "@/types";

/** Only the two quiet-hours fields matter here; the rest are irrelevant. */
function prefs(start: string, end: string): NotificationPrefs {
  return { quietHoursStart: start, quietHoursEnd: end } as NotificationPrefs;
}

const TZ = "America/New_York";

/** Build a Date from a wall-clock time in TZ. Sep 2026 is EDT (UTC-4). */
function atEastern(hour: number, minute = 0): Date {
  return new Date(
    Date.UTC(2026, 8, 1, hour + 4, minute) // +4 converts EDT → UTC
  );
}

describe("isQuietHours — overnight window (the common case)", () => {
  const overnight = prefs("21:00", "05:00");

  it("suppresses at 11:50 PM — the exact time a deadline reminder leaked through", () => {
    expect(isQuietHours(overnight, TZ, atEastern(23, 50))).toBe(true);
  });

  it("suppresses after midnight, on the other side of the wrap", () => {
    expect(isQuietHours(overnight, TZ, atEastern(0, 30))).toBe(true);
    expect(isQuietHours(overnight, TZ, atEastern(3, 0))).toBe(true);
  });

  it("is inclusive of the start boundary and exclusive of the end", () => {
    expect(isQuietHours(overnight, TZ, atEastern(21, 0))).toBe(true);
    expect(isQuietHours(overnight, TZ, atEastern(4, 59))).toBe(true);
    expect(isQuietHours(overnight, TZ, atEastern(5, 0))).toBe(false);
  });

  it("allows notifications during the day", () => {
    expect(isQuietHours(overnight, TZ, atEastern(12, 0))).toBe(false);
    expect(isQuietHours(overnight, TZ, atEastern(20, 59))).toBe(false);
  });
});

describe("isQuietHours — same-day window", () => {
  const daytime = prefs("09:00", "17:00");

  it("suppresses inside the window and allows outside it", () => {
    expect(isQuietHours(daytime, TZ, atEastern(12, 0))).toBe(true);
    expect(isQuietHours(daytime, TZ, atEastern(8, 59))).toBe(false);
    expect(isQuietHours(daytime, TZ, atEastern(17, 0))).toBe(false);
  });

  it("does not wrap — midnight is outside a daytime window", () => {
    // Guards the "24:00" ICU formatting quirk: if midnight rendered as "24:00"
    // instead of "00:00", a naive string compare could report quiet here.
    expect(isQuietHours(daytime, TZ, atEastern(0, 0))).toBe(false);
    expect(isQuietHours(daytime, TZ, atEastern(0, 30))).toBe(false);
  });
});

describe("isQuietHours — timezone correctness", () => {
  it("reads the user's timezone, not the server's", () => {
    const overnight = prefs("21:00", "05:00");
    // One instant, three different answers — which is the whole point.
    // 03:00 UTC on 1 Sep 2026 is:
    //   New York (EDT, UTC-4) → 23:00, inside quiet hours
    //   Berlin   (CEST, UTC+2) → 05:00, exactly the exclusive end, so NOT quiet
    //   Sydney   (AEST, UTC+10) → 13:00, the middle of the afternoon
    const instant = new Date(Date.UTC(2026, 8, 1, 3, 0));
    expect(isQuietHours(overnight, "America/New_York", instant)).toBe(true);
    expect(isQuietHours(overnight, "Europe/Berlin", instant)).toBe(false);
    expect(isQuietHours(overnight, "Australia/Sydney", instant)).toBe(false);
  });

  it("stays quiet an hour earlier in Berlin, confirming it is not a fixed offset", () => {
    const overnight = prefs("21:00", "05:00");
    // 02:00 UTC → 04:00 in Berlin, still inside the window.
    const instant = new Date(Date.UTC(2026, 8, 1, 2, 0));
    expect(isQuietHours(overnight, "Europe/Berlin", instant)).toBe(true);
  });
});
