import { formatForDisplay, DISPLAY_DATE } from "@/lib/timezone";

/**
 * "just now", "5m ago", "3h ago", "yesterday", "4d ago" — then a plain date
 * past a week. `now` is passed in (useNow()) so callers stay pure in render
 * and the label keeps aging in an open tab.
 */
export function timeAgo(dateStr: string, now: number, timezone: string): string {
  const diffMs = now - new Date(dateStr).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(diffMs / 86_400_000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return formatForDisplay(new Date(dateStr), timezone, DISPLAY_DATE);
}
