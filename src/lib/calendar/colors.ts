import type { CalendarColorKey, CalendarColors, EventCategory } from "@/types";

export const DEFAULT_CALENDAR_COLORS: CalendarColors = {
  school: "blue",
  work: "purple",
  personal: "green",
  errands: "orange",
  health: "red",
};

export const CALENDAR_COLOR_OPTIONS: { key: CalendarColorKey; label: string; swatch: string }[] = [
  { key: "blue",   label: "Blue",   swatch: "bg-blue-500" },
  { key: "purple", label: "Purple", swatch: "bg-purple-500" },
  { key: "green",  label: "Green",  swatch: "bg-green-500" },
  { key: "orange", label: "Orange", swatch: "bg-orange-500" },
  { key: "red",    label: "Red",    swatch: "bg-red-500" },
  { key: "pink",   label: "Pink",   swatch: "bg-pink-500" },
  { key: "teal",   label: "Teal",   swatch: "bg-teal-500" },
  { key: "yellow", label: "Yellow", swatch: "bg-yellow-500" },
];

export const EVENT_CATEGORIES: { key: EventCategory; label: string }[] = [
  { key: "school",   label: "School" },
  { key: "work",     label: "Work" },
  { key: "personal", label: "Personal" },
  { key: "errands",  label: "Errands" },
  { key: "health",   label: "Health" },
];

/** Week-view: border-l-4 style classes (light + dark) */
const WEEK_VIEW_CLASSES: Record<CalendarColorKey, string> = {
  blue:   "bg-blue-100 dark:bg-blue-500/25 border-blue-300 dark:border-blue-400/60 text-blue-800 dark:text-blue-100",
  purple: "bg-purple-100 dark:bg-purple-500/25 border-purple-300 dark:border-purple-400/60 text-purple-800 dark:text-purple-100",
  green:  "bg-green-100 dark:bg-green-500/25 border-green-300 dark:border-green-400/60 text-green-800 dark:text-green-100",
  orange: "bg-orange-100 dark:bg-orange-500/25 border-orange-300 dark:border-orange-400/60 text-orange-800 dark:text-orange-100",
  red:    "bg-red-100 dark:bg-red-500/25 border-red-300 dark:border-red-400/60 text-red-800 dark:text-red-100",
  pink:   "bg-pink-100 dark:bg-pink-500/25 border-pink-300 dark:border-pink-400/60 text-pink-800 dark:text-pink-100",
  teal:   "bg-teal-100 dark:bg-teal-500/25 border-teal-300 dark:border-teal-400/60 text-teal-800 dark:text-teal-100",
  yellow: "bg-yellow-100 dark:bg-yellow-500/25 border-yellow-300 dark:border-yellow-400/60 text-yellow-800 dark:text-yellow-100",
};

/** Month-view: small dot color */
const MONTH_VIEW_CLASSES: Record<CalendarColorKey, string> = {
  blue:   "bg-blue-500/80",
  purple: "bg-purple-500/80",
  green:  "bg-green-500/80",
  orange: "bg-orange-500/80",
  red:    "bg-red-500/80",
  pink:   "bg-pink-500/80",
  teal:   "bg-teal-500/80",
  yellow: "bg-yellow-500/80",
};

/** Month-view: event pill light/dark classes */
const MONTH_PILL_CLASSES: Record<CalendarColorKey, string> = {
  blue:   "bg-blue-100 dark:bg-blue-500/20 text-blue-800 dark:text-blue-200",
  purple: "bg-purple-100 dark:bg-purple-500/20 text-purple-800 dark:text-purple-200",
  green:  "bg-green-100 dark:bg-green-500/20 text-green-800 dark:text-green-200",
  orange: "bg-orange-100 dark:bg-orange-500/20 text-orange-800 dark:text-orange-200",
  red:    "bg-red-100 dark:bg-red-500/20 text-red-800 dark:text-red-200",
  pink:   "bg-pink-100 dark:bg-pink-500/20 text-pink-800 dark:text-pink-200",
  teal:   "bg-teal-100 dark:bg-teal-500/20 text-teal-800 dark:text-teal-200",
  yellow: "bg-yellow-100 dark:bg-yellow-500/20 text-yellow-800 dark:text-yellow-200",
};

/** Hex values for data viz contexts (Chart.js, SVG, inline styles) */
export const COLOR_HEX: Record<CalendarColorKey, { solid: string; light: string }> = {
  blue:   { solid: "#3b82f6", light: "rgba(59,130,246,0.15)" },
  purple: { solid: "#a855f7", light: "rgba(168,85,247,0.15)" },
  green:  { solid: "#22c55e", light: "rgba(34,197,94,0.15)" },
  orange: { solid: "#f97316", light: "rgba(249,115,22,0.15)" },
  red:    { solid: "#ef4444", light: "rgba(239,68,68,0.15)" },
  pink:   { solid: "#ec4899", light: "rgba(236,72,153,0.15)" },
  teal:   { solid: "#14b8a6", light: "rgba(20,184,166,0.15)" },
  yellow: { solid: "#eab308", light: "rgba(234,179,8,0.15)" },
};

/** Task list: category badge classes */
export const TASK_BADGE_CLASSES: Record<CalendarColorKey, string> = {
  blue:   "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-200",
  purple: "bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-200",
  green:  "bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-200",
  orange: "bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-200",
  red:    "bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-200",
  pink:   "bg-pink-100 dark:bg-pink-500/20 text-pink-700 dark:text-pink-200",
  teal:   "bg-teal-100 dark:bg-teal-500/20 text-teal-700 dark:text-teal-200",
  yellow: "bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-200",
};

function resolveColor(category: EventCategory | null | undefined, colors: CalendarColors): CalendarColorKey {
  if (category && category in colors) return colors[category];
  return colors.personal; // fallback for events with no category
}

export function categoryColor(category: EventCategory | null | undefined, colors?: CalendarColors | null): string {
  const c = resolveColor(category, colors ?? DEFAULT_CALENDAR_COLORS);
  return WEEK_VIEW_CLASSES[c];
}

export function categoryDotColor(category: EventCategory | null | undefined, colors?: CalendarColors | null): string {
  const c = resolveColor(category, colors ?? DEFAULT_CALENDAR_COLORS);
  return MONTH_VIEW_CLASSES[c];
}

export function categoryPillColor(category: EventCategory | null | undefined, colors?: CalendarColors | null): string {
  const c = resolveColor(category, colors ?? DEFAULT_CALENDAR_COLORS);
  return MONTH_PILL_CLASSES[c];
}

/** Get hex color for a category, respecting user color prefs */
export function categoryHex(
  category: EventCategory | null | undefined,
  colors?: CalendarColors | null
): { solid: string; light: string } {
  const c = resolveColor(category, colors ?? DEFAULT_CALENDAR_COLORS);
  return COLOR_HEX[c];
}

/** Get task badge classes for a category, respecting user color prefs */
export function taskBadgeColor(
  category: EventCategory | null | undefined,
  colors?: CalendarColors | null
): string {
  const c = resolveColor(category, colors ?? DEFAULT_CALENDAR_COLORS);
  return TASK_BADGE_CLASSES[c];
}
