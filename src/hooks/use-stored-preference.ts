"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * localStorage-backed client preferences.
 *
 * These are deliberately NOT part of `settings-cache.ts` — that cache fronts
 * `/api/settings` (server-persisted, cross-device). These are per-browser
 * preferences that never round-trip the server.
 */

const listeners = new Set<() => void>();

/** `storage` events only fire in OTHER tabs, so same-tab writes notify manually. */
const emit = () => {
  for (const listener of listeners) listener();
};

const subscribe = (onChange: () => void) => {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
};

const readStored = (key: string): string | null => {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    // Private mode / storage disabled — treat as unset rather than crashing.
    return null;
  }
};

const writeStored = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Quota or private mode: the preference just won't persist.
  }
  emit();
};

/**
 * A localStorage-backed string preference.
 *
 * Returns `fallback` on the server and during the hydration render, then the
 * stored value — so it never writes state from an effect, and never mismatches.
 */
export function useStoredPreference<T extends string>(
  key: string,
  fallback: T
): [T, (value: T) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => (readStored(key) as T | null) ?? fallback,
    () => fallback
  );

  const setValue = useCallback((next: T) => writeStored(key, next), [key]);

  return [value, setValue];
}

/** A one-way "has the user seen/dismissed this?" flag. */
export function useStoredFlag(key: string): [boolean, () => void] {
  const [value, setValue] = useStoredPreference<string>(key, "");
  const set = useCallback(() => setValue("1"), [setValue]);
  return [value === "1", set];
}
