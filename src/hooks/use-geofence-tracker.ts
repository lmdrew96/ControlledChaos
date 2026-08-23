"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

interface ArrivalSurface {
  locationName: string;
  taskId: string;
  taskTitle: string;
  taskCount: number;
}

interface DepartureSurface {
  departedLocationName: string;
  nearbyLocationName: string;
  taskTitle: string;
}

/**
 * Foreground geofence tracker.
 * Uses watchPosition with coarse accuracy to report position changes to the server.
 * Only reports when the user has moved 100m+ from the last report (prevents GPS jitter spam).
 * The server handles geofence matching and returns any arrival/departure surface to show
 * in-app. This is deliberately app-open-only — PWAs get no background geolocation, so an
 * OS push here would just fire stale "you arrived" notices the moment the app reopens.
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

          fetch("/api/location/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ latitude, longitude }),
          })
            .then((res) => (res.ok ? res.json() : null))
            .then((data: { arrival?: ArrivalSurface | null; departure?: DepartureSurface | null } | null) => {
              if (data?.arrival) {
                const { locationName, taskId, taskTitle, taskCount } = data.arrival;
                toast.info(`You're at ${locationName} — ${taskTitle}`, {
                  description:
                    taskCount > 1 ? `${taskCount} pending tasks tagged here` : undefined,
                  action: {
                    label: "View",
                    onClick: () => {
                      window.location.href = `/tasks?taskId=${taskId}`;
                    },
                  },
                });
              } else if (data?.departure) {
                const { departedLocationName, nearbyLocationName, taskTitle } = data.departure;
                toast.info(`Leaving ${departedLocationName}?`, {
                  description: `${nearbyLocationName} is nearby — ${taskTitle}`,
                });
              }
            })
            .catch(() => {
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
