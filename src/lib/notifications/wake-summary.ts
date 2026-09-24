import { formatForDisplay, DISPLAY_TIME } from "@/lib/timezone";

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
 *
 * Built from data, never by the model: every time here is read straight off
 * the row, so there is nothing to miscalculate.
 */
export function buildWakeSummaryBody(
  items: WakeSummaryItem[],
  timezone: string
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

  const parts = unique.slice(0, MAX_ITEMS).map((i) => {
    const time = formatForDisplay(i.at, timezone, DISPLAY_TIME);
    const suffix =
      i.kind === "deadline" ? " (due)" : i.kind === "target" ? " (your target)" : "";
    return `${time} ${shorten(i.title)}${suffix}`;
  });
  const more = unique.length - MAX_ITEMS;
  if (more > 0) parts.push(`+${more} more`);

  return `Today: ${parts.join(" · ")}`;
}
