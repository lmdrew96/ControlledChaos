import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getUserSettings } from "@/lib/db/queries";
import { listCanvasCourses } from "@/lib/calendar/sync-canvas";

/**
 * GET /api/calendar/canvas-courses
 * Previews the distinct course codes in the user's connected Canvas feed,
 * without persisting anything — backs the "choose courses to sync" picker.
 */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const settings = await getUserSettings(userId);
    if (!settings?.canvasIcalUrl) {
      return NextResponse.json(
        { error: "No Canvas calendar connected" },
        { status: 400 }
      );
    }

    const courses = await listCanvasCourses(settings.canvasIcalUrl);
    return NextResponse.json({ courses });
  } catch (error) {
    console.error("[API] GET /api/calendar/canvas-courses error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to load Canvas courses";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
