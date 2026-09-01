"use client";

import { useEffect, useState } from "react";
import type { CalendarColors } from "@/types";

export const DEFAULT_START_HOUR = 7;
export const DEFAULT_END_HOUR = 22;
export const DEFAULT_WEEK_START_DAY = 1; // Monday

export interface CalendarSettings {
  startHour: number;
  endHour: number;
  weekStartDay: number;
  calendarColors: CalendarColors | null;
}

const DEFAULTS: CalendarSettings = {
  startHour: DEFAULT_START_HOUR,
  endHour: DEFAULT_END_HOUR,
  weekStartDay: DEFAULT_WEEK_START_DAY,
  calendarColors: null,
};

/**
 * Module-level cache, same pattern as useTimezone. Every calendar surface
 * shares one fetch per session instead of re-requesting on each mount.
 */
let cached: CalendarSettings | null = null;
let fetchPromise: Promise<CalendarSettings> | null = null;

function fetchCalendarSettings(): Promise<CalendarSettings> {
  if (fetchPromise) return fetchPromise;

  fetchPromise = fetch("/api/settings")
    .then((res) => {
      if (!res.ok) throw new Error("Settings fetch failed");
      return res.json();
    })
    .then((data) => {
      const settings: CalendarSettings = {
        startHour: data.calendarStartHour ?? DEFAULT_START_HOUR,
        endHour: data.calendarEndHour ?? DEFAULT_END_HOUR,
        weekStartDay: data.weekStartDay ?? DEFAULT_WEEK_START_DAY,
        calendarColors: data.calendarColors ?? null,
      };
      cached = settings;
      return settings;
    })
    .catch(() => {
      cached = DEFAULTS;
      fetchPromise = null; // Allow a retry on the next mount.
      return DEFAULTS;
    });

  return fetchPromise;
}

/**
 * The user's calendar layout settings, and whether they've actually arrived.
 *
 * `isLoaded` exists because these values decide LAYOUT, not just styling:
 * startHour/endHour set the grid's row count and every event's top/height, and
 * weekStartDay decides which day each of the seven columns is. Rendering the
 * grid before they land paints a calendar built from defaults and then rebuilds
 * it — which reads as "a different version of the calendar loaded", especially
 * on a cold serverless start where the wrong version is up for a second or two.
 *
 * The mismatch is not rare: /api/settings resolves calendarStartHour as
 * `calendarStartHour ?? wakeTime ?? 7`, so anyone who set a wake time but never
 * touched the calendar hours disagrees with the client default on every load.
 *
 * Callers should hold their grid behind `isLoaded`. Thanks to the module cache
 * that costs a spinner only on the first calendar visit of a session.
 */
export function useCalendarSettings(): {
  settings: CalendarSettings;
  isLoaded: boolean;
} {
  const [settings, setSettings] = useState<CalendarSettings>(
    cached ?? DEFAULTS
  );
  const [isLoaded, setIsLoaded] = useState(cached !== null);

  useEffect(() => {
    if (cached) return;
    let active = true;
    void fetchCalendarSettings().then((next) => {
      if (!active) return;
      setSettings(next);
      setIsLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  return { settings, isLoaded };
}

/**
 * Drop the cache so the next mount refetches.
 *
 * Call after saving calendar settings — otherwise the session keeps serving the
 * values from before the change and the calendar looks like it ignored you.
 */
export function invalidateCalendarSettings(): void {
  cached = null;
  fetchPromise = null;
}
