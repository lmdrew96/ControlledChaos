import { useSyncExternalStore } from "react";

/**
 * One shared minute clock for the whole tab.
 *
 * Components that show "now" (relative times, the calendar's now-line, which
 * day is today) used to read Date.now() once at mount and never again, so a
 * tab left open all day kept yesterday's "today". This ticks at the top of
 * every minute while anything is subscribed, and every subscriber shares the
 * one timer.
 */
let current = Date.now();
const listeners = new Set<() => void>();
let timeout: ReturnType<typeof setTimeout> | null = null;

const tick = () => {
  current = Date.now();
  listeners.forEach((l) => l());
  schedule();
};

const schedule = () => {
  // Aligned to the next minute boundary, so the now-line and "5m ago" roll
  // over together with the device clock.
  timeout = setTimeout(tick, 60_000 - (Date.now() % 60_000));
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  if (listeners.size === 1) {
    // Nothing was listening, so `current` may be hours old.
    current = Date.now();
    schedule();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };
};

const getSnapshot = () => current;

/** Current time in ms, refreshed at the top of every minute. */
export const useNow = (): number => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
