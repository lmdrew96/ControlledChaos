import { db } from "../index";
import { commuteTimes, locations } from "../schema";
import { eq, and } from "drizzle-orm";
import { getUser } from "./users";
import { getCalendarEventsByDateRange } from "./calendar";
import { inferCurrentLocation } from "@/lib/calendar/commute-buffers";
import { startOfDayInTimezone } from "@/lib/timezone";

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
  // Commute times cascade on their own.
  const [deleted] = await db
    .delete(locations)
    .where(and(eq(locations.id, locationId), eq(locations.userId, userId)))
    .returning();
  return deleted;
}

/**
 * Mark one saved location as home, or clear it (isHome false). Home is
 * one-per-user, so marking a location clears the flag everywhere else first;
 * db.batch runs both as one transaction (neon-http has no db.transaction).
 */
export async function setHomeLocation(locationId: string, userId: string, isHome: boolean) {
  const setThis = db
    .update(locations)
    .set({ isHome })
    .where(and(eq(locations.id, locationId), eq(locations.userId, userId)))
    .returning();
  if (!isHome) {
    const [updated] = await setThis;
    return updated;
  }
  const [, [updated]] = await db.batch([
    db
      .update(locations)
      .set({ isHome: false })
      .where(and(eq(locations.userId, userId), eq(locations.isHome, true))),
    setThis,
  ]);
  return updated;
}

// ============================================================
// Current Location (inferred from the calendar)
// ============================================================

/**
 * Where the user probably is now — see inferCurrentLocation for the rule.
 * Pass `savedLocations` when the caller already has them.
 */
export async function getCurrentLocation(
  userId: string,
  timezone: string,
  savedLocations?: Awaited<ReturnType<typeof getSavedLocations>>
): Promise<{ id: string; name: string } | null> {
  const now = new Date();
  const dayStart = startOfDayInTimezone(now, timezone);
  const [saved, todaysEvents] = await Promise.all([
    savedLocations ?? getSavedLocations(userId),
    getCalendarEventsByDateRange(userId, dayStart, now, { committedOnly: true }),
  ]);
  if (saved.length === 0) return null;
  return inferCurrentLocation(todaysEvents, saved, now, dayStart);
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

/**
 * Everything travelBuffers() / commuteContextFrom() need, in one call.
 * `currentLocationId` is inferred from today's calendar (getCurrentLocation),
 * null when unknown.
 */
export async function getCommuteSetup(userId: string) {
  const [savedLocations, commutes, user] = await Promise.all([
    getSavedLocations(userId),
    getCommuteTimes(userId),
    getUser(userId),
  ]);
  const current = await getCurrentLocation(
    userId,
    user?.timezone ?? "America/New_York",
    savedLocations
  );
  return {
    savedLocations,
    commutes,
    currentLocationId: current?.id ?? null,
    currentLocationName: current?.name ?? null,
  };
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
  userId: string,
  fromLocationId: string,
  toLocationId: string,
  travelMode = "driving"
) {
  await db
    .delete(commuteTimes)
    .where(
      and(
        eq(commuteTimes.userId, userId),
        eq(commuteTimes.fromLocationId, fromLocationId),
        eq(commuteTimes.toLocationId, toLocationId),
        eq(commuteTimes.travelMode, travelMode)
      )
    );
}


