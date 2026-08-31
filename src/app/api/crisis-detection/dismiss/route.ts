import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { dismissActiveDetection } from "@/lib/db/queries";

/**
 * POST /api/crisis-detection/dismiss
 *
 * Dismisses the user's active crisis detection so the proposal banner stops
 * surfacing. The detection row stays active — this only suppresses the banner,
 * so the nav badge, re-nudge logic, and any auto-generated plan are unaffected.
 * A genuinely new collision creates a new row, which surfaces a fresh banner.
 */
export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const detectionId = await dismissActiveDetection(userId);

    return NextResponse.json({ dismissed: detectionId !== null, detectionId });
  } catch (error) {
    console.error("[API] POST /api/crisis-detection/dismiss error:", error);
    return NextResponse.json(
      { error: "Failed to dismiss crisis detection" },
      { status: 500 }
    );
  }
}
