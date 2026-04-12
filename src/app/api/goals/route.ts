import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getUserGoals, createGoal, getGoalTaskCounts } from "@/lib/db/queries";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const status = request.nextUrl.searchParams.get("status") ?? undefined;
    const goals = await getUserGoals(userId, status);
    const taskCounts = await getGoalTaskCounts(userId);

    const countsMap = new Map(
      taskCounts.map((c) => [c.goalId, { total: c.total, completed: c.completed }])
    );

    const goalsWithCounts = goals.map((g) => ({
      ...g,
      taskCount: countsMap.get(g.id)?.total ?? 0,
      completedTaskCount: countsMap.get(g.id)?.completed ?? 0,
    }));

    return NextResponse.json({ goals: goalsWithCounts });
  } catch (error) {
    console.error("[API] GET /api/goals error:", error);
    return NextResponse.json(
      { error: "Failed to fetch goals" },
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
    const { title, description, targetDate } = body;

    if (!title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const goal = await createGoal(userId, {
      title: title.trim(),
      description: description || null,
      targetDate: targetDate ? new Date(targetDate) : null,
    });

    return NextResponse.json({ goal }, { status: 201 });
  } catch (error) {
    console.error("[API] POST /api/goals error:", error);
    return NextResponse.json(
      { error: "Failed to create goal" },
      { status: 500 }
    );
  }
}
