"use client";

import { useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useParallelPlay } from "@/lib/parallel-play/context";
import type { Task } from "@/types";

/**
 * Glue between CC's existing task actions and Convex presence. No-op when
 * the user isn't in a parallel-play room — solo CC behavior is unchanged.
 *
 * - syncTaskStart(task): broadcast that you're working on `task`. Honors
 *   the task's roomVisibility (none → bubble shows just "is working!";
 *   category → "is working on School stuff!"; title → full task title).
 * - syncTaskComplete(): fire a completion event (sparkle for the room)
 *   and clear active-task display fields. Presence stays alive — the
 *   bubble simply settles back to "is working!".
 *
 * Both calls are fire-and-forget: callers shouldn't await them on the
 * critical path of a task action.
 */
export function useParallelPlaySync() {
  const { activeRoomId, currentUserId, isInRoom } = useParallelPlay();
  const updatePresence = useMutation(api.presence.updatePresence);
  const recordCompletion = useMutation(api.presence.recordCompletion);

  const syncTaskStart = useCallback(
    async (task: Task) => {
      if (!isInRoom || !activeRoomId || !currentUserId) return;
      const visibility = task.roomVisibility ?? "category";
      try {
        await updatePresence({
          clerkUserId: currentUserId,
          displayCategory:
            visibility === "none" ? null : (task.category ?? null),
          displayTitle: visibility === "title" ? task.title : null,
          displayEnergy: task.energyLevel ?? null,
        });
      } catch {
        // Silent — presence sync is decorative; never block the task action.
      }
    },
    [isInRoom, activeRoomId, currentUserId, updatePresence],
  );

  const syncTaskComplete = useCallback(async () => {
    if (!isInRoom || !activeRoomId || !currentUserId) return;
    try {
      await recordCompletion({
        roomId: activeRoomId,
        fromUserId: currentUserId,
      });
      await updatePresence({
        clerkUserId: currentUserId,
        displayCategory: null,
        displayTitle: null,
        displayEnergy: null,
      });
    } catch {
      // Silent.
    }
  }, [
    isInRoom,
    activeRoomId,
    currentUserId,
    recordCompletion,
    updatePresence,
  ]);

  return { syncTaskStart, syncTaskComplete };
}
