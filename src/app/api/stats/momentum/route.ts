import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getUser, getMomentumStats } from "@/lib/db/queries";
import { parsePeriod } from "@/lib/momentum";

export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const period = parsePeriod(new URL(request.url).searchParams.get("period"));
    const user = await getUser(userId);
    const timezone = user?.timezone ?? "America/New_York";
    const stats = await getMomentumStats(userId, timezone, period);

    return NextResponse.json(stats);
  } catch (error) {
    console.error("[API] GET /api/stats/momentum error:", error);
    return NextResponse.json(
      { error: "Failed to fetch momentum stats" },
      { status: 500 }
    );
  }
}
