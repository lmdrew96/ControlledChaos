import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getUserGoals, createGoal, attachGoalStats, getUser } from "@/lib/db/queries";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const status = request.nextUrl.searchParams.get("status") ?? undefined;
    const [goals, user] = await Promise.all([getUserGoals(userId, status), getUser(userId)]);
    const goalsWithCounts = await attachGoalStats(
      userId,
      goals,
      user?.timezone ?? "America/New_York"
    );

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
