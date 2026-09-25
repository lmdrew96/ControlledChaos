import { getUser, logTaskActivity } from "@/lib/db/queries";
import { getCurrentEnergy, getTimeOfDayBlock } from "@/lib/context/energy";

/**
 * Log a task completion with the moment it happened in: the user's energy
 * (from their latest energy moment, if any) and the time-of-day block.
 *
 * buildAIContext's pattern analysis ("tends to finish things in the
 * afternoon") reads these fields; before this, no writer set them and the
 * analysis could never fire.
 */
export async function logTaskCompletion(userId: string, taskId: string): Promise<void> {
  const user = await getUser(userId);
  const timezone = user?.timezone ?? "America/New_York";
  // Energy is context, not the point — a failed lookup still logs the completion.
  const energy = await getCurrentEnergy(userId, timezone).catch((err) => {
    console.error("[Tasks] energy lookup for completion context failed:", err);
    return null;
  });
  await logTaskActivity({
    userId,
    taskId,
    action: "completed",
    context: { energy, time_of_day: getTimeOfDayBlock(timezone) },
  });
}
