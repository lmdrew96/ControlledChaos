import { db } from "../index";
import { medications, medicationLogs } from "../schema";
import { eq, and, asc, gte, lte } from "drizzle-orm";

// ============================================================
// Medications
// ============================================================

export async function getMedications(userId: string) {
  return db
    .select()
    .from(medications)
    .where(eq(medications.userId, userId))
    .orderBy(asc(medications.createdAt));
}

export async function getActiveMedications(userId: string) {
  return db
    .select()
    .from(medications)
    .where(and(eq(medications.userId, userId), eq(medications.isActive, true)))
    .orderBy(asc(medications.createdAt));
}

export async function getMedicationById(medicationId: string, userId: string) {
  const result = await db
    .select()
    .from(medications)
    .where(and(eq(medications.id, medicationId), eq(medications.userId, userId)))
    .limit(1);
  return result[0] ?? null;
}

export async function createMedication(params: {
  userId: string;
  name: string;
  dosage: string;
  notes?: string;
  reminderTimes: string[];
  schedule: Record<string, unknown>;
}) {
  const [row] = await db
    .insert(medications)
    .values({
      userId: params.userId,
      name: params.name,
      dosage: params.dosage,
      notes: params.notes ?? null,
      reminderTimes: params.reminderTimes,
      schedule: params.schedule,
    })
    .returning();
  return row;
}

export async function updateMedication(
  medicationId: string,
  userId: string,
  updates: Partial<{
    name: string;
    dosage: string;
    notes: string | null;
    reminderTimes: string[];
    schedule: Record<string, unknown>;
    isActive: boolean;
  }>
) {
  const [row] = await db
    .update(medications)
    .set({ ...updates, updatedAt: new Date() })
    .where(and(eq(medications.id, medicationId), eq(medications.userId, userId)))
    .returning();
  return row ?? null;
}

export async function deleteMedication(medicationId: string, userId: string) {
  const [row] = await db
    .delete(medications)
    .where(and(eq(medications.id, medicationId), eq(medications.userId, userId)))
    .returning();
  return row ?? null;
}

export async function logMedicationTaken(params: {
  userId: string;
  medicationId: string;
  scheduledDate: string;
  scheduledTime: string;
}) {
  const [row] = await db
    .insert(medicationLogs)
    .values({
      userId: params.userId,
      medicationId: params.medicationId,
      scheduledDate: params.scheduledDate,
      scheduledTime: params.scheduledTime,
    })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

export async function getMedicationLogsForRange(
  userId: string,
  medicationId: string,
  startDate: string,
  endDate: string
) {
  return db
    .select()
    .from(medicationLogs)
    .where(
      and(
        eq(medicationLogs.userId, userId),
        eq(medicationLogs.medicationId, medicationId),
        gte(medicationLogs.scheduledDate, startDate),
        lte(medicationLogs.scheduledDate, endDate)
      )
    )
    .orderBy(asc(medicationLogs.scheduledDate), asc(medicationLogs.scheduledTime));
}

export async function getMedicationLogsByDate(userId: string, date: string) {
  return db
    .select()
    .from(medicationLogs)
    .where(
      and(
        eq(medicationLogs.userId, userId),
        eq(medicationLogs.scheduledDate, date)
      )
    )
    .orderBy(asc(medicationLogs.scheduledTime));
}


