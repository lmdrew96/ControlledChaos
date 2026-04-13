import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import {
  getSavedLocations,
  getUser,
  getUserLocation,
  getUserSettings,
  upsertUserLocation,
  getPendingTasksForLocation,
  getRecentLocationNotification,
  logLocationNotification,
} from "@/lib/db/queries";
import { haversineDistance, matchLocation } from "@/lib/context/location";
import type { SavedLocation } from "@/lib/context/location";
import { sendPushToUser } from "@/lib/notifications/send-push";
import {
  generatePushMessage,
  getAssertivenessMode,
  getDailyPushCap,
  getPushNotificationsSentToday,
} from "@/lib/notifications/triggers";
import type { NotificationPrefs, PersonalityPrefs } from "@/types";

const TASK_ACTIONS = [
  { action: "start_task", title: "▶ Start" },
  { action: "snooze", title: "⏰ Snooze 30 min" },
];

/**
 * POST /api/location/update
 * Client reports position. Server detects geofence transitions and fires notifications.
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

    // Fetch saved locations, previous position, settings, and user in parallel
    const [savedLocations, previousLocation, settings, user] = await Promise.all([
      getSavedLocations(userId),
      getUserLocation(userId),
      getUserSettings(userId),
      getUser(userId),
    ]);
    const timezone = user?.timezone ?? "America/New_York";

    const notifPrefs = settings?.notificationPrefs as NotificationPrefs | null;

    // Bail if location notifications are disabled
    if (!notifPrefs?.locationNotificationsEnabled) {
      // Still save location for cron job context
      await upsertUserLocation(userId, {
        latitude: latitude.toString(),
        longitude: longitude.toString(),
        matchedLocationId: null,
        matchedLocationName: null,
      });
      return NextResponse.json({ ok: true });
    }

    // Match current position against saved locations
    const currentMatch = matchLocation(
      { latitude, longitude },
      savedLocations
    );

    const previousMatchId = previousLocation?.matchedLocationId ?? null;
    const currentMatchId = currentMatch
      ? findLocationId(savedLocations, currentMatch.name)
      : null;

    // Hysteresis check: if we were previously "inside" a location, require
    // distance > radius * 1.25 to count as "left" (prevents GPS bounce)
    const hasActuallyLeft =
      previousMatchId && !currentMatchId
        ? checkHysteresisExit(
            { latitude, longitude },
            savedLocations,
            previousMatchId
          )
        : true;

    const effectiveCurrentMatchId =
      !hasActuallyLeft ? previousMatchId : currentMatchId;
    const effectiveCurrentMatchName =
      !hasActuallyLeft
        ? previousLocation?.matchedLocationName ?? null
        : currentMatch?.name ?? null;

    // Upsert position
    await upsertUserLocation(userId, {
      latitude: latitude.toString(),
      longitude: longitude.toString(),
      matchedLocationId: effectiveCurrentMatchId,
      matchedLocationName: effectiveCurrentMatchName,
    });

    // Detect transitions
    const arrived =
      previousMatchId !== effectiveCurrentMatchId &&
      effectiveCurrentMatchId !== null;
    const departed =
      previousMatchId !== effectiveCurrentMatchId &&
      previousMatchId !== null &&
      hasActuallyLeft;

    // Fire notifications (non-blocking — don't hold up the response)
    const personalityPrefs = settings?.personalityPrefs as PersonalityPrefs | null;
    const mode = getAssertivenessMode(notifPrefs);

    if (arrived && effectiveCurrentMatchId && effectiveCurrentMatchName) {
      handleArrival(
        userId,
        effectiveCurrentMatchId,
        effectiveCurrentMatchName,
        personalityPrefs,
        notifPrefs,
        mode,
        timezone
      ).catch((err) =>
        console.error("[Location] Arrival notification error:", err)
      );
    }

    if (departed && previousMatchId && previousLocation?.matchedLocationName) {
      handleDeparture(
        userId,
        previousMatchId,
        previousLocation.matchedLocationName,
        { latitude, longitude },
        savedLocations,
        personalityPrefs,
        notifPrefs,
        mode,
        timezone
      ).catch((err) =>
        console.error("[Location] Departure notification error:", err)
      );
    }

    return NextResponse.json({ ok: true });
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
  const loc = savedLocations.find(
    (l) => l.name.toLowerCase() === name.toLowerCase()
  );
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

async function handleArrival(
  userId: string,
  locationId: string,
  locationName: string,
  personalityPrefs: PersonalityPrefs | null,
  notifPrefs: NotificationPrefs,
  mode: ReturnType<typeof getAssertivenessMode>,
  timezone: string
) {
  // Dedup: skip if already notified for this location in last 2 hours
  const recent = await getRecentLocationNotification(
    userId,
    locationId,
    "arrival"
  );
  if (recent) {
    console.log(
      `[Location] Skipping arrival notification — already sent ${locationName} (${locationId})`
    );
    return;
  }

  // Check daily cap
  const dailyCap = getDailyPushCap(mode);
  const sentToday = await getPushNotificationsSentToday(userId, timezone);
  if (sentToday >= dailyCap) return;

  // Find tasks that match this location
  const matchingTasks = await getPendingTasksForLocation(userId, locationName);
  if (matchingTasks.length === 0) return;

  const topTask = matchingTasks[0]; // Already sorted by deadline proximity

  const message = await generatePushMessage(
    {
      type: "location_arrival",
      locationName,
      taskTitle: topTask.title,
      taskCount: matchingTasks.length,
    },
    personalityPrefs,
    undefined,
    mode
  );

  const sent = await sendPushToUser(userId, {
    title: "ControlledChaos",
    body: message,
    url: `/tasks?taskId=${topTask.id}`,
    tag: `location-arrival-${locationId}`,
    taskId: topTask.id,
    userId,
    actions: TASK_ACTIONS,
  });

  if (sent) {
    await logLocationNotification(userId, locationId, topTask.id, "arrival");
    console.log(
      `[Location] Arrival notification sent: ${locationName} → ${topTask.title}`
    );
  }
}

async function handleDeparture(
  userId: string,
  departedLocationId: string,
  departedLocationName: string,
  currentCoords: { latitude: number; longitude: number },
  savedLocations: SavedLocation[],
  personalityPrefs: PersonalityPrefs | null,
  notifPrefs: NotificationPrefs,
  mode: ReturnType<typeof getAssertivenessMode>,
  timezone: string
) {
  // Only send departure notifications in balanced or assertive mode
  if (mode === "gentle") return;

  // Dedup
  const recent = await getRecentLocationNotification(
    userId,
    departedLocationId,
    "departure"
  );
  if (recent) return;

  // Check daily cap
  const dailyCap = getDailyPushCap(mode);
  const sentToday = await getPushNotificationsSentToday(userId, timezone);
  if (sentToday >= dailyCap) return;

  // Find nearby locations (within 1km) that have matching tasks
  const nearbyWithTasks: Array<{
    location: SavedLocation;
    taskTitle: string;
  }> = [];

  for (const loc of savedLocations) {
    if (loc.id === departedLocationId) continue;
    if (!loc.latitude || !loc.longitude) continue;

    const distance = haversineDistance(currentCoords, {
      latitude: parseFloat(loc.latitude),
      longitude: parseFloat(loc.longitude),
    });

    if (distance <= 1000) {
      // Within 1km
      const tasks = await getPendingTasksForLocation(userId, loc.name);
      if (tasks.length > 0) {
        nearbyWithTasks.push({ location: loc, taskTitle: tasks[0].title });
      }
    }
  }

  if (nearbyWithTasks.length === 0) return;

  const nearest = nearbyWithTasks[0];

  const message = await generatePushMessage(
    {
      type: "location_departure_nearby",
      locationName: departedLocationName,
      nearbyLocationName: nearest.location.name,
      taskTitle: nearest.taskTitle,
    },
    personalityPrefs,
    undefined,
    mode
  );

  const sent = await sendPushToUser(userId, {
    title: "ControlledChaos",
    body: message,
    url: `/tasks`,
    tag: `location-departure-${departedLocationId}`,
    userId,
  });

  if (sent) {
    await logLocationNotification(
      userId,
      departedLocationId,
      null,
      "departure"
    );
    console.log(
      `[Location] Departure notification sent: left ${departedLocationName}, nearby ${nearest.location.name}`
    );
  }
}
