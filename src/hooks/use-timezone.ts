"use client";

import { useEffect, useState } from "react";

/**
 * Module-level cache so every component shares one fetch.
 * Falls back to the browser's timezone until the stored value loads.
 */
let cachedTimezone: string | null = null;
let fetchPromise: Promise<string> | null = null;

function getBrowserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function fetchStoredTimezone(): Promise<string> {
  if (fetchPromise) return fetchPromise;

  fetchPromise = fetch("/api/settings")
    .then((res) => {
      if (!res.ok) throw new Error("Settings fetch failed");
      return res.json();
    })
    .then((data) => {
      const tz = data.timezone ?? getBrowserTimezone();
      cachedTimezone = tz;
      return tz;
    })
    .catch(() => {
      const fallback = getBrowserTimezone();
      cachedTimezone = fallback;
      fetchPromise = null; // Allow retry on next mount
      return fallback;
    });

  return fetchPromise;
}

/**
 * Returns the user's stored timezone (from DB settings).
 * Immediately returns the browser timezone as a fallback while loading,
 * then re-renders with the stored value once fetched.
 *
 * Never returns null — always a valid IANA timezone string.
 */
export function useTimezone(): string {
  const [timezone, setTimezone] = useState<string>(
    cachedTimezone ?? getBrowserTimezone()
  );

  useEffect(() => {
    if (cachedTimezone) return;
    fetchStoredTimezone().then(setTimezone);
  }, []);

  return timezone;
}
