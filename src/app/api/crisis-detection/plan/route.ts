import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  getActiveDetectionById,
  getCrisisDetectionTier,
  getCrisisPlanById,
} from "@/lib/db/queries";

/**
 * POST /api/crisis-detection/plan  { detectionId }
 *
 * "Not yet, show me the plan" on Auto-Triage. Returns the detection's plan,
 * building it now if it doesn't exist yet. Plans are only built on this
 * request; the cron no longer builds them in the background.
 *
 * 422 when the AI answered with strategies instead of one plan: the client
 * falls back to the intake form.
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

    if ((await getCrisisDetectionTier(userId)) !== "auto_triage") {
      return NextResponse.json({ error: "Auto-Triage is off" }, { status: 400 });
    }

    const detection = await getActiveDetectionById(userId, body.detectionId);
    if (!detection) {
      return NextResponse.json({ error: "No active detection" }, { status: 404 });
    }

    // Already built (a second tap, or a plan from before plans went on-demand).
    if (detection.crisisPlanId) {
      const existing = await getCrisisPlanById(detection.crisisPlanId, userId);
      if (existing && !existing.completedAt) {
        return NextResponse.json({ plan: existing });
      }
    }

    // Loaded here, not at module scope: it pulls in the Anthropic SDK.
    const { buildPlanForDetection } = await import("@/lib/crisis-detection/auto-plan");
    const planId = await buildPlanForDetection(userId, {
      id: detection.id,
      involvedTaskIds: detection.involvedTaskIds,
      involvedTaskNames: detection.involvedTaskNames,
      firstDeadline: detection.firstDeadline,
      requiredMinutes: detection.requiredMinutes,
    });
    if (!planId) {
      return NextResponse.json({ error: "No single plan fits" }, { status: 422 });
    }

    const plan = await getCrisisPlanById(planId, userId);
    return NextResponse.json({ plan });
  } catch (error) {
    console.error("[API] POST /api/crisis-detection/plan error:", error);
    return NextResponse.json({ error: "Failed to build a plan" }, { status: 500 });
  }
}
