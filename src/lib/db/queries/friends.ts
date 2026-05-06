import { db } from "../index";
import { friendships, nudges, users } from "../schema";
import { eq, and, desc, gte, or, sql } from "drizzle-orm";
import { startOfDayInTimezone } from "@/lib/timezone";

// ============================================================
// Friendships
// ============================================================

export async function findUserByEmail(email: string) {
  const result = await db
    .select({ id: users.id, email: users.email, displayName: users.displayName })
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);
  return result[0] ?? null;
}

export async function getExistingFriendship(userA: string, userB: string) {
  const result = await db
    .select()
    .from(friendships)
    .where(
      or(
        and(eq(friendships.requesterId, userA), eq(friendships.addresseeId, userB)),
        and(eq(friendships.requesterId, userB), eq(friendships.addresseeId, userA))
      )
    )
    .limit(1);
  return result[0] ?? null;
}

export async function createFriendRequest(requesterId: string, addresseeId: string) {
  const [row] = await db
    .insert(friendships)
    .values({ requesterId, addresseeId, status: "pending" })
    .returning();
  return row;
}

export async function respondToFriendRequest(
  friendshipId: string,
  userId: string,
  status: "accepted" | "declined"
) {
  const [row] = await db
    .update(friendships)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(friendships.id, friendshipId), eq(friendships.addresseeId, userId)))
    .returning();
  return row ?? null;
}

export async function getAcceptedFriends(userId: string) {
  // Get friendships where this user is requester
  const asRequester = await db
    .select({
      friendshipId: friendships.id,
      friendId: friendships.addresseeId,
      displayName: users.displayName,
      email: users.email,
    })
    .from(friendships)
    .innerJoin(users, eq(users.id, friendships.addresseeId))
    .where(and(eq(friendships.requesterId, userId), eq(friendships.status, "accepted")));

  // Get friendships where this user is addressee
  const asAddressee = await db
    .select({
      friendshipId: friendships.id,
      friendId: friendships.requesterId,
      displayName: users.displayName,
      email: users.email,
    })
    .from(friendships)
    .innerJoin(users, eq(users.id, friendships.requesterId))
    .where(and(eq(friendships.addresseeId, userId), eq(friendships.status, "accepted")));

  return [...asRequester, ...asAddressee];
}

export async function getPendingFriendRequests(userId: string) {
  return db
    .select({
      friendshipId: friendships.id,
      requesterId: friendships.requesterId,
      displayName: users.displayName,
      email: users.email,
      createdAt: friendships.createdAt,
    })
    .from(friendships)
    .innerJoin(users, eq(users.id, friendships.requesterId))
    .where(and(eq(friendships.addresseeId, userId), eq(friendships.status, "pending")))
    .orderBy(desc(friendships.createdAt));
}

export async function deleteFriendship(friendshipId: string, userId: string) {
  const [row] = await db
    .delete(friendships)
    .where(
      and(
        eq(friendships.id, friendshipId),
        or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId))
      )
    )
    .returning();
  return row ?? null;
}

// ============================================================
// Nudges
// ============================================================

export async function createNudge(
  senderId: string,
  recipientId: string,
  category: string,
  message: string
) {
  const [row] = await db
    .insert(nudges)
    .values({ senderId, recipientId, category, message })
    .returning();
  return row;
}

export async function getNudgeCountToday(
  senderId: string,
  recipientId: string,
  timezone: string
): Promise<number> {
  const dayStart = startOfDayInTimezone(new Date(), timezone);
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(nudges)
    .where(
      and(
        eq(nudges.senderId, senderId),
        eq(nudges.recipientId, recipientId),
        gte(nudges.sentAt, dayStart)
      )
    );
  return result[0]?.count ?? 0;
}


