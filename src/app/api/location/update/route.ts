import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import {
  getSavedLocations,
  getUserSettings,
  getUserLocation,
  getPendingTasksForLocation,
  getRecentLocationNotification,
  logLocationNotification,
  upsertUserLocation,
} from "@/lib/db/queries";
import { haversineDistance, matchLocation } from "@/lib/context/location";
import type { SavedLocation } from "@/lib/context/location";
import { getAssertivenessMode } from "@/lib/notifications/triggers";
import type { NotificationPrefs } from "@/types";

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
 * POST /api/location/update
 *
 * Client reports position. Server matches it against saved locations and, on an
 * arrival/departure transition, returns a payload the client can surface as an
 * in-app toast. This is checked-on-open, not a background push — PWAs don't get
 * background geolocation, so there's no reliable way to detect a transition while
 * the app isn't in the foreground. Promising a push here would just fire stale
 * "arrival" notices the moment the app reopens, which is what this replaces.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { latitude, longitude } = body;

    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
    }

    const [savedLocations, previousLocation, settings] = await Promise.all([
      getSavedLocations(userId),
      getUserLocation(userId),
      getUserSettings(userId),
    ]);

    const notifPrefs = settings?.notificationPrefs as NotificationPrefs | null;

    // Bail if location suggestions are disabled — still save position for commute/"time to leave" context
    if (!notifPrefs?.locationNotificationsEnabled) {
      await upsertUserLocation(userId, {
        latitude: latitude.toString(),
        longitude: longitude.toString(),
        matchedLocationId: null,
        matchedLocationName: null,
      });
      return NextResponse.json({ ok: true });
    }

    // Match current position against saved locations
    const currentMatch = matchLocation({ latitude, longitude }, savedLocations);

    const previousMatchId = previousLocation?.matchedLocationId ?? null;
    const currentMatchId = currentMatch
      ? findLocationId(savedLocations, currentMatch.name)
      : null;

    // Hysteresis check: if we were previously "inside" a location, require
    // distance > radius * 1.25 to count as "left" (prevents GPS bounce)
    const hasActuallyLeft =
      previousMatchId && !currentMatchId
        ? checkHysteresisExit({ latitude, longitude }, savedLocations, previousMatchId)
        : true;

    const effectiveCurrentMatchId = !hasActuallyLeft ? previousMatchId : currentMatchId;
    const effectiveCurrentMatchName = !hasActuallyLeft
      ? previousLocation?.matchedLocationName ?? null
      : currentMatch?.name ?? null;

    await upsertUserLocation(userId, {
      latitude: latitude.toString(),
      longitude: longitude.toString(),
      matchedLocationId: effectiveCurrentMatchId,
      matchedLocationName: effectiveCurrentMatchName,
    });

    const arrived =
      previousMatchId !== effectiveCurrentMatchId && effectiveCurrentMatchId !== null;
    const departed =
      previousMatchId !== effectiveCurrentMatchId &&
      previousMatchId !== null &&
      hasActuallyLeft;

    const mode = getAssertivenessMode(notifPrefs);

    let arrival: ArrivalSurface | null = null;
    if (arrived && effectiveCurrentMatchId && effectiveCurrentMatchName) {
      arrival = await buildArrivalSurface(
        userId,
        effectiveCurrentMatchId,
        effectiveCurrentMatchName
      );
    }

    let departure: DepartureSurface | null = null;
    if (departed && previousMatchId && previousLocation?.matchedLocationName) {
      departure = await buildDepartureSurface(
        userId,
        previousMatchId,
        previousLocation.matchedLocationName,
        { latitude, longitude },
        savedLocations,
        mode
      );
    }

    return NextResponse.json({ ok: true, arrival, departure });
  } catch (error) {
    console.error("[Location] Update error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// --- Helpers ---

function findLocationId(
  savedLocations: Awaited<ReturnType<typeof getSavedLocations>>,
  name: string
): string | null {
  const loc = savedLocations.find((l) => l.name.toLowerCase() === name.toLowerCase());
  return loc?.id ?? null;
}

/**
 * Check if the user has actually left a geofence using hysteresis.
 * Returns true if distance > radius * 1.25, false if still within buffer.
 */
function checkHysteresisExit(
  current: { latitude: number; longitude: number },
  savedLocations: Awaited<ReturnType<typeof getSavedLocations>>,
  previousLocationId: string
): boolean {
  const prevLoc = savedLocations.find((l) => l.id === previousLocationId);
  if (!prevLoc?.latitude || !prevLoc?.longitude) return true;

  const distance = haversineDistance(current, {
    latitude: parseFloat(prevLoc.latitude),
    longitude: parseFloat(prevLoc.longitude),
  });
  const exitRadius = (prevLoc.radiusMeters ?? 200) * 1.25;
  return distance > exitRadius;
}

async function buildArrivalSurface(
  userId: string,
  locationId: string,
  locationName: string
): Promise<ArrivalSurface | null> {
  // Dedup: skip if already surfaced for this location in the last 2 hours
  const recent = await getRecentLocationNotification(userId, locationId, "arrival");
  if (recent) return null;

  const matchingTasks = await getPendingTasksForLocation(userId, locationName);
  if (matchingTasks.length === 0) return null;

  const topTask = matchingTasks[0]; // Already sorted by deadline proximity

  await logLocationNotification(userId, locationId, topTask.id, "arrival");

  return {
    locationName,
    taskId: topTask.id,
    taskTitle: topTask.title,
    taskCount: matchingTasks.length,
  };
}

async function buildDepartureSurface(
  userId: string,
  departedLocationId: string,
  departedLocationName: string,
  currentCoords: { latitude: number; longitude: number },
  savedLocations: SavedLocation[],
  mode: ReturnType<typeof getAssertivenessMode>
): Promise<DepartureSurface | null> {
  // Only surface departure suggestions in balanced or assertive mode
  if (mode === "gentle") return null;

  const recent = await getRecentLocationNotification(userId, departedLocationId, "departure");
  if (recent) return null;

  // Find the nearest saved location (within 1km) that has matching tasks
  for (const loc of savedLocations) {
    if (loc.id === departedLocationId) continue;
    if (!loc.latitude || !loc.longitude) continue;

    const distance = haversineDistance(currentCoords, {
      latitude: parseFloat(loc.latitude),
      longitude: parseFloat(loc.longitude),
    });
    if (distance > 1000) continue;

    const tasks = await getPendingTasksForLocation(userId, loc.name);
    if (tasks.length === 0) continue;

    await logLocationNotification(userId, departedLocationId, null, "departure");

    return {
      departedLocationName,
      nearbyLocationName: loc.name,
      taskTitle: tasks[0].title,
    };
  }

  return null;
}
