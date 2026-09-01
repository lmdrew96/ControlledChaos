"use client";

import { useEffect, useState } from "react";
import {
  fetchSettings,
  getCachedSettings,
  getBrowserTimezone,
  subscribeToSettings,
} from "@/lib/settings-cache";

/**
 * Returns the user's stored timezone (from DB settings).
 *
 * Immediately returns the browser timezone as a fallback while loading, then
 * re-renders with the stored value once fetched. Never returns null — always a
 * valid IANA timezone string.
 *
 * Backed by the shared settings cache, so this shares one /api/settings request
 * with useCalendarSettings and picks up a save via invalidateSettings().
 *
 * If you need to know WHETHER the stored value has arrived — because you're
 * about to lay out something whose position depends on it — use
 * useCalendarSettings, which exposes isLoaded.
 */
export function useTimezone(): string {
  const [timezone, setTimezone] = useState<string>(
    () => getCachedSettings()?.timezone ?? getBrowserTimezone()
  );

  useEffect(() => {
    let active = true;

    const sync = () => {
      void fetchSettings().then((settings) => {
        if (active) setTimezone(settings.timezone);
      });
    };

    sync();
    const unsubscribe = subscribeToSettings(sync);

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return timezone;
}
