import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Parallel Play — ephemeral real-time layer.
// Persistent room membership lives in Drizzle/Neon (rooms, room_members).
// This file holds only what needs reactive subscriptions and short-lived state.

export default defineSchema({
  presence: defineTable({
    clerkUserId: v.string(),
    roomId: v.string(), // references Drizzle rooms.id (UUID stringified)
    displayName: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("idle"),
      v.literal("flare"),
    ),
    displayCategory: v.optional(v.string()),
    displayTitle: v.optional(v.string()),
    displayEnergy: v.optional(v.string()),
    sessionStartedAt: v.number(),
    lastActiveAt: v.number(),
  })
    .index("by_room", ["roomId"])
    .index("by_user", ["clerkUserId"]),

  roomEvents: defineTable({
    roomId: v.string(),
    type: v.union(
      v.literal("nudge"),
      v.literal("encourage"),
      v.literal("completion"),
    ),
    fromUserId: v.string(),
    toUserId: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_room_time", ["roomId", "createdAt"]),
});
