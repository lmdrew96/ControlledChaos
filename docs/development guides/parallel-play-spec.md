# Parallel Play — Feature Spec

**Project:** ControlledChaos
**Feature:** Parallel Play (ambient co-presence / digital body doubling)
**Status:** Design complete, ready for implementation
**Date:** 2026-04-29

---

## Overview

Parallel Play adds ambient social presence to ControlledChaos — the ability to work alongside friends without collaboration overhead. Users toggle into a shared room where they can see that others are working, what category/energy they're at, and send non-verbal signals of support. No chat, no task sharing, no accountability pressure. Just co-presence.

**Core philosophy:** Your task manager becomes a place you go, not just a tool you use — and sometimes other people are there too.

---

## Architecture

### Dual-Backend Strategy

The feature spans two backends with a clean boundary:

| Layer | Backend | Why |
|-------|---------|-----|
| **Persistent** (rooms, members, task visibility settings) | Drizzle / Neon Postgres | Relational, auth-tied, permanent data — lives with existing CC schema |
| **Ephemeral** (presence, nudges, flares, completion events) | Convex | Real-time reactive subscriptions, no polling needed, ephemeral by nature |

Convex is already in the ADHDesigns stack (ScribeCat v3). Auth bridge: Clerk → Convex via existing pattern.

### Data Flow Summary

```
User enters room:
  CC verifies membership (Drizzle) → writes presence (Convex)

User hits Start Now:
  CC updates task status (Drizzle) → pushes display fields to presence (Convex)
  → Other clients reactively see bubble update (Convex subscription)

User hits Finished:
  CC completes task (Drizzle) → writes completion event (Convex)
  → Other clients animate bubble sparkle (Convex subscription)
  → Clears active task from presence

User sends Nudge:
  → Writes nudge event (Convex) → all room clients react

User sends Flare:
  → Updates presence.status = "flare" (Convex)
  → Other users see bubble shift, can send Encourage back
```

---

## Schema — Drizzle (Persistent)

Add to `src/lib/db/schema.ts`:

### rooms

```typescript
export const rooms = pgTable("rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id")
    .references(() => users.id).notNull(),
  name: text("name"),                              // null = personal room (unnamed)
  inviteCode: text("invite_code").notNull().unique(),
  type: text("type").default("personal").notNull(), // "personal" | "adhoc"
  maxCapacity: integer("max_capacity").default(8),
  expiresAt: timestamp("expires_at"),              // null = permanent, set = auto-archive
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

### room_members

```typescript
export const roomMembers = pgTable("room_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  roomId: uuid("room_id")
    .references(() => rooms.id, { onDelete: "cascade" }).notNull(),
  userId: text("user_id")
    .references(() => users.id).notNull(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("idx_room_members_unique").on(table.roomId, table.userId),
]);
```

### tasks — add column

```typescript
roomVisibility: text("room_visibility").default("category"),
// "none" | "category" | "title"
// Controls what's broadcast to room presence when this task is active
```

---

## Schema — Convex (Ephemeral / Real-Time)

New Convex project or module within existing Convex setup.

### convex/schema.ts

```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  presence: defineTable({
    clerkUserId: v.string(),
    roomId: v.string(),              // references Drizzle rooms.id (UUID string)
    displayName: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("idle"),
      v.literal("flare")
    ),
    displayCategory: v.optional(v.string()),  // "school" | "work" | etc. or absent
    displayTitle: v.optional(v.string()),      // task title or absent
    displayEnergy: v.optional(v.string()),     // "low" | "medium" | "high" or absent
    sessionStartedAt: v.number(),              // Date.now() timestamp
    lastActiveAt: v.number(),
  })
    .index("by_room", ["roomId"])
    .index("by_user", ["clerkUserId"]),

  roomEvents: defineTable({
    roomId: v.string(),
    type: v.union(
      v.literal("nudge"),         // room-wide pulse
      v.literal("encourage"),     // personal response to flare
      v.literal("completion"),    // someone finished a task
    ),
    fromUserId: v.string(),
    toUserId: v.optional(v.string()),   // only for "encourage"
    createdAt: v.number(),
  })
    .index("by_room_time", ["roomId", "createdAt"]),
});
```

---

## API Routes — Next.js (Drizzle)

### Room Management

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/rooms` | Create a room. Auto-create personal room on first use. Generate invite code. |
| `GET` | `/api/rooms` | List rooms the user owns or is a member of. Include live occupancy count (query Convex). |
| `POST` | `/api/rooms/[id]/join` | Join a room via invite code. Validates code, adds to room_members. |
| `DELETE` | `/api/rooms/[id]/leave` | Remove self from room_members. If owner, transfer or archive. |
| `DELETE` | `/api/rooms/[id]/members/[userId]` | Owner revokes a member's access. |

### Task Extension

Existing task PATCH endpoint gets `roomVisibility` as an accepted field. No new route needed.

---

## Convex Functions

### Mutations

| Function | Description |
|----------|-------------|
| `enterRoom(roomId, displayName, clerkUserId)` | Upsert presence row. Sets sessionStartedAt, status=active. |
| `exitRoom(clerkUserId)` | Delete presence row for this user. |
| `updatePresence(clerkUserId, fields)` | Update displayCategory, displayTitle, displayEnergy, lastActiveAt. Called when user starts/finishes a task. |
| `setFlare(clerkUserId)` | Set status="flare" on presence row. |
| `clearFlare(clerkUserId)` | Set status="active" on presence row. Easy cancel. |
| `sendNudge(roomId, fromUserId)` | Insert nudge event into roomEvents. |
| `sendEncourage(roomId, fromUserId, toUserId)` | Insert encourage event. Only allowed if target's status="flare". |
| `recordCompletion(roomId, fromUserId)` | Insert completion event into roomEvents. |

### Queries (Reactive)

| Function | Description |
|----------|-------------|
| `getRoomPresence(roomId)` | Return all presence rows for a room. Clients subscribe reactively. |
| `getRecentEvents(roomId, since)` | Return roomEvents newer than `since`. Used to trigger animations. |
| `getMyPresence(clerkUserId)` | Return current user's presence (which room, status, etc.). |

### Scheduled Functions (Crons)

| Function | Interval | Description |
|----------|----------|-------------|
| `cleanIdlePresence` | Every 5 min | If `lastActiveAt` > 10 min ago with no task activity → set status="idle". If > 30 min → delete presence row (auto-exit). |
| `cleanOldEvents` | Every 5 min | Delete roomEvents older than 2 minutes. They only exist to trigger animations. |

---

## UX Specification

### Toggle Mode

Parallel play is a **toggle overlay** on the existing CC task view, not a separate page.

**Toggle off:** Standard CC task list + Haiku recommender.
**Toggle on:** Same task list, with additions:
- **Top-left:** Personal session timer (time since you entered the room)
- **Top-right:** Presence bubbles (one per person in room)
- **Bottom:** Nudge button (room-wide)

Toggle icon: campfire 🔥 in header/nav. Tap → select room (or auto-enter last room) → social layer fades in. Icon reflects state: 🔥 = in a room, ○ = not.

Toggling off hides the social layer but does NOT exit the room. User remains present. To exit fully, explicit action needed.

### Presence Bubbles

Small circular avatars/initials in the top-right. Compact when collapsed, showing only dots.

**Tap to expand** a bubble → shows:
- Display name
- Status text: "[Name] is working!" / "[Name] is working on [Category] stuff!" / "[Name] is working on [Task Title]!"
- Energy indicator (visual intensity, not a label)
- Session duration for that person
- If status=flare: 💛 Encourage button appears

**Bubble animations:**
- Completion event → bubble sparkles/ripples briefly
- Room-wide nudge → all bubbles bounce
- Flare → bubble pulses slowly with warm color shift
- Encourage received → brief warm glow on your own UI (if you're the flared user)
- Idle → bubble dims

### Task Interactions in Room Mode

Tasks show the same `[Start Now]` and `[Finished]` buttons as normal.

**Start Now:**
1. Check task's `roomVisibility` setting
2. Update Convex presence with appropriate display fields
3. Bubble updates for all room members

**Finished:**
1. Complete task in Drizzle (normal flow)
2. Record completion event in Convex
3. Clear active task from presence
4. Bubble sparkles for room members
5. Haiku recommender fires next suggestion

### Privacy Tiers (Per-Task)

Each task has a `roomVisibility` field:

| Value | What's broadcast | Status text |
|-------|-----------------|-------------|
| `"none"` | Presence only | "[Name] is working!" |
| `"category"` | Task category | "[Name] is working on [Category] stuff!" |
| `"title"` | Full task title | "[Name] is working on [Task Title]!" |

**Default:** `"category"` — set during task creation/editing. Can be changed via tap-cycle on the task row before starting, but Start Now is never blocked by this decision.

When switching between tasks with different visibility levels, the bubble text transitions smoothly with no announcement.

### Nudge System

**Normal state:** Single `👋 Nudge` button at bottom of room view. Tap → room-wide pulse → all bubbles bounce. Cooldown: ~30 seconds between nudges to prevent spam.

**Flare state:** When someone sets status=flare, their bubble shifts visually (slow pulse, warm color). Expanding their bubble reveals a `💛 Encourage` button. Tapping it sends a personal encourage event to that user only.

**What the flared user receives:** A brief visual warmth/glow effect. No text, no count, no names. Just felt acknowledgment.

**Flare cancellation:** Easy — tap to flare, tap again to cancel. No announcement, bubble just settles back.

### Rooms

**Personal room:** Auto-created for each user. Always appears first in room list. Unnamed by default.

**Room list UI:**
```
Your Room          ● ●  (2 people here)
Ashley's Room      ● ● ● (3 people here)
Study Group        ○ (empty)
```

**Invite:** Share a room code/link. Recipient joins via code. No friend request flow needed — friendships table already handles trust.

**Ad-hoc rooms:** Created with a name and optional expiry. Auto-archive after extended inactivity.

**Capacity:** 6-8 people max. Small by design — parallel play breaks in crowds.

### Haiku Integration

The AI recommender can factor in room context:
- "Ashley is active right now — good time to start a focus session?"
- "The room energy is high — want to tackle that LING 202 outline?"
- "You and two others are in low-energy mode. Here are some gentle tasks."
- "Two people in your room are in School mode — want to grab that CGSC 170 reading?"

This is enhancement-level, not MVP. Ship rooms + presence first, then wire Haiku awareness.

### Crisis Mode Integration

- Entering Crisis Mode does NOT auto-flare the room. Flare is a separate, intentional action.
- Crisis Mode + Flare together = "I'm struggling and I want my room to know."
- Crisis Mode without Flare = "I'm handling this privately."

---

## Implementation Order

### Phase 1: Foundation (Patches 1-3)
1. Drizzle schema additions (rooms, room_members, tasks.roomVisibility)
2. Convex project setup + schema (presence, roomEvents)
3. Room CRUD API routes

### Phase 2: Core Real-Time (Patches 4-6)
4. Convex mutations + queries (enter/exit/update/nudge/flare)
5. Presence bubble component + reactive subscriptions
6. Toggle mode UI integration (overlay on task view)

### Phase 3: Task Integration (Patches 7-8)
7. Start Now / Finished → presence auto-update flow
8. Per-task roomVisibility setting UI

### Phase 4: Social Signals (Patches 9-10)
9. Nudge + flare + encourage UX (animations, events, cooldowns)
10. Idle detection cron + auto-exit logic

### Phase 5: Polish (Patches 11-12)
11. Room management UI (invite, join, leave, ad-hoc rooms)
12. Haiku room-awareness integration

---

## Non-Goals

- No chat or messaging (Cha(t)os handles that)
- No task sharing or collaborative task management
- No leaderboards or individual metrics visible to others
- No notification if you're not in the room (not a bat signal)
- No history/logging of presence sessions
- No video/audio (this isn't Focusmate)

---

## Tech Stack Reference

| Component | Technology |
|-----------|-----------|
| Framework | Next.js 16 (App Router) |
| Auth | Clerk |
| Persistent DB | Neon Postgres + Drizzle ORM |
| Real-time DB | Convex |
| UI | React 19, Tailwind 4, shadcn/ui, Framer Motion |
| AI | Anthropic Haiku (existing CC integration) |
| Hosting | Vercel |
