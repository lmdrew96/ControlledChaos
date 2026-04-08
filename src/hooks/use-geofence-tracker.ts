"use client";

import { useEffect, useRef } from "react";

/**
 * Foreground geofence tracker.
 * Uses watchPosition with coarse accuracy to report position changes to the server.
 * Only reports when the user has moved 100m+ from the last report (prevents GPS jitter spam).
 * The server handles all geofence matching and notification logic.
 */
export function useGeofenceTracker(enabled: boolean) {
  const watchIdRef = useRef<number | null>(null);
  const lastReportRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !navigator.geolocation) {
      return;
    }

    // Check permission state before starting — avoid triggering a prompt unexpectedly
    if (navigator.permissions) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((result) => {
          if (result.state === "granted") {
            startWatching();
          }
          // If "prompt" or "denied", don't start — the settings toggle handles permission
        })
        .catch(() => {
          // permissions API not supported — try watching anyway (will prompt if needed)
          startWatching();
        });
    } else {
      startWatching();
    }

    function startWatching() {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          const last = lastReportRef.current;

          if (last) {
            // Quick approximate distance check (~111km per degree at equator)
            const dLat = (latitude - last.lat) * 111320;
            const dLng =
              (longitude - last.lng) *
              111320 *
              Math.cos((latitude * Math.PI) / 180);
            const distance = Math.sqrt(dLat * dLat + dLng * dLng);
            if (distance < 100) return; // Under 100m — skip
          }

          lastReportRef.current = { lat: latitude, lng: longitude };

          // Fire-and-forget POST — don't block on result
          fetch("/api/location/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ latitude, longitude }),
          }).catch(() => {
            // Silently ignore — network errors are transient
          });
        },
        () => {
          // Silently ignore position errors (temporary GPS loss, etc.)
        },
        {
          enableHighAccuracy: false, // Coarse/WiFi-based — battery friendly
          maximumAge: 60_000, // Accept 1-minute-old cached position
          timeout: 15_000,
        }
      );
    }

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [enabled]);
}
