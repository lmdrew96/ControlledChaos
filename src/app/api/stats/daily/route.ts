import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getUser, getCompletionStats } from "@/lib/db/queries";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getUser(userId);
    const timezone = user?.timezone ?? "America/New_York";
    const stats = await getCompletionStats(userId, timezone);

    return NextResponse.json(stats);
  } catch (error) {
    console.error("[API] GET /api/stats/daily error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
