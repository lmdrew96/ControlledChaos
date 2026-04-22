"use client";

import { useState, useCallback, useEffect, useRef } from "react";

interface GeolocationState {
  latitude: number | null;
  longitude: number | null;
  error: string | null;
  loading: boolean;
}

interface UseGeolocationOptions {
  // Silently fetch on mount if the browser reports permission already granted.
  // No permission prompt is shown — denied/prompt states skip the fetch.
  autoFetchIfGranted?: boolean;
}

const STORAGE_KEY = "cc-last-location";
// Cached coords older than this are discarded — "last known" isn't useful if it's ancient.
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

type CachedLocation = {
  latitude: number;
  longitude: number;
  savedAt: number;
};

function loadCachedLocation(): CachedLocation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedLocation;
    if (Date.now() - parsed.savedAt > CACHE_TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function persistLocation(latitude: number, longitude: number) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ latitude, longitude, savedAt: Date.now() } satisfies CachedLocation)
    );
  } catch {
    // localStorage may be full or unavailable — non-fatal
  }
}

export function useGeolocation(options: UseGeolocationOptions = {}) {
  const { autoFetchIfGranted = false } = options;

  const [state, setState] = useState<GeolocationState>(() => {
    const cached = loadCachedLocation();
    return {
      latitude: cached?.latitude ?? null,
      longitude: cached?.longitude ?? null,
      error: null,
      loading: false,
    };
  });

  // Track whether we've already fired an auto-fetch so StrictMode double-mount doesn't duplicate it.
  const autoFetchFiredRef = useRef(false);

  const fetchPosition = useCallback((options?: { silent?: boolean }) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      if (!options?.silent) {
        setState((prev) => ({
          ...prev,
          error: "Geolocation not supported",
          loading: false,
        }));
      }
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        persistLocation(latitude, longitude);
        setState({
          latitude,
          longitude,
          error: null,
          loading: false,
        });
      },
      (err) => {
        setState((prev) => ({
          // Keep cached coords on silent failure — they're still the best we have.
          ...prev,
          error: options?.silent ? null : err.message,
          loading: false,
        }));
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000, // Cache for 5 minutes
      }
    );
  }, []);

  const requestLocation = useCallback(() => {
    fetchPosition();
  }, [fetchPosition]);

  useEffect(() => {
    if (!autoFetchIfGranted) return;
    if (autoFetchFiredRef.current) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    if (!navigator.permissions?.query) return;

    autoFetchFiredRef.current = true;

    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((status) => {
        if (status.state === "granted") {
          fetchPosition({ silent: true });
        }
      })
      .catch(() => {
        // Some browsers reject on certain permission names — skip silently.
      });
  }, [autoFetchIfGranted, fetchPosition]);

  return { ...state, requestLocation };
}
