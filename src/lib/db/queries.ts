import { db } from "./index";
import {
  brainDumps,
  calendarEvents,
  locations,
  taskActivity,
  tasks,
  users,
  userSettings,
} from "./schema";
import { eq, and, desc, ne, gt, gte, lte, inArray, notInArray } from "drizzle-orm";
import type {
  ParsedTask,
  DumpInputType,
  BrainDumpResult,
  EnergyProfile,
  NotificationPrefs,
} from "@/types";

// ============================================================
// Users
// ============================================================
export async function ensureUser(
  clerkId: string,
  email: string,
  displayName?: string
) {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.id, clerkId))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  const [user] = await db
    .insert(users)
    .values({ id: clerkId, email, displayName })
    .returning();

  return user;
}

export async function updateUser(
  userId: string,
  data: Partial<{ displayName: string; timezone: string }>
) {
  const [updated] = await db
    .update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();

  return updated;
}

// ============================================================
// User Settings
// ============================================================
export async function getUserSettings(userId: string) {
  const [settings] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  return settings ?? null;
}

export async function createUserSettings(params: {
  userId: string;
  energyProfile?: EnergyProfile | null;
  canvasIcalUrl?: string | null;
  onboardingComplete: boolean;
}) {
  const [settings] = await db
    .insert(userSettings)
    .values({
      userId: params.userId,
      energyProfile: params.energyProfile ?? null,
      canvasIcalUrl: params.canvasIcalUrl ?? null,
      onboardingComplete: params.onboardingComplete,
    })
    .returning();

  return settings;
}

export async function updateUserSettings(
  userId: string,
  data: Partial<{
    energyProfile: EnergyProfile | null;
    canvasIcalUrl: string | null;
    googleCalConnected: boolean;
    onboardingComplete: boolean;
    notificationPrefs: NotificationPrefs | null;
    wakeTime: number;
    sleepTime: number;
  }>
) {
  const [updated] = await db
    .update(userSettings)
    .set(data)
    .where(eq(userSettings.userId, userId))
    .returning();

  return updated;
}

// ============================================================
// Brain Dumps
// ============================================================
export async function createBrainDump(params: {
  userId: string;
  inputType: DumpInputType;
  rawContent: string;
  aiResponse: BrainDumpResult;
  mediaUrl?: string;
}) {
  const [dump] = await db
    .insert(brainDumps)
    .values({
      userId: params.userId,
      inputType: params.inputType,
      rawContent: params.rawContent,
      parsed: true,
      aiResponse: params.aiResponse,
      mediaUrl: params.mediaUrl ?? null,
    })
    .returning();

  return dump;
}

// ============================================================
// Tasks
// ============================================================
export async function createTasksFromDump(
  userId: string,
  dumpId: string,
  parsedTasks: ParsedTask[]
) {
  if (parsedTasks.length === 0) return [];

  const values = parsedTasks.map((task, index) => ({
    userId,
    title: task.title,
    description: task.description ?? null,
    priority: task.priority,
    energyLevel: task.energyLevel,
    estimatedMinutes: task.estimatedMinutes ?? null,
    category: task.category ?? null,
    locationTag: task.locationTag ?? null,
    deadline: task.deadline ? new Date(task.deadline) : null,
    sourceDumpId: dumpId,
    sortOrder: index,
  }));

  const created = await db.insert(tasks).values(values).returning();
  return created;
}

export async function getTasksByUser(
  userId: string,
  options?: { status?: string }
) {
  const conditions = [eq(tasks.userId, userId)];

  if (options?.status) {
    conditions.push(eq(tasks.status, options.status));
  } else {
    // By default, exclude cancelled tasks
    conditions.push(ne(tasks.status, "cancelled"));
  }

  return db
    .select()
    .from(tasks)
    .where(and(...conditions))
    .orderBy(desc(tasks.createdAt));
}

export async function updateTask(
  taskId: string,
  userId: string,
  data: Partial<{
    title: string;
    description: string | null;
    status: string;
    priority: string;
    energyLevel: string;
    estimatedMinutes: number | null;
    category: string | null;
    locationTag: string | null;
    deadline: Date | null;
    scheduledFor: Date | null;
    completedAt: Date | null;
  }>
) {
  const [updated] = await db
    .update(tasks)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .returning();

  return updated;
}

export async function deleteTask(taskId: string, userId: string) {
  const [deleted] = await db
    .delete(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .returning();

  return deleted;
}

// ============================================================
// Users (read)
// ============================================================
export async function getUser(userId: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user ?? null;
}

// ============================================================
// Task Activity
// ============================================================
export async function logTaskActivity(params: {
  userId: string;
  taskId: string;
  action: string;
  context?: Record<string, unknown>;
}) {
  const [activity] = await db
    .insert(taskActivity)
    .values({
      userId: params.userId,
      taskId: params.taskId,
      action: params.action,
      context: params.context ?? null,
    })
    .returning();

  return activity;
}

export async function getRecentTaskActivity(
  userId: string,
  limit: number = 20
) {
  return db
    .select()
    .from(taskActivity)
    .where(eq(taskActivity.userId, userId))
    .orderBy(desc(taskActivity.createdAt))
    .limit(limit);
}

export async function getTasksCompletedToday(userId: string, timezone: string) {
  // Calculate start of day in user's timezone
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find((p) => p.type === "year")!.value;
  const month = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  const startOfDay = new Date(`${year}-${month}-${day}T00:00:00`);

  return db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        eq(tasks.status, "completed"),
        gte(tasks.completedAt, startOfDay)
      )
    );
}

// ============================================================
// Pending Tasks for Recommendation
// ============================================================
export async function getPendingTasks(userId: string) {
  return db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        inArray(tasks.status, ["pending", "in_progress"])
      )
    )
    .orderBy(desc(tasks.createdAt));
}

// ============================================================
// Calendar Events
// ============================================================
export async function getNextCalendarEvent(userId: string) {
  const now = new Date();
  const [event] = await db
    .select()
    .from(calendarEvents)
    .where(
      and(eq(calendarEvents.userId, userId), gt(calendarEvents.startTime, now))
    )
    .orderBy(calendarEvents.startTime)
    .limit(1);

  return event ?? null;
}

export async function upsertCalendarEvent(params: {
  userId: string;
  source: string;
  externalId: string;
  title: string;
  description: string | null;
  startTime: Date;
  endTime: Date;
  location: string | null;
  isAllDay: boolean;
}) {
  const [result] = await db
    .insert(calendarEvents)
    .values({
      userId: params.userId,
      source: params.source,
      externalId: params.externalId,
      title: params.title,
      description: params.description,
      startTime: params.startTime,
      endTime: params.endTime,
      location: params.location,
      isAllDay: params.isAllDay,
      syncedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        calendarEvents.userId,
        calendarEvents.source,
        calendarEvents.externalId,
      ],
      set: {
        title: params.title,
        description: params.description,
        startTime: params.startTime,
        endTime: params.endTime,
        location: params.location,
        isAllDay: params.isAllDay,
        syncedAt: new Date(),
      },
    })
    .returning();

  return result;
}

export async function getCalendarEventsByDateRange(
  userId: string,
  start: Date,
  end: Date
) {
  return db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.userId, userId),
        gte(calendarEvents.startTime, start),
        lte(calendarEvents.startTime, end)
      )
    )
    .orderBy(calendarEvents.startTime);
}

export async function deleteStaleCalendarEvents(
  userId: string,
  source: string,
  currentExternalIds: string[]
) {
  if (currentExternalIds.length === 0) {
    return db
      .delete(calendarEvents)
      .where(
        and(
          eq(calendarEvents.userId, userId),
          eq(calendarEvents.source, source)
        )
      )
      .returning();
  }

  return db
    .delete(calendarEvents)
    .where(
      and(
        eq(calendarEvents.userId, userId),
        eq(calendarEvents.source, source),
        notInArray(calendarEvents.externalId, currentExternalIds)
      )
    )
    .returning();
}

// ============================================================
// Saved Locations
// ============================================================
export async function getSavedLocations(userId: string) {
  return db
    .select()
    .from(locations)
    .where(eq(locations.userId, userId))
    .orderBy(locations.createdAt);
}

export async function createLocation(params: {
  userId: string;
  name: string;
  latitude: string;
  longitude: string;
  radiusMeters?: number;
}) {
  const [loc] = await db.insert(locations).values(params).returning();
  return loc;
}

export async function updateLocation(
  locationId: string,
  userId: string,
  data: Partial<{
    name: string;
    latitude: string;
    longitude: string;
    radiusMeters: number;
  }>
) {
  const [updated] = await db
    .update(locations)
    .set(data)
    .where(and(eq(locations.id, locationId), eq(locations.userId, userId)))
    .returning();

  return updated;
}

export async function deleteLocation(locationId: string, userId: string) {
  const [deleted] = await db
    .delete(locations)
    .where(and(eq(locations.id, locationId), eq(locations.userId, userId)))
    .returning();

  return deleted;
}
