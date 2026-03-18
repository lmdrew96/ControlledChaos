import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getTasksByUser, createTask } from "@/lib/db/queries";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const status = request.nextUrl.searchParams.get("status") ?? undefined;
    const tasks = await getTasksByUser(userId, { status });

    return NextResponse.json({ tasks });
  } catch (error) {
    console.error("[API] GET /api/tasks error:", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { title, description, priority, energyLevel, estimatedMinutes, category, locationTags, deadline } = body;

    if (!title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const task = await createTask(userId, {
      title: title.trim(),
      description: description || null,
      priority,
      energyLevel,
      estimatedMinutes: estimatedMinutes ? parseInt(estimatedMinutes) : null,
      category: category || null,
      locationTags: locationTags?.length ? locationTags : null,
      deadline: deadline ? new Date(deadline) : null,
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error("[API] POST /api/tasks error:", error);
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 }
    );
  }
}
