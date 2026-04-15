import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getMedications, createMedication } from "@/lib/db/queries";

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * GET /api/medications
 * List all medications for the current user.
 */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const meds = await getMedications(userId);
    return NextResponse.json({ medications: meds });
  } catch (error) {
    console.error("[API] GET /api/medications error:", error);
    return NextResponse.json({ error: "Failed to load medications" }, { status: 500 });
  }
}

/**
 * POST /api/medications
 * Create a new medication.
 * Body: { name, dosage, notes?, reminderTimes, schedule? }
 */
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { name, dosage, notes, reminderTimes, schedule } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!dosage?.trim()) {
      return NextResponse.json({ error: "Dosage is required" }, { status: 400 });
    }
    if (!Array.isArray(reminderTimes) || reminderTimes.length === 0) {
      return NextResponse.json({ error: "At least one reminder time is required" }, { status: 400 });
    }
    for (const t of reminderTimes) {
      if (!TIME_REGEX.test(t)) {
        return NextResponse.json({ error: `Invalid time format: ${t}. Use HH:MM` }, { status: 400 });
      }
    }

    const validSchedule = schedule ?? { type: "daily" };
    if (!["daily", "interval", "weekly"].includes(validSchedule.type)) {
      return NextResponse.json({ error: "Invalid schedule type" }, { status: 400 });
    }

    const medication = await createMedication({
      userId,
      name: name.trim(),
      dosage: dosage.trim(),
      notes: notes?.trim() || undefined,
      reminderTimes,
      schedule: validSchedule,
    });

    return NextResponse.json({ success: true, medication });
  } catch (error) {
    console.error("[API] POST /api/medications error:", error);
    return NextResponse.json({ error: "Failed to create medication" }, { status: 500 });
  }
}
