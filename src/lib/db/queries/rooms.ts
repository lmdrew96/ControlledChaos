import { db } from "../index";
import { rooms, roomMembers, users } from "../schema";
import { eq, and, asc, gt, or, inArray, isNull, sql } from "drizzle-orm";
import { getAcceptedFriends } from "./friends";

// ============================================================
// Parallel Play — Rooms
// ============================================================

export type RoomRow = typeof rooms.$inferSelect;

/**
 * Generate a short, URL-safe invite code (8 chars, base32-ish).
 * Collision-resistant for our scale (rooms are personal/small group).
 */
function generateInviteCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no I,L,O,0,1
  let code = "";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  for (let i = 0; i < 8; i++) {
    code += alphabet[bytes[i] % alphabet.length];
  }
  return code;
}

export async function getOrCreatePersonalRoom(userId: string): Promise<RoomRow> {
  const [existing] = await db
    .select()
    .from(rooms)
    .where(and(eq(rooms.ownerId, userId), eq(rooms.type, "personal")))
    .limit(1);
  if (existing) return existing;

  // Retry once on the (extremely unlikely) invite-code collision.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const [created] = await db
        .insert(rooms)
        .values({
          ownerId: userId,
          type: "personal",
          name: null,
          inviteCode: generateInviteCode(),
        })
        .returning();
      // Owner is implicitly a member.
      await db
        .insert(roomMembers)
        .values({ roomId: created.id, userId })
        .onConflictDoNothing();
      return created;
    } catch (err) {
      if (attempt === 2) throw err;
    }
  }
  throw new Error("Could not create personal room after retries");
}

export async function createAdhocRoom(params: {
  ownerId: string;
  name: string;
  maxCapacity?: number;
  expiresAt?: Date | null;
}): Promise<RoomRow> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const [created] = await db
        .insert(rooms)
        .values({
          ownerId: params.ownerId,
          type: "adhoc",
          name: params.name,
          maxCapacity: params.maxCapacity ?? 8,
          expiresAt: params.expiresAt ?? null,
          inviteCode: generateInviteCode(),
        })
        .returning();
      await db
        .insert(roomMembers)
        .values({ roomId: created.id, userId: params.ownerId })
        .onConflictDoNothing();
      return created;
    } catch (err) {
      if (attempt === 2) throw err;
    }
  }
  throw new Error("Could not create adhoc room after retries");
}

export async function getRoomById(roomId: string): Promise<RoomRow | null> {
  const [row] = await db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
  return row ?? null;
}

export async function getRoomByInviteCode(code: string): Promise<RoomRow | null> {
  const [row] = await db
    .select()
    .from(rooms)
    .where(eq(rooms.inviteCode, code))
    .limit(1);
  return row ?? null;
}

export async function listRoomsForUser(userId: string): Promise<
  Array<RoomRow & { isOwner: boolean; memberCount: number }>
> {
  // All rooms the user is a member of (owner is always a member, see helpers above).
  const memberRows = await db
    .select({ roomId: roomMembers.roomId })
    .from(roomMembers)
    .where(eq(roomMembers.userId, userId));

  if (memberRows.length === 0) return [];
  const roomIds = memberRows.map((r) => r.roomId);

  const roomRows = await db
    .select()
    .from(rooms)
    .where(inArray(rooms.id, roomIds));

  // Member counts per room — single grouped query.
  const counts = await db
    .select({
      roomId: roomMembers.roomId,
      count: sql<number>`count(*)::int`,
    })
    .from(roomMembers)
    .where(inArray(roomMembers.roomId, roomIds))
    .groupBy(roomMembers.roomId);

  const countMap = new Map(counts.map((c) => [c.roomId, c.count]));

  return roomRows.map((r) => ({
    ...r,
    isOwner: r.ownerId === userId,
    memberCount: countMap.get(r.id) ?? 0,
  }));
}

/**
 * Rooms hosted by users in this user's friends list, that the user has not
 * already joined, where the room hasn't expired. Powers the "Friends' rooms"
 * browse view in RoomManager — live occupancy is layered on the client via
 * Convex's reactive presence query.
 */
export async function getRoomsHostedByFriends(userId: string): Promise<
  Array<{
    id: string;
    name: string | null;
    type: "personal" | "adhoc";
    inviteCode: string;
    maxCapacity: number;
    expiresAt: Date | null;
    hostId: string;
    hostName: string | null;
  }>
> {
  const friends = await getAcceptedFriends(userId);
  if (friends.length === 0) return [];
  const friendIds = friends.map((f) => f.friendId);

  // Rooms the user is already a member of — surface in "Joined rooms" instead
  // of duplicating them here.
  const myMemberships = await db
    .select({ roomId: roomMembers.roomId })
    .from(roomMembers)
    .where(eq(roomMembers.userId, userId));
  const memberRoomIds = new Set(myMemberships.map((m) => m.roomId));

  const now = new Date();
  const rows = await db
    .select({
      id: rooms.id,
      name: rooms.name,
      type: rooms.type,
      inviteCode: rooms.inviteCode,
      maxCapacity: rooms.maxCapacity,
      expiresAt: rooms.expiresAt,
      hostId: rooms.ownerId,
      hostName: users.displayName,
    })
    .from(rooms)
    .innerJoin(users, eq(users.id, rooms.ownerId))
    .where(
      and(
        inArray(rooms.ownerId, friendIds),
        or(isNull(rooms.expiresAt), gt(rooms.expiresAt, now))
      )
    )
    .orderBy(asc(users.displayName), asc(rooms.createdAt));

  return rows
    .filter((r) => !memberRoomIds.has(r.id))
    .map((r) => ({
      ...r,
      type: r.type as "personal" | "adhoc",
    }));
}

export async function isRoomMember(
  roomId: string,
  userId: string
): Promise<boolean> {
  const [row] = await db
    .select({ id: roomMembers.id })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)))
    .limit(1);
  return !!row;
}

export async function getRoomMemberCount(roomId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(roomMembers)
    .where(eq(roomMembers.roomId, roomId));
  return row?.count ?? 0;
}

/**
 * Idempotent join. Returns true if newly added, false if already a member.
 * Throws if room is at capacity.
 */
export async function joinRoom(
  roomId: string,
  userId: string
): Promise<{ added: boolean; alreadyMember: boolean }> {
  const room = await getRoomById(roomId);
  if (!room) throw new Error("Room not found");

  const already = await isRoomMember(roomId, userId);
  if (already) return { added: false, alreadyMember: true };

  const count = await getRoomMemberCount(roomId);
  if (count >= (room.maxCapacity ?? 8)) {
    throw new Error("Room is at capacity");
  }

  await db
    .insert(roomMembers)
    .values({ roomId, userId })
    .onConflictDoNothing();
  return { added: true, alreadyMember: false };
}

/**
 * Remove a user from a room. If the user is the owner of an adhoc room and is
 * the last member, the room is deleted (cascades room_members). Personal rooms
 * always persist for their owner — we just leave the member row in place.
 */
export async function leaveRoom(
  roomId: string,
  userId: string
): Promise<{ left: boolean; roomDeleted: boolean }> {
  const room = await getRoomById(roomId);
  if (!room) return { left: false, roomDeleted: false };

  // Personal-room owners can't leave their own room — it's their default room.
  if (room.type === "personal" && room.ownerId === userId) {
    return { left: false, roomDeleted: false };
  }

  await db
    .delete(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));

  // If owner of an adhoc room is leaving and no members remain → delete.
  if (room.type === "adhoc" && room.ownerId === userId) {
    const remaining = await getRoomMemberCount(roomId);
    if (remaining === 0) {
      await db.delete(rooms).where(eq(rooms.id, roomId));
      return { left: true, roomDeleted: true };
    }
  }

  return { left: true, roomDeleted: false };
}

/**
 * Owner-only: kick a member. Returns true if a row was removed.
 */
export async function revokeRoomMember(
  roomId: string,
  ownerId: string,
  targetUserId: string
): Promise<boolean> {
  const room = await getRoomById(roomId);
  if (!room || room.ownerId !== ownerId) return false;
  if (targetUserId === ownerId) return false; // owner cannot kick self

  const result = await db
    .delete(roomMembers)
    .where(
      and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, targetUserId))
    )
    .returning({ id: roomMembers.id });
  return result.length > 0;
}

export async function listRoomMembers(
  roomId: string
): Promise<Array<{ userId: string; displayName: string | null; joinedAt: Date }>> {
  return await db
    .select({
      userId: roomMembers.userId,
      displayName: users.displayName,
      joinedAt: roomMembers.joinedAt,
    })
    .from(roomMembers)
    .innerJoin(users, eq(roomMembers.userId, users.id))
    .where(eq(roomMembers.roomId, roomId))
    .orderBy(asc(roomMembers.joinedAt));
}

