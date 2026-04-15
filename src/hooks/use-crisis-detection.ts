"use client";

import { useState, useEffect, useCallback } from "react";
import type { CrisisDetectionStatus } from "@/types";

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

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
    fetchStatus();

    // Re-poll periodically
    const interval = setInterval(fetchStatus, POLL_INTERVAL_MS);

    // Re-check on window focus (user came back to the app)
    const onFocus = () => fetchStatus();
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchStatus]);

  return {
    isActive: data?.active ?? false,
    data,
    isLoading,
    refetch: fetchStatus,
  };
}
