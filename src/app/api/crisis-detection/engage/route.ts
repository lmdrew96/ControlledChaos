import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { engageDetection } from "@/lib/db/queries";

/**
 * POST /api/crisis-detection/engage  { detectionId }
 *
 * The user tapped "Yes, I'm on it" in the check-in sheet. This is the only
 * way (besides checking off a rescue step) a detection becomes engaged —
 * opening the push or the app never counts. Engaged detections stop
 * escalating and get one supportive heads-up near the deadline.
 */
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { detectionId?: unknown };
    if (typeof body.detectionId !== "string" || !body.detectionId) {
      return NextResponse.json({ error: "detectionId is required" }, { status: 400 });
    }

    const engaged = await engageDetection(userId, body.detectionId);
    if (!engaged) {
      return NextResponse.json({ error: "No active detection" }, { status: 404 });
    }
    return NextResponse.json({ engaged: true });
  } catch (error) {
    console.error("[API] POST /api/crisis-detection/engage error:", error);
    return NextResponse.json({ error: "Failed to record check-in" }, { status: 500 });
  }
}
