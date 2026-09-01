"use client";

import type { CalendarColors } from "@/types";

/**
 * One shared client-side cache of /api/settings.
 *
 * Before this, useTimezone and useCalendarSettings each kept their own module
 * cache and each fetched /api/settings independently — two requests for one
 * response, and two separate "arrives late and re-renders" windows. Worse, a
 * save in the settings UI invalidated neither, so changing your timezone left
 * every mounted surface on the old zone until a full page reload.
 *
 * Everything that reads settings on the client should go through here, so a
 * single invalidateSettings() after a save is enough.
 */

export const DEFAULT_START_HOUR = 7;
export const DEFAULT_END_HOUR = 22;
export const DEFAULT_WEEK_START_DAY = 1; // Monday

export interface AppSettings {
  timezone: string;
  startHour: number;
  endHour: number;
  weekStartDay: number;
  calendarColors: CalendarColors | null;
}

export function getBrowserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function defaults(): AppSettings {
  return {
    timezone: getBrowserTimezone(),
    startHour: DEFAULT_START_HOUR,
    endHour: DEFAULT_END_HOUR,
    weekStartDay: DEFAULT_WEEK_START_DAY,
    calendarColors: null,
  };
}

let cached: AppSettings | null = null;
let fetchPromise: Promise<AppSettings> | null = null;
const listeners = new Set<() => void>();

export function getCachedSettings(): AppSettings | null {
  return cached;
}

export function subscribeToSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function fetchSettings(): Promise<AppSettings> {
  if (fetchPromise) return fetchPromise;

  fetchPromise = fetch("/api/settings")
    .then((res) => {
      if (!res.ok) throw new Error("Settings fetch failed");
      return res.json();
    })
    .then((data) => {
      const settings: AppSettings = {
        timezone: data.timezone ?? getBrowserTimezone(),
        startHour: data.calendarStartHour ?? DEFAULT_START_HOUR,
        endHour: data.calendarEndHour ?? DEFAULT_END_HOUR,
        weekStartDay: data.weekStartDay ?? DEFAULT_WEEK_START_DAY,
        calendarColors: data.calendarColors ?? null,
      };
      cached = settings;
      return settings;
    })
    .catch(() => {
      const fallback = defaults();
      cached = fallback;
      fetchPromise = null; // Allow a retry on the next mount.
      return fallback;
    });

  return fetchPromise;
}

/**
 * Drop the cache and tell every mounted hook to re-read.
 *
 * Call after saving ANY setting this cache exposes — timezone, calendar hours,
 * week start, colors, and the wake/sleep scheduling window (which feeds the
 * calendar's hour range through the API's `calendarStartHour ?? wakeTime`
 * fallback). Without it the session keeps serving pre-save values and the app
 * looks like it ignored you.
 */
export function invalidateSettings(): void {
  cached = null;
  fetchPromise = null;
  for (const listener of listeners) listener();
}
