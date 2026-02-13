import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { updateTask, deleteTask } from "@/lib/db/queries";

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

    // Convert deadline string to Date (or null) for Drizzle
    if (body.deadline !== undefined) {
      body.deadline = body.deadline ? new Date(body.deadline) : null;
    }

    const updated = await updateTask(id, userId, body);

    if (!updated) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
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
