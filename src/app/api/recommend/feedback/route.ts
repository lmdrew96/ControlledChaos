import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { logTaskActivity, updateTask } from "@/lib/db/queries";
import { logTaskCompletion } from "@/lib/tasks/log-completion";

const FALLBACK_SNOOZE_MS = 60 * 60_000;

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { taskId, action } = body as {
      taskId: string;
      action: "accepted" | "snoozed" | "rejected" | "completed";
    };

    if (!taskId || !action) {
      return NextResponse.json(
        { error: "taskId and action are required" },
        { status: 400 }
      );
    }

    const validActions = ["accepted", "snoozed", "rejected", "completed"];
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { error: "Invalid action" },
        { status: 400 }
      );
    }

    // Log the feedback. A completion carries its energy / time-of-day context.
    if (action === "completed") {
      await logTaskCompletion(userId, taskId);
    } else {
      await logTaskActivity({ userId, taskId, action });
    }

    // Apply side effects
    if (action === "accepted") {
      await updateTask(taskId, userId, { status: "in_progress" });
    } else if (action === "completed") {
      await updateTask(taskId, userId, {
        status: "completed",
        completedAt: new Date(),
      });
    } else if (action === "snoozed") {
      // Without snoozedUntil, getPendingTasks treats the snooze as already
      // over and the task comes straight back. This path is the fallback when
      // /api/recommend/snooze (which picks a length) fails, so use a flat hour.
      await updateTask(taskId, userId, {
        status: "snoozed",
        snoozedUntil: new Date(Date.now() + FALLBACK_SNOOZE_MS),
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] POST /api/recommend/feedback error:", error);
    return NextResponse.json(
      { error: "Failed to record feedback" },
      { status: 500 }
    );
  }
}
