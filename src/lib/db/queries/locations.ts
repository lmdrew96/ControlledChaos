import { db } from "../index";
import { commuteTimes, locations, locationNotificationLog, userLocations } from "../schema";
import { eq, and, desc, gt } from "drizzle-orm";
import { getPendingTasks } from "./tasks";

// ============================================================
// Saved Locations
// ============================================================
export async function getSavedLocations(userId: string) {
  return db
    .select()
    .from(locations)
    .where(eq(locations.userId, userId))
    .orderBy(locations.createdAt);
}

export async function createLocation(params: {
  userId: string;
  name: string;
  latitude: string;
  longitude: string;
  radiusMeters?: number;
}) {
  const [loc] = await db.insert(locations).values(params).returning();
  return loc;
}

export async function updateLocation(
  locationId: string,
  userId: string,
  data: Partial<{
    name: string;
    latitude: string;
    longitude: string;
    radiusMeters: number;
  }>
) {
  const [updated] = await db
    .update(locations)
    .set(data)
    .where(and(eq(locations.id, locationId), eq(locations.userId, userId)))
    .returning();

  return updated;
}

export async function deleteLocation(locationId: string, userId: string) {
  const [deleted] = await db
    .delete(locations)
    .where(and(eq(locations.id, locationId), eq(locations.userId, userId)))
    .returning();

  return deleted;
}

// ============================================================
// User Location Tracking (geofence notifications)
// ============================================================

export async function getUserLocation(userId: string) {
  const [row] = await db
    .select()
    .from(userLocations)
    .where(eq(userLocations.userId, userId));
  return row ?? null;
}

export async function upsertUserLocation(
  userId: string,
  data: {
    latitude: string;
    longitude: string;
    matchedLocationId: string | null;
    matchedLocationName: string | null;
  }
) {
  const [row] = await db
    .insert(userLocations)
    .values({
      userId,
      ...data,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userLocations.userId,
      set: {
        latitude: data.latitude,
        longitude: data.longitude,
        matchedLocationId: data.matchedLocationId,
        matchedLocationName: data.matchedLocationName,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

export async function getPendingTasksForLocation(
  userId: string,
  locationName: string
) {
  const pending = await getPendingTasks(userId);
  return pending.filter((task) =>
    task.locationTags?.some(
      (tag) => tag.toLowerCase() === locationName.toLowerCase()
    )
  );
}

export async function getRecentLocationNotification(
  userId: string,
  locationId: string,
  event: "arrival" | "departure",
  withinHours = 2
) {
  const cutoff = new Date(Date.now() - withinHours * 60 * 60 * 1000);
  const [row] = await db
    .select()
    .from(locationNotificationLog)
    .where(
      and(
        eq(locationNotificationLog.userId, userId),
        eq(locationNotificationLog.locationId, locationId),
        eq(locationNotificationLog.event, event),
        gt(locationNotificationLog.createdAt, cutoff)
      )
    )
    .orderBy(desc(locationNotificationLog.createdAt))
    .limit(1);
  return row ?? null;
}

export async function logLocationNotification(
  userId: string,
  locationId: string,
  taskId: string | null,
  event: "arrival" | "departure"
) {
  await db.insert(locationNotificationLog).values({
    userId,
    locationId,
    taskId,
    event,
  });
}

// ============================================================
// Commute Times
// ============================================================

export async function getCommuteTimes(userId: string) {
  return db
    .select()
    .from(commuteTimes)
    .where(eq(commuteTimes.userId, userId));
}

export async function getCommuteBetween(
  fromLocationId: string,
  toLocationId: string,
  travelMode = "driving"
): Promise<number | null> {
  const [row] = await db
    .select({ travelMinutes: commuteTimes.travelMinutes })
    .from(commuteTimes)
    .where(
      and(
        eq(commuteTimes.fromLocationId, fromLocationId),
        eq(commuteTimes.toLocationId, toLocationId),
        eq(commuteTimes.travelMode, travelMode)
      )
    );
  return row?.travelMinutes ?? null;
}

export async function upsertCommuteTime(
  userId: string,
  fromLocationId: string,
  toLocationId: string,
  travelMinutes: number,
  travelMode = "driving"
) {
  const [existing] = await db
    .select({ id: commuteTimes.id })
    .from(commuteTimes)
    .where(
      and(
        eq(commuteTimes.fromLocationId, fromLocationId),
        eq(commuteTimes.toLocationId, toLocationId),
        eq(commuteTimes.travelMode, travelMode)
      )
    );

  if (existing) {
    const [updated] = await db
      .update(commuteTimes)
      .set({ travelMinutes, updatedAt: new Date() })
      .where(eq(commuteTimes.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(commuteTimes)
    .values({ userId, fromLocationId, toLocationId, travelMinutes, travelMode })
    .returning();
  return created;
}

export async function deleteCommuteTime(
  fromLocationId: string,
  toLocationId: string,
  travelMode = "driving"
) {
  await db
    .delete(commuteTimes)
    .where(
      and(
        eq(commuteTimes.fromLocationId, fromLocationId),
        eq(commuteTimes.toLocationId, toLocationId),
        eq(commuteTimes.travelMode, travelMode)
      )
    );
}


