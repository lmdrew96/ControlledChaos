import { db } from "../index";
import { commuteTimes, locations } from "../schema";
import { eq, and, sql } from "drizzle-orm";

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

// ============================================================
// Commute Times
// ============================================================

export async function getCommuteTimes(userId: string) {
  return db
    .select()
    .from(commuteTimes)
    .where(eq(commuteTimes.userId, userId));
}

/** Everything travelBuffers() needs, in one call. */
export async function getCommuteSetup(userId: string) {
  const [savedLocations, commutes] = await Promise.all([
    getSavedLocations(userId),
    getCommuteTimes(userId),
  ]);
  return { savedLocations, commutes };
}

/**
 * Swap the user's stored commutes for a freshly computed set in one
 * transaction (db.batch), so readers never see a half-replaced table.
 */
export async function replaceCommuteTimes(
  userId: string,
  rows: Array<typeof commuteTimes.$inferInsert>
) {
  const clear = db.delete(commuteTimes).where(eq(commuteTimes.userId, userId));
  if (rows.length === 0) {
    await clear;
    return;
  }
  await db.batch([clear, db.insert(commuteTimes).values(rows)]);
}

/**
 * Users whose stored commutes don't cover every pair of their pinned
 * locations — a refresh failed (OSRM down) or predates them. One row per
 * direction means n pinned locations should have n(n-1) rows.
 */
export async function getUsersWithIncompleteCommutes(): Promise<string[]> {
  const result = await db.execute<{ user_id: string }>(sql`
    SELECT l.user_id
    FROM locations l
    WHERE l.latitude IS NOT NULL AND l.longitude IS NOT NULL
    GROUP BY l.user_id
    HAVING count(*) >= 2
      AND count(*) * (count(*) - 1) <> (
        SELECT count(*) FROM commute_times c WHERE c.user_id = l.user_id
      )
  `);
  return result.rows.map((r) => r.user_id);
}
