import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getMedicationById, updateMedication, deleteMedication } from "@/lib/db/queries";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/medications/[id]
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const medication = await getMedicationById(id, userId);
    if (!medication) {
      return NextResponse.json({ error: "Medication not found" }, { status: 404 });
    }

    return NextResponse.json({ medication });
  } catch (error) {
    console.error("[API] GET /api/medications/[id] error:", error);
    return NextResponse.json({ error: "Failed to load medication" }, { status: 500 });
  }
}

/**
 * PATCH /api/medications/[id]
 * Update a medication.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const { name, dosage, notes, reminderTimes, schedule, isActive } = body;

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (dosage !== undefined) updates.dosage = dosage.trim();
    if (notes !== undefined) updates.notes = notes?.trim() || null;
    if (reminderTimes !== undefined) updates.reminderTimes = reminderTimes;
    if (schedule !== undefined) updates.schedule = schedule;
    if (isActive !== undefined) updates.isActive = isActive;

    const updated = await updateMedication(id, userId, updates);
    if (!updated) {
      return NextResponse.json({ error: "Medication not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, medication: updated });
  } catch (error) {
    console.error("[API] PATCH /api/medications/[id] error:", error);
    return NextResponse.json({ error: "Failed to update medication" }, { status: 500 });
  }
}

/**
 * DELETE /api/medications/[id]
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const deleted = await deleteMedication(id, userId);
    if (!deleted) {
      return NextResponse.json({ error: "Medication not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] DELETE /api/medications/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete medication" }, { status: 500 });
  }
}
