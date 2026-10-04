/**
 * Pure rules for dashboard reference cards — shared by the API (checklist
 * reset) and the dashboard (when a card shows). No DB, no React.
 */

export type ChecklistReset = "daily" | "manual";

export const CHECKLIST_RESETS: readonly ChecklistReset[] = ["daily", "manual"];

/** "HH:MM", 24-hour. */
export const TIME_OF_DAY_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * The ticks that still count today. A daily checklist starts fresh on the
 * first view of a new local day, so the launch pad is clean every night
 * without anyone pressing reset. A manual one keeps its ticks until reset.
 */
export function effectiveCheckedItems(
  card: { checklistReset: string; checkedItems: number[]; checkedOn: string | null },
  todayKey: string
): number[] {
  if (card.checklistReset === "daily" && card.checkedOn !== todayKey) return [];
  return card.checkedItems;
}

/** Ticks after toggling one item, starting from what counts today. */
export function toggleCheckedItem(current: number[], index: number, checked: boolean): number[] {
  const set = new Set(current);
  if (checked) set.add(index);
  else set.delete(index);
  return [...set].sort((a, b) => a - b);
}

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/**
 * Whether a card's schedule includes this local moment. No days = every day;
 * no window = all day. A window whose end is before its start wraps past
 * midnight (21:00–02:00), and its after-midnight half belongs to the day it
 * started on, so "Fri 21:00–02:00" still shows at 1 AM Saturday.
 */
export function isCardScheduledNow(
  card: { daysOfWeek: number[] | null; showFrom: string | null; showUntil: string | null },
  dayOfWeek: number,
  minutesNow: number
): boolean {
  const onDay = (d: number) => !card.daysOfWeek || card.daysOfWeek.includes(d);
  const from = card.showFrom ? toMinutes(card.showFrom) : 0;
  const until = card.showUntil ? toMinutes(card.showUntil) : 24 * 60;

  if (from <= until) {
    return onDay(dayOfWeek) && minutesNow >= from && minutesNow < until;
  }
  // Wrapping window: the evening half today, or the early-morning tail of yesterday's.
  if (minutesNow >= from) return onDay(dayOfWeek);
  if (minutesNow < until) return onDay((dayOfWeek + 6) % 7);
  return false;
}

export interface ReferenceCardFields {
  title?: string;
  content?: string;
  collapsed?: boolean;
  daysOfWeek?: number[] | null;
  showFrom?: string | null;
  showUntil?: string | null;
  checklistReset?: ChecklistReset;
  sortOrder?: number;
}

/**
 * Validate a create/update body (camelCase, as the dashboard sends it). Only
 * keys present in the body are returned, so an update never writes a field
 * the caller didn't mention.
 */
export function parseReferenceCardFields(
  body: unknown,
  { requireTitle }: { requireTitle: boolean }
): { ok: true; data: ReferenceCardFields } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid body" };
  const b = body as Record<string, unknown>;
  const data: ReferenceCardFields = {};

  if (b.title !== undefined || requireTitle) {
    if (typeof b.title !== "string" || !b.title.trim() || b.title.length > 200) {
      return { ok: false, error: "Title is required (max 200 characters)" };
    }
    data.title = b.title.trim();
  }
  if (b.content !== undefined) {
    if (typeof b.content !== "string" || b.content.length > 20_000) {
      return { ok: false, error: "Content must be text (max 20,000 characters)" };
    }
    data.content = b.content;
  }
  if (b.collapsed !== undefined) {
    if (typeof b.collapsed !== "boolean") return { ok: false, error: "Invalid collapsed flag" };
    data.collapsed = b.collapsed;
  }
  if (b.daysOfWeek !== undefined) {
    const d = b.daysOfWeek;
    if (d === null) data.daysOfWeek = null;
    else if (
      Array.isArray(d) &&
      d.length > 0 &&
      d.every((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    ) {
      data.daysOfWeek = [...new Set(d as number[])].sort((x, y) => x - y);
    } else return { ok: false, error: "daysOfWeek must be null or a non-empty array of 0..6" };
  }
  for (const key of ["showFrom", "showUntil"] as const) {
    const v = b[key];
    if (v === undefined) continue;
    if (v === null || v === "") data[key] = null;
    else if (typeof v === "string" && TIME_OF_DAY_RE.test(v)) data[key] = v;
    else return { ok: false, error: `${key} must be "HH:MM" or null` };
  }
  if (b.checklistReset !== undefined) {
    if (!CHECKLIST_RESETS.includes(b.checklistReset as ChecklistReset)) {
      return { ok: false, error: "checklistReset must be daily or manual" };
    }
    data.checklistReset = b.checklistReset as ChecklistReset;
  }
  if (b.sortOrder !== undefined) {
    if (!Number.isInteger(b.sortOrder)) return { ok: false, error: "Invalid sortOrder" };
    data.sortOrder = b.sortOrder as number;
  }
  return { ok: true, data };
}
