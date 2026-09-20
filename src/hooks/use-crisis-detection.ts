"use client";

import { useState, useEffect, useCallback } from "react";
import type { CrisisDetectionStatus } from "@/types";

// 15 minutes, and only while the tab is visible. This endpoint re-runs full
// crisis detection against live data on every call, so a background tab
// polling it was buying nothing at real CPU cost. Focus/visibility events
// below cover the case that actually matters: the user looking at the app.
const POLL_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

export function useCrisisDetection() {
  const [data, setData] = useState<CrisisDetectionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/crisis-detection/status");
      if (!res.ok) return;
      const status: CrisisDetectionStatus = await res.json();
      setData(status);
    } catch {
      // Silently fail — badge just won't show
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();

    // Re-poll periodically, but skip ticks that land while the tab is hidden.
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void fetchStatus();
    };
    const interval = setInterval(tick, POLL_INTERVAL_MS);

    // Re-check on window focus (user came back to the app)
    const onFocus = () => fetchStatus();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", tick);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [fetchStatus]);

  return {
    isActive: data?.active ?? false,
    data,
    isLoading,
    refetch: fetchStatus,
  };
}
