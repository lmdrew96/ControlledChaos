import { formatForDisplay, toDateKeyInTimezone, DISPLAY_TIME } from "@/lib/timezone";

const DAY_AND_TIME: Intl.DateTimeFormatOptions = { weekday: "short", ...DISPLAY_TIME };

export type WakeSummaryItem = {
  at: Date;
  title: string;
  kind: "deadline" | "event" | "target" | "session";
};

/** Past this, the list stops being glanceable. */
const MAX_ITEMS = 6;
const MAX_TITLE = 40;

const shorten = (s: string): string =>
  s.length > MAX_TITLE ? `${s.slice(0, MAX_TITLE - 1).trimEnd()}…` : s;

/**
 * Body of the one push sent when quiet hours end, e.g.
 * "Today: 12:45 PM ARSC 105 · 2:20 PM LING 101 · 4:00 PM AAP call (due)".
 */
export function buildWakeSummaryBody(items: WakeSummaryItem[], timezone: string): string {
  return buildDigestBody(items, timezone, { heading: "Today" });
}

/**
 * A one-push list of several items, soonest first.
 *
 * Built from data, never by the model: every time is read straight off the
 * row, so there is nothing to miscalculate or pair wrongly. With `now`, an
 * item on another day gets its weekday ("Fri 12:40 PM") and one within the
 * hour gets its distance ("in 10 min").
 */
export function buildDigestBody(
  items: WakeSummaryItem[],
  timezone: string,
  { heading, now }: { heading: string; now?: Date }
): string {
  const seen = new Set<string>();
  const unique = [...items]
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .filter((i) => {
      const key = `${i.title}|${i.at.getTime()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const todayKey = now ? toDateKeyInTimezone(now, timezone) : null;
  const parts = unique.slice(0, MAX_ITEMS).map((i) => {
    const otherDay = todayKey !== null && toDateKeyInTimezone(i.at, timezone) !== todayKey;
    const time = formatForDisplay(i.at, timezone, otherDay ? DAY_AND_TIME : DISPLAY_TIME);
    const minutesAway = now ? Math.round((i.at.getTime() - now.getTime()) / 60000) : null;
    const soon = minutesAway !== null && minutesAway >= 0 && minutesAway < 60 ? ` (in ${minutesAway} min)` : "";
    const suffix =
      i.kind === "deadline" ? " (due)" : i.kind === "target" ? " (your target)" : "";
    return `${time} ${shorten(i.title)}${suffix}${soon}`;
  });
  const more = unique.length - MAX_ITEMS;
  if (more > 0) parts.push(`+${more} more`);

  return `${heading}: ${parts.join(" · ")}`;
}
