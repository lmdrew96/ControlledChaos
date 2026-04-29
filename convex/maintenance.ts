import { internalMutation } from "./_generated/server";

const IDLE_THRESHOLD_MS = 10 * 60 * 1000; // 10 min → status=idle
const AUTO_EXIT_MS = 30 * 60 * 1000; // 30 min → presence row deleted
const EVENT_TTL_MS = 2 * 60 * 1000; // 2 min → roomEvents pruned

// cleanIdlePresence — promote inactive users to "idle" and evict the
// long-inactive entirely. Drizzle room_members is untouched; this only
// clears the ephemeral presence row.
export const cleanIdlePresence = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const all = await ctx.db.query("presence").collect();

    let idled = 0;
    let evicted = 0;

    for (const row of all) {
      const stale = now - row.lastActiveAt;

      if (stale > AUTO_EXIT_MS) {
        await ctx.db.delete(row._id);
        evicted++;
      } else if (stale > IDLE_THRESHOLD_MS && row.status === "active") {
        await ctx.db.patch(row._id, { status: "idle" });
        idled++;
      }
    }

    return { idled, evicted };
  },
});

// cleanOldEvents — roomEvents are ephemeral animation triggers. Anything
// older than EVENT_TTL_MS is no longer driving a client animation, so drop it.
export const cleanOldEvents = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - EVENT_TTL_MS;
    const old = await ctx.db
      .query("roomEvents")
      .filter((q) => q.lt(q.field("createdAt"), cutoff))
      .collect();

    for (const e of old) {
      await ctx.db.delete(e._id);
    }

    return { deleted: old.length };
  },
});
