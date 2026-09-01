"use client";

import { useEffect, useState } from "react";
import {
  fetchSettings,
  getCachedSettings,
  subscribeToSettings,
  DEFAULT_START_HOUR,
  DEFAULT_END_HOUR,
  DEFAULT_WEEK_START_DAY,
  getBrowserTimezone,
  type AppSettings,
} from "@/lib/settings-cache";

export {
  DEFAULT_START_HOUR,
  DEFAULT_END_HOUR,
  DEFAULT_WEEK_START_DAY,
};

export type CalendarSettings = AppSettings;

function fallback(): AppSettings {
  return {
    timezone: getBrowserTimezone(),
    startHour: DEFAULT_START_HOUR,
    endHour: DEFAULT_END_HOUR,
    weekStartDay: DEFAULT_WEEK_START_DAY,
    calendarColors: null,
  };
}

/**
 * Everything the calendar needs to lay itself out, plus whether it has arrived.
 *
 * `isLoaded` exists because these decide LAYOUT, not styling: startHour/endHour
 * set the grid's row count and every event's top/height, weekStartDay decides
 * which day each of the seven columns is, and timezone feeds eventPosition and
 * dayKey. Rendering before they land paints a calendar built from defaults and
 * then rebuilds it — which reads as "a different version of the calendar
 * loaded", especially on a cold serverless start where the wrong one is up for
 * a second or two.
 *
 * The mismatch is not rare: /api/settings resolves calendarStartHour as
 * `calendarStartHour ?? wakeTime ?? 7`, so anyone who set a wake time but never
 * touched the calendar hours disagrees with the client default on every load.
 *
 * Callers should hold their grid behind `isLoaded`. Thanks to the shared cache
 * that costs a spinner only on the first calendar visit of a session.
 */
export function useCalendarSettings(): {
  settings: AppSettings;
  isLoaded: boolean;
} {
  const [settings, setSettings] = useState<AppSettings>(
    () => getCachedSettings() ?? fallback()
  );
  const [isLoaded, setIsLoaded] = useState(() => getCachedSettings() !== null);

  useEffect(() => {
    let active = true;

    const sync = () => {
      void fetchSettings().then((next) => {
        if (!active) return;
        setSettings(next);
        setIsLoaded(true);
      });
    };

    sync();
    const unsubscribe = subscribeToSettings(() => {
      if (!active) return;
      // A save landed. Re-open the gate only once the new values are in hand,
      // so the grid never paints from the pre-save layout.
      setIsLoaded(false);
      sync();
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return { settings, isLoaded };
}
