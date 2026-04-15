import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getMedicationById, getMedicationLogsForRange } from "@/lib/db/queries";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/medications/[id]/adherence?days=7
 * Returns adherence data for the last N days.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const days = Math.min(Math.max(parseInt(request.nextUrl.searchParams.get("days") ?? "7"), 1), 30);

    const medication = await getMedicationById(id, userId);
    if (!medication) {
      return NextResponse.json({ error: "Medication not found" }, { status: 404 });
    }

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (days - 1));

    const startStr = startDate.toISOString().slice(0, 10);
    const endStr = endDate.toISOString().slice(0, 10);

    const logs = await getMedicationLogsForRange(userId, id, startStr, endStr);
    const logSet = new Set(logs.map((l) => `${l.scheduledDate}-${l.scheduledTime}`));

    const reminderTimes = (medication.reminderTimes as string[]) ?? [];
    const adherence: Array<{
      date: string;
      slots: Array<{ time: string; taken: boolean; takenAt: string | null }>;
    }> = [];

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      const slots = reminderTimes.map((time) => {
        const key = `${dateStr}-${time}`;
        const log = logs.find((l) => l.scheduledDate === dateStr && l.scheduledTime === time);
        return {
          time,
          taken: logSet.has(key),
          takenAt: log?.takenAt?.toISOString() ?? null,
        };
      });
      adherence.push({ date: dateStr, slots });
    }

    return NextResponse.json({ adherence, medication: { name: medication.name, dosage: medication.dosage } });
  } catch (error) {
    console.error("[API] GET /api/medications/[id]/adherence error:", error);
    return NextResponse.json({ error: "Failed to load adherence data" }, { status: 500 });
  }
}
