import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";

// Auth note: every mutation requires a Clerk identity (verified via auth.config.ts).
// We accept clerkUserId as an arg AND check it matches ctx.auth so the client's
// claim of identity is enforced server-side.

const NUDGE_COOLDOWN_MS = 30_000;

async function requireIdentity(ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Unauthorized: no Clerk identity");
  return identity.subject; // Clerk user id
}

// ---------- Mutations ----------

export const enterRoom = mutation({
  args: {
    roomId: v.string(),
    displayName: v.string(),
    clerkUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const me = await requireIdentity(ctx);
    if (me !== args.clerkUserId) {
      throw new ConvexError("clerkUserId does not match authenticated identity");
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("presence")
      .withIndex("by_user", (q) => q.eq("clerkUserId", args.clerkUserId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        roomId: args.roomId,
        displayName: args.displayName,
        status: "active",
        sessionStartedAt: now,
        lastActiveAt: now,
        displayCategory: undefined,
        displayTitle: undefined,
        displayEnergy: undefined,
      });
      return existing._id;
    }

    return await ctx.db.insert("presence", {
      clerkUserId: args.clerkUserId,
      roomId: args.roomId,
      displayName: args.displayName,
      status: "active",
      sessionStartedAt: now,
      lastActiveAt: now,
    });
  },
});

export const exitRoom = mutation({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    const me = await requireIdentity(ctx);
    if (me !== args.clerkUserId) {
      throw new ConvexError("clerkUserId does not match authenticated identity");
    }

    const existing = await ctx.db
      .query("presence")
      .withIndex("by_user", (q) => q.eq("clerkUserId", args.clerkUserId))
      .first();

    if (existing) await ctx.db.delete(existing._id);
  },
});

export const updatePresence = mutation({
  args: {
    clerkUserId: v.string(),
    displayCategory: v.optional(v.union(v.string(), v.null())),
    displayTitle: v.optional(v.union(v.string(), v.null())),
    displayEnergy: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const me = await requireIdentity(ctx);
    if (me !== args.clerkUserId) {
      throw new ConvexError("clerkUserId does not match authenticated identity");
    }

    const existing = await ctx.db
      .query("presence")
      .withIndex("by_user", (q) => q.eq("clerkUserId", args.clerkUserId))
      .first();
    if (!existing) return; // not in a room — caller should treat as no-op

    const patch: Record<string, unknown> = { lastActiveAt: Date.now() };
    // null = explicit clear; undefined = leave unchanged
    if (args.displayCategory !== undefined) {
      patch.displayCategory = args.displayCategory ?? undefined;
    }
    if (args.displayTitle !== undefined) {
      patch.displayTitle = args.displayTitle ?? undefined;
    }
    if (args.displayEnergy !== undefined) {
      patch.displayEnergy = args.displayEnergy ?? undefined;
    }

    await ctx.db.patch(existing._id, patch);
  },
});

export const heartbeat = mutation({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    const me = await requireIdentity(ctx);
    if (me !== args.clerkUserId) return; // silent no-op on mismatch

    const existing = await ctx.db
      .query("presence")
      .withIndex("by_user", (q) => q.eq("clerkUserId", args.clerkUserId))
      .first();
    if (!existing) return;

    const updates: Record<string, unknown> = { lastActiveAt: Date.now() };
    // If user was idle and they came back, flip to active.
    if (existing.status === "idle") updates.status = "active";
    await ctx.db.patch(existing._id, updates);
  },
});

export const setFlare = mutation({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    const me = await requireIdentity(ctx);
    if (me !== args.clerkUserId) {
      throw new ConvexError("clerkUserId does not match authenticated identity");
    }

    const existing = await ctx.db
      .query("presence")
      .withIndex("by_user", (q) => q.eq("clerkUserId", args.clerkUserId))
      .first();
    if (!existing) throw new ConvexError("No active presence");

    await ctx.db.patch(existing._id, { status: "flare", lastActiveAt: Date.now() });
  },
});

export const clearFlare = mutation({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    const me = await requireIdentity(ctx);
    if (me !== args.clerkUserId) {
      throw new ConvexError("clerkUserId does not match authenticated identity");
    }

    const existing = await ctx.db
      .query("presence")
      .withIndex("by_user", (q) => q.eq("clerkUserId", args.clerkUserId))
      .first();
    if (!existing) return;

    await ctx.db.patch(existing._id, { status: "active", lastActiveAt: Date.now() });
  },
});

export const sendNudge = mutation({
  args: { roomId: v.string(), fromUserId: v.string() },
  handler: async (ctx, args) => {
    const me = await requireIdentity(ctx);
    if (me !== args.fromUserId) {
      throw new ConvexError("fromUserId does not match authenticated identity");
    }

    const since = Date.now() - NUDGE_COOLDOWN_MS;
    const recent = await ctx.db
      .query("roomEvents")
      .withIndex("by_room_time", (q) =>
        q.eq("roomId", args.roomId).gte("createdAt", since),
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("type"), "nudge"),
          q.eq(q.field("fromUserId"), args.fromUserId),
        ),
      )
      .first();

    if (recent) {
      throw new ConvexError("Nudge cooldown — wait a few seconds");
    }

    return await ctx.db.insert("roomEvents", {
      roomId: args.roomId,
      type: "nudge",
      fromUserId: args.fromUserId,
      createdAt: Date.now(),
    });
  },
});

export const sendEncourage = mutation({
  args: {
    roomId: v.string(),
    fromUserId: v.string(),
    toUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const me = await requireIdentity(ctx);
    if (me !== args.fromUserId) {
      throw new ConvexError("fromUserId does not match authenticated identity");
    }
    if (args.fromUserId === args.toUserId) {
      throw new ConvexError("Cannot encourage yourself");
    }

    const target = await ctx.db
      .query("presence")
      .withIndex("by_user", (q) => q.eq("clerkUserId", args.toUserId))
      .first();
    if (!target || target.status !== "flare") {
      throw new ConvexError("Target is not flaring");
    }
    if (target.roomId !== args.roomId) {
      throw new ConvexError("Target is not in this room");
    }

    return await ctx.db.insert("roomEvents", {
      roomId: args.roomId,
      type: "encourage",
      fromUserId: args.fromUserId,
      toUserId: args.toUserId,
      createdAt: Date.now(),
    });
  },
});

export const recordCompletion = mutation({
  args: { roomId: v.string(), fromUserId: v.string() },
  handler: async (ctx, args) => {
    const me = await requireIdentity(ctx);
    if (me !== args.fromUserId) {
      throw new ConvexError("fromUserId does not match authenticated identity");
    }

    return await ctx.db.insert("roomEvents", {
      roomId: args.roomId,
      type: "completion",
      fromUserId: args.fromUserId,
      createdAt: Date.now(),
    });
  },
});

// ---------- Queries (reactive) ----------

export const getRoomPresence = query({
  args: { roomId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("presence")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();
  },
});

export const getRecentEvents = query({
  args: { roomId: v.string(), since: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("roomEvents")
      .withIndex("by_room_time", (q) =>
        q.eq("roomId", args.roomId).gte("createdAt", args.since),
      )
      .order("asc")
      .collect();
  },
});

export const getMyPresence = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("presence")
      .withIndex("by_user", (q) => q.eq("clerkUserId", args.clerkUserId))
      .first();
  },
});

// Internal helper for /api/rooms occupancy joins. Called via ConvexHttpClient
// from the Next.js API route (not exposed to the browser directly).
export const getRoomOccupancy = query({
  args: { roomIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const counts: Record<string, number> = {};
    for (const roomId of args.roomIds) {
      const rows = await ctx.db
        .query("presence")
        .withIndex("by_room", (q) => q.eq("roomId", roomId))
        .collect();
      counts[roomId] = rows.length;
    }
    return counts;
  },
});
