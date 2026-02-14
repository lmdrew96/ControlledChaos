import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { logTaskActivity, updateTask } from "@/lib/db/queries";

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

    // Log the feedback
    await logTaskActivity({ userId, taskId, action });

    // Apply side effects
    if (action === "accepted") {
      await updateTask(taskId, userId, { status: "in_progress" });
    } else if (action === "completed") {
      await updateTask(taskId, userId, {
        status: "completed",
        completedAt: new Date(),
      });
    } else if (action === "snoozed") {
      await updateTask(taskId, userId, { status: "snoozed" });
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
