import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { logMedicationTaken } from "@/lib/db/queries";

/**
 * POST /api/medications/taken
 * Mark a medication dose as taken.
 * Supports both Clerk auth (from UI) and unauthenticated calls (from service worker).
 * Body: { userId?, medicationId, scheduledDate, scheduledTime }
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { userId: bodyUserId, medicationId, scheduledDate, scheduledTime } = body as {
    userId?: string;
    medicationId?: string;
    scheduledDate?: string;
    scheduledTime?: string;
  };

  // Try Clerk auth first, fall back to body userId for SW calls
  const { userId: clerkUserId } = await auth();
  const userId = clerkUserId || bodyUserId;

  if (!userId || !medicationId || !scheduledDate || !scheduledTime) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    const log = await logMedicationTaken({ userId, medicationId, scheduledDate, scheduledTime });
    return NextResponse.json({ success: true, log });
  } catch (error) {
    console.error("[API] POST /api/medications/taken error:", error);
    return NextResponse.json({ error: "Failed to log medication" }, { status: 500 });
  }
}
