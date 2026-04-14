import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { updateTask, deleteTask, logTaskActivity } from "@/lib/db/queries";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    // Handle completion — set completedAt timestamp
    if (body.status === "completed" && !body.completedAt) {
      body.completedAt = new Date();
    }

    // Handle un-completion — clear completedAt
    if (body.status && body.status !== "completed") {
      body.completedAt = null;
    }

    // Handle step advancement with auto-complete
    if (body.currentStepIndex !== undefined) {
      const [currentTask] = await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
        .limit(1);

      if (currentTask?.progressSteps) {
        const stepCount = (currentTask.progressSteps as unknown[]).length;
        if (body.currentStepIndex >= stepCount) {
          body.currentStepIndex = stepCount;
          body.status = "completed";
          body.completedAt = new Date();
        }
      }
    }

    // Convert deadline string to Date (or null) for Drizzle
    if (body.deadline !== undefined) {
      body.deadline = body.deadline ? new Date(body.deadline) : null;
    }

    const updated = await updateTask(id, userId, body);

    if (!updated) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Log completion to task_activity so notification triggers see today's activity
    if (body.status === "completed") {
      await logTaskActivity({ userId, taskId: id, action: "completed" });
    }

    return NextResponse.json({ task: updated });
  } catch (error) {
    console.error("[API] PATCH /api/tasks/:id error:", error);
    return NextResponse.json(
      { error: "Failed to update task" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const deleted = await deleteTask(id, userId);

    if (!deleted) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] DELETE /api/tasks/:id error:", error);
    return NextResponse.json(
      { error: "Failed to delete task" },
      { status: 500 }
    );
  }
}
