import { db } from "./index";
import {
  brainDumps,
  calendarEvents,
  crisisMessages,
  crisisPlans,
  friendships,
  goals,
  medications,
  medicationLogs,
  commuteTimes,
  locations,
  locationNotificationLog,
  notifications,
  nudges,
  pushSubscriptions,
  snoozedPushes,
  taskActivity,
  tasks,
  userLocations,
  users,
  userSettings,
} from "./schema";
import { eq, and, asc, desc, ne, gt, gte, lt, lte, or, inArray, isNull, notInArray, sql } from "drizzle-orm";
import type {
  ParsedTask,
  DumpInputType,
  DumpCategory,
  BrainDumpResult,
  CalendarColors,
  EnergyProfile,
  NotificationPrefs,
  PersonalityPrefs,
  CrisisTask,
} from "@/types";
import { DEFAULT_CALENDAR_COLORS } from "@/lib/calendar/colors";
import { startOfDayInTimezone, todayInTimezone, startOfWeekInTimezone } from "@/lib/timezone";

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
    onboardingComplete: boolean;
    notificationPrefs: NotificationPrefs | null;
    personalityPrefs: PersonalityPrefs | null;
    wakeTime: number;
    sleepTime: number;
    calendarStartHour: number;
    calendarEndHour: number;
    weekStartDay: number;
    calendarColors: CalendarColors | null;
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
export async function getBrainDumpsByUser(
  userId: string,
  limit: number = 20
) {
  return db
    .select()
    .from(brainDumps)
    .where(eq(brainDumps.userId, userId))
    .orderBy(desc(brainDumps.createdAt))
    .limit(limit);
}

export async function createBrainDump(params: {
  userId: string;
  inputType: DumpInputType;
  rawContent: string;
  aiResponse: BrainDumpResult;
  mediaUrl?: string;
  category?: DumpCategory;
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
      category: params.category ?? "braindump",
    })
    .returning();

  return dump;
}

// ============================================================
// Tasks
// ============================================================
export async function createTask(
  userId: string,
  params: {
    title: string;
    description?: string | null;
    priority?: string;
    energyLevel?: string;
    estimatedMinutes?: number | null;
    category?: string | null;
    locationTags?: string[] | null;
    deadline?: Date | null;
  }
) {
  const [task] = await db
    .insert(tasks)
    .values({
      userId,
      title: params.title,
      description: params.description ?? null,
      priority: params.priority ?? "normal",
      energyLevel: params.energyLevel ?? "medium",
      estimatedMinutes: params.estimatedMinutes ?? null,
      category: params.category ?? null,
      locationTags: params.locationTags?.length ? params.locationTags : null,
      deadline: params.deadline ?? null,
    })
    .returning();
  return task;
}

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
    locationTags: task.locationTags?.length ? task.locationTags : null,
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
    locationTags: string[] | null;
    deadline: Date | null;
    scheduledFor: Date | null;
    completedAt: Date | null;
    progressSteps: object[] | null;
    currentStepIndex: number;
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
  // Delete FK-constrained child rows first
  await db.delete(taskActivity).where(eq(taskActivity.taskId, taskId));

  const [deleted] = await db
    .delete(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .returning();

  return deleted;
}

// ============================================================
// Goals
// ============================================================
export async function getUserGoals(userId: string, status?: string) {
  const conditions = [eq(goals.userId, userId)];
  if (status) {
    conditions.push(eq(goals.status, status));
  }
  return db
    .select()
    .from(goals)
    .where(and(...conditions))
    .orderBy(desc(goals.createdAt));
}

export async function getGoalById(goalId: string, userId: string) {
  const [goal] = await db
    .select()
    .from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId)))
    .limit(1);
  return goal ?? null;
}

export async function createGoal(
  userId: string,
  data: {
    title: string;
    description?: string | null;
    targetDate?: Date | null;
  }
) {
  const [goal] = await db
    .insert(goals)
    .values({
      userId,
      title: data.title,
      description: data.description ?? null,
      targetDate: data.targetDate ?? null,
    })
    .returning();
  return goal;
}

export async function updateGoal(
  goalId: string,
  userId: string,
  data: Partial<{
    title: string;
    description: string | null;
    targetDate: Date | null;
    status: string;
  }>
) {
  const [updated] = await db
    .update(goals)
    .set(data)
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId)))
    .returning();
  return updated ?? null;
}

export async function deleteGoal(goalId: string, userId: string) {
  // Unlink tasks from this goal first
  await db
    .update(tasks)
    .set({ goalId: null })
    .where(and(eq(tasks.goalId, goalId), eq(tasks.userId, userId)));

  const [deleted] = await db
    .delete(goals)
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId)))
    .returning();
  return deleted ?? null;
}

export async function getGoalTaskCounts(userId: string) {
  const rows = await db
    .select({
      goalId: tasks.goalId,
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${tasks.status} = 'completed')::int`,
    })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), sql`${tasks.goalId} is not null`))
    .groupBy(tasks.goalId);
  return rows as { goalId: string; total: number; completed: number }[];
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
  const startOfDay = startOfDayInTimezone(new Date(), timezone);

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

export async function getCompletionStats(userId: string, timezone: string) {
  const now = new Date();
  const startOfDay = startOfDayInTimezone(now, timezone);

  const startOfWeek = startOfWeekInTimezone(timezone);

  const [todayRows, weekRows, allTimeRows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          eq(tasks.status, "completed"),
          gte(tasks.completedAt, startOfDay)
        )
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          eq(tasks.status, "completed"),
          gte(tasks.completedAt, startOfWeek)
        )
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          eq(tasks.status, "completed")
        )
      ),
  ]);

  return {
    completedToday: todayRows[0]?.count ?? 0,
    completedThisWeek: weekRows[0]?.count ?? 0,
    completedAllTime: allTimeRows[0]?.count ?? 0,
  };
}

// ============================================================
// Momentum Stats
// ============================================================

export interface MomentumStats {
  completedToday: number;
  completedThisWeek: number;
  completedAllTime: number;
  biggestDay: { count: number; date: string } | null;
  avgPerActiveDay: number;
  daily: Array<{ date: string; count: number }>;
  heatmap: Array<{
    dayOfWeek: number;
    timeBlock: "morning" | "afternoon" | "evening" | "night";
    count: number;
  }>;
  byCategory: Array<{ category: string | null; count: number }>;
  byEnergy: { low: number; medium: number; high: number };
  wins: Array<{ icon: string; title: string; subtitle: string }>;
  calendarColors: CalendarColors;
  weekStartDate: string; // ISO "YYYY-MM-DD" of Monday in user's timezone
}

export async function getMomentumStats(
  userId: string,
  timezone: string
): Promise<MomentumStats> {
  const now = new Date();
  const startOfDay = startOfDayInTimezone(now, timezone);
  const todayStr = todayInTimezone(timezone);

  const startOfWeek = startOfWeekInTimezone(timezone);

  const fourteenDaysAgo = new Date(startOfDay);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);

  // All queries in parallel
  const [
    dailyRows,
    heatmapRows,
    categoryRows,
    energyRows,
    biggestDayRows,
    avgRows,
    allTimeRows,
    settingsResult,
    deadlineRows,
  ] = await Promise.all([
    // 1. Daily breakdown (14 days)
    db.execute<{ date: string | Date; count: number }>(
      sql`SELECT
        DATE(completed_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}) AS date,
        COUNT(*)::int AS count
      FROM tasks
      WHERE user_id = ${userId}
        AND status = 'completed'
        AND completed_at >= ${fourteenDaysAgo}
      GROUP BY date
      ORDER BY date ASC`
    ),
    // 2. Heatmap (current week)
    db.execute<{ day_of_week: number; time_block: string; count: number }>(
      sql`SELECT
        (EXTRACT(ISODOW FROM completed_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})::int - 1) AS day_of_week,
        CASE
          WHEN EXTRACT(HOUR FROM completed_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}) BETWEEN 6 AND 11 THEN 'morning'
          WHEN EXTRACT(HOUR FROM completed_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}) BETWEEN 12 AND 16 THEN 'afternoon'
          WHEN EXTRACT(HOUR FROM completed_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}) BETWEEN 17 AND 20 THEN 'evening'
          ELSE 'night'
        END AS time_block,
        COUNT(*)::int AS count
      FROM tasks
      WHERE user_id = ${userId}
        AND status = 'completed'
        AND completed_at >= ${startOfWeek}
      GROUP BY day_of_week, time_block`
    ),
    // 3. By category (current week)
    db.execute<{ category: string | null; count: number }>(
      sql`SELECT category, COUNT(*)::int AS count
      FROM tasks
      WHERE user_id = ${userId}
        AND status = 'completed'
        AND completed_at >= ${startOfWeek}
      GROUP BY category
      ORDER BY count DESC`
    ),
    // 4. By energy (current week)
    db.execute<{ energy_level: string; count: number }>(
      sql`SELECT energy_level, COUNT(*)::int AS count
      FROM tasks
      WHERE user_id = ${userId}
        AND status = 'completed'
        AND completed_at >= ${startOfWeek}
      GROUP BY energy_level`
    ),
    // 5. Biggest day (all-time)
    db.execute<{ date: string | Date; count: number }>(
      sql`SELECT
        DATE(completed_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}) AS date,
        COUNT(*)::int AS count
      FROM tasks
      WHERE user_id = ${userId} AND status = 'completed'
      GROUP BY date
      ORDER BY count DESC
      LIMIT 1`
    ),
    // 6. Average per active day (all-time)
    db.execute<{ avg: number }>(
      sql`SELECT COALESCE(AVG(daily_count), 0)::float AS avg
      FROM (
        SELECT COUNT(*)::int AS daily_count
        FROM tasks
        WHERE user_id = ${userId} AND status = 'completed'
        GROUP BY DATE(completed_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})
      ) AS daily_counts`
    ),
    // 7. All-time count
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.status, "completed"))),
    // 8. User settings (for calendarColors)
    getUserSettings(userId),
    // 9. Deadline tasks (current week) — for wins heuristic
    db.execute<{ category: string | null; met: number; total: number }>(
      sql`SELECT
        category,
        COUNT(*) FILTER (WHERE completed_at <= deadline)::int AS met,
        COUNT(*)::int AS total
      FROM tasks
      WHERE user_id = ${userId}
        AND status = 'completed'
        AND completed_at >= ${startOfWeek}
        AND deadline IS NOT NULL
      GROUP BY category`
    ),
  ]);

  // Gap-fill daily dates for 14 days
  const dailyMap = new Map<string, number>();
  for (const row of dailyRows.rows) {
    // Normalize date to YYYY-MM-DD regardless of whether driver returns string or Date
    const d = row.date instanceof Date
      ? row.date.toISOString().slice(0, 10)
      : String(row.date).slice(0, 10);
    dailyMap.set(d, Number(row.count));
  }
  const daily: Array<{ date: string; count: number }> = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(startOfDay);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    daily.push({ date: dateStr, count: dailyMap.get(dateStr) ?? 0 });
  }

  // Derive today/week counts from daily array
  const completedToday = daily.find((d) => d.date === todayStr)?.count ?? 0;

  const startOfWeekStr = startOfWeek.toISOString().slice(0, 10);
  const completedThisWeek = daily
    .filter((d) => d.date >= startOfWeekStr)
    .reduce((sum, d) => sum + d.count, 0);

  const completedAllTime = allTimeRows[0]?.count ?? 0;

  // Biggest day
  const biggestDayRow = biggestDayRows.rows[0];
  const biggestDay = biggestDayRow
    ? {
        count: Number(biggestDayRow.count),
        date: biggestDayRow.date instanceof Date
          ? biggestDayRow.date.toISOString().slice(0, 10)
          : String(biggestDayRow.date).slice(0, 10),
      }
    : null;

  // Avg per active day
  const avgPerActiveDay = Number(avgRows.rows[0]?.avg ?? 0);

  // Heatmap
  const heatmap = heatmapRows.rows.map((r) => ({
    dayOfWeek: Number(r.day_of_week),
    timeBlock: r.time_block as "morning" | "afternoon" | "evening" | "night",
    count: Number(r.count),
  }));

  // By category
  const byCategory = categoryRows.rows.map((r) => ({
    category: r.category,
    count: Number(r.count),
  }));

  // By energy
  const energyMap: Record<string, number> = {};
  for (const r of energyRows.rows) {
    energyMap[r.energy_level] = Number(r.count);
  }
  const byEnergy = {
    low: energyMap["low"] ?? 0,
    medium: energyMap["medium"] ?? 0,
    high: energyMap["high"] ?? 0,
  };

  // Calendar colors
  const calendarColors: CalendarColors =
    (settingsResult?.calendarColors as CalendarColors | null) ?? DEFAULT_CALENDAR_COLORS;

  // === Wins computation ===
  const wins: Array<{ icon: string; title: string; subtitle: string }> = [];

  // 1. New personal best
  if (biggestDay) {
    const todayCount = completedToday;
    const thisWeekDays = daily.filter((d) => d.date >= startOfWeekStr);
    const newPB = thisWeekDays.some((d) => d.count >= biggestDay.count && d.count > 0);
    if (newPB && wins.length < 3) {
      wins.push({
        icon: "\u26A1",
        title: `New personal best: ${biggestDay.count} in a day`,
        subtitle: "Your biggest day yet!",
      });
    }
  }

  // 2. High-energy tasks
  if (byEnergy.high >= 3 && wins.length < 3) {
    wins.push({
      icon: "\uD83D\uDCAA",
      title: `Knocked out ${byEnergy.high} high-energy tasks`,
      subtitle: "Tackling the tough stuff",
    });
  }

  // 3. All deadline tasks met for a category
  for (const dr of deadlineRows.rows) {
    if (wins.length >= 3) break;
    if (Number(dr.met) === Number(dr.total) && Number(dr.total) > 0 && dr.category) {
      wins.push({
        icon: "\uD83C\uDFAF",
        title: `All ${dr.category} tasks done early`,
        subtitle: "Ahead of every deadline",
      });
    }
  }

  // 4. Double digits
  if (completedThisWeek >= 10 && wins.length < 3) {
    wins.push({
      icon: "\uD83D\uDD25",
      title: "Double digits this week",
      subtitle: `${completedThisWeek} tasks completed`,
    });
  }

  // 5. Multi-category day
  if (wins.length < 3) {
    // Check daily category spread — need per-day category counts from heatmap or raw data
    // Approximate: check if byCategory has 3+ categories this week
    const categoriesWithCompletions = byCategory.filter((c) => c.count > 0).length;
    if (categoriesWithCompletions >= 3) {
      wins.push({
        icon: "\uD83C\uDF08",
        title: `Tackled ${categoriesWithCompletions} categories this week`,
        subtitle: "Nice variety",
      });
    }
  }

  return {
    completedToday,
    completedThisWeek,
    completedAllTime,
    biggestDay,
    avgPerActiveDay,
    daily,
    heatmap,
    byCategory,
    byEnergy,
    wins,
    calendarColors,
    weekStartDate: startOfWeek.toISOString().slice(0, 10),
  };
}

// ============================================================
// Pending Tasks for Recommendation
// ============================================================
export async function getPendingTasks(userId: string) {
  const now = new Date();
  return db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        or(
          // Active tasks
          inArray(tasks.status, ["pending", "in_progress"]),
          // Snoozed tasks whose snooze window has expired — wake them up
          and(
            eq(tasks.status, "snoozed"),
            or(
              isNull(tasks.snoozedUntil),
              lt(tasks.snoozedUntil, now)
            )
          )
        )
      )
    )
    .orderBy(
      sql`CASE WHEN ${tasks.deadline} IS NULL THEN 1 ELSE 0 END`,
      asc(tasks.deadline),
      desc(tasks.createdAt)
    );
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

/**
 * Get the calendar event happening RIGHT NOW (started before now, ends after now).
 * Returns null if user is not currently in any event.
 */
export async function getCurrentCalendarEvent(userId: string) {
  const now = new Date();
  const [event] = await db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.userId, userId),
        lte(calendarEvents.startTime, now),
        gt(calendarEvents.endTime, now),
        eq(calendarEvents.isAllDay, false)
      )
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
  category?: string | null;
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
      category: params.category ?? null,
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
        category: params.category ?? null,
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
  // Include events that overlap with the range:
  // - events starting within the range, OR
  // - events that started before `start` but haven't ended yet (currently happening)
  return db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.userId, userId),
        lte(calendarEvents.startTime, end),
        gt(calendarEvents.endTime, start)
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

export async function deleteCalendarEvent(id: string, userId: string) {
  const [deleted] = await db
    .delete(calendarEvents)
    .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, userId)))
    .returning();
  return deleted ?? null;
}

export async function updateCalendarEvent(
  id: string,
  userId: string,
  data: Partial<{
    title: string;
    description: string | null;
    startTime: Date;
    endTime: Date;
    location: string | null;
    category: string | null;
  }>
) {
  const [updated] = await db
    .update(calendarEvents)
    .set({ ...data, syncedAt: new Date() })
    .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, userId)))
    .returning();
  return updated ?? null;
}

export async function createManualCalendarEvent(params: {
  userId: string;
  title: string;
  description: string | null;
  startTime: Date;
  endTime: Date;
  location: string | null;
  isAllDay: boolean;
  seriesId: string | null;
  category?: string | null;
}) {
  const externalId = `manual-${crypto.randomUUID()}`;
  const [event] = await db
    .insert(calendarEvents)
    .values({
      userId: params.userId,
      source: "controlledchaos",
      externalId,
      title: params.title,
      description: params.description,
      startTime: params.startTime,
      endTime: params.endTime,
      location: params.location,
      isAllDay: params.isAllDay,
      category: params.category ?? null,
      seriesId: params.seriesId,
      syncedAt: new Date(),
    })
    .returning();
  return event;
}

export async function createCalendarEventsFromDump(
  userId: string,
  dumpId: string,
  events: Array<{
    title: string;
    description: string | null;
    startTime: Date;
    endTime: Date;
    location: string | null;
    isAllDay: boolean;
    seriesId: string | null;
    category?: string | null;
  }>
) {
  if (events.length === 0) return [];
  const values = events.map((evt) => ({
    userId,
    source: "controlledchaos" as const,
    externalId: `dump-${crypto.randomUUID()}`,
    ...evt,
    category: evt.category ?? null,
    sourceDumpId: dumpId,
    syncedAt: new Date(),
  }));
  return db.insert(calendarEvents).values(values).returning();
}

export async function deleteCalendarEventsBySeries(
  seriesId: string,
  userId: string
) {
  return db
    .delete(calendarEvents)
    .where(
      and(
        eq(calendarEvents.seriesId, seriesId),
        eq(calendarEvents.userId, userId)
      )
    )
    .returning();
}

export async function updateCalendarEventSeries(
  seriesId: string,
  userId: string,
  data: { title?: string; description?: string | null; location?: string | null; isAllDay?: boolean; category?: string | null }
) {
  return db
    .update(calendarEvents)
    .set({ ...data, syncedAt: new Date() })
    .where(
      and(
        eq(calendarEvents.seriesId, seriesId),
        eq(calendarEvents.userId, userId)
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

// ============================================================
// User Location Tracking (geofence notifications)
// ============================================================

export async function getUserLocation(userId: string) {
  const [row] = await db
    .select()
    .from(userLocations)
    .where(eq(userLocations.userId, userId));
  return row ?? null;
}

export async function upsertUserLocation(
  userId: string,
  data: {
    latitude: string;
    longitude: string;
    matchedLocationId: string | null;
    matchedLocationName: string | null;
  }
) {
  const [row] = await db
    .insert(userLocations)
    .values({
      userId,
      ...data,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userLocations.userId,
      set: {
        latitude: data.latitude,
        longitude: data.longitude,
        matchedLocationId: data.matchedLocationId,
        matchedLocationName: data.matchedLocationName,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

export async function getPendingTasksForLocation(
  userId: string,
  locationName: string
) {
  const pending = await getPendingTasks(userId);
  return pending.filter((task) =>
    task.locationTags?.some(
      (tag) => tag.toLowerCase() === locationName.toLowerCase()
    )
  );
}

export async function getRecentLocationNotification(
  userId: string,
  locationId: string,
  event: "arrival" | "departure",
  withinHours = 2
) {
  const cutoff = new Date(Date.now() - withinHours * 60 * 60 * 1000);
  const [row] = await db
    .select()
    .from(locationNotificationLog)
    .where(
      and(
        eq(locationNotificationLog.userId, userId),
        eq(locationNotificationLog.locationId, locationId),
        eq(locationNotificationLog.event, event),
        gt(locationNotificationLog.createdAt, cutoff)
      )
    )
    .orderBy(desc(locationNotificationLog.createdAt))
    .limit(1);
  return row ?? null;
}

export async function logLocationNotification(
  userId: string,
  locationId: string,
  taskId: string | null,
  event: "arrival" | "departure"
) {
  await db.insert(locationNotificationLog).values({
    userId,
    locationId,
    taskId,
    event,
  });
}

// ============================================================
// Commute Times
// ============================================================

export async function getCommuteTimes(userId: string) {
  return db
    .select()
    .from(commuteTimes)
    .where(eq(commuteTimes.userId, userId));
}

export async function getCommuteBetween(
  fromLocationId: string,
  toLocationId: string,
  travelMode = "driving"
): Promise<number | null> {
  const [row] = await db
    .select({ travelMinutes: commuteTimes.travelMinutes })
    .from(commuteTimes)
    .where(
      and(
        eq(commuteTimes.fromLocationId, fromLocationId),
        eq(commuteTimes.toLocationId, toLocationId),
        eq(commuteTimes.travelMode, travelMode)
      )
    );
  return row?.travelMinutes ?? null;
}

export async function upsertCommuteTime(
  userId: string,
  fromLocationId: string,
  toLocationId: string,
  travelMinutes: number,
  travelMode = "driving"
) {
  const [existing] = await db
    .select({ id: commuteTimes.id })
    .from(commuteTimes)
    .where(
      and(
        eq(commuteTimes.fromLocationId, fromLocationId),
        eq(commuteTimes.toLocationId, toLocationId),
        eq(commuteTimes.travelMode, travelMode)
      )
    );

  if (existing) {
    const [updated] = await db
      .update(commuteTimes)
      .set({ travelMinutes, updatedAt: new Date() })
      .where(eq(commuteTimes.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(commuteTimes)
    .values({ userId, fromLocationId, toLocationId, travelMinutes, travelMode })
    .returning();
  return created;
}

export async function deleteCommuteTime(
  fromLocationId: string,
  toLocationId: string,
  travelMode = "driving"
) {
  await db
    .delete(commuteTimes)
    .where(
      and(
        eq(commuteTimes.fromLocationId, fromLocationId),
        eq(commuteTimes.toLocationId, toLocationId),
        eq(commuteTimes.travelMode, travelMode)
      )
    );
}

// ============================================================
// Push Subscriptions
// ============================================================

export async function createPushSubscription(
  userId: string,
  endpoint: string,
  keysP256dh: string,
  keysAuth: string
) {
  const [sub] = await db
    .insert(pushSubscriptions)
    .values({ userId, endpoint, keysP256dh, keysAuth })
    .onConflictDoUpdate({
      target: [pushSubscriptions.userId, pushSubscriptions.endpoint],
      set: { keysP256dh, keysAuth },
    })
    .returning();
  return sub;
}

export async function deletePushSubscription(userId: string, endpoint: string) {
  const [deleted] = await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, userId),
        eq(pushSubscriptions.endpoint, endpoint)
      )
    )
    .returning();
  return deleted;
}

export async function getPushSubscriptions(userId: string) {
  return db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
}

// ============================================================
// Notifications
// ============================================================

export async function createNotification(
  userId: string,
  type: string,
  content: Record<string, unknown>
) {
  const [notif] = await db
    .insert(notifications)
    .values({ userId, type, content, sentAt: new Date() })
    .returning();
  return notif;
}

export async function markNotificationOpened(
  notificationId: string,
  userId: string
) {
  const [updated] = await db
    .update(notifications)
    .set({ openedAt: new Date() })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, userId)
      )
    )
    .returning();
  return updated;
}

export async function markAllNotificationsOpened(userId: string) {
  await db
    .update(notifications)
    .set({ openedAt: new Date() })
    .where(
      and(eq(notifications.userId, userId), isNull(notifications.openedAt))
    );
}

export async function getRecentNotifications(userId: string, limit = 50) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

/**
 * Returns the most recent completedAt timestamp for a user's tasks.
 * Returns null if the user has never completed a task.
 */
export async function getLastTaskCompletion(userId: string): Promise<Date | null> {
  const [result] = await db
    .select({ completedAt: tasks.completedAt })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), eq(tasks.status, "completed")))
    .orderBy(desc(tasks.completedAt))
    .limit(1);

  return result?.completedAt ?? null;
}

export async function getUnreadNotificationCount(userId: string) {
  const result = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        isNull(notifications.openedAt)
      )
    );
  return result.length;
}

/**
 * Get all users who have at least one active push subscription.
 * Returns userId, timezone, and prefs for cron trigger processing.
 */
export async function getAllUsersWithPushEnabled() {
  const rows = await db
    .selectDistinctOn([pushSubscriptions.userId], {
      userId: pushSubscriptions.userId,
      timezone: users.timezone,
      personalityPrefs: userSettings.personalityPrefs,
      notificationPrefs: userSettings.notificationPrefs,
    })
    .from(pushSubscriptions)
    .innerJoin(users, eq(pushSubscriptions.userId, users.id))
    .leftJoin(userSettings, eq(userSettings.userId, users.id));

  return rows.map((r) => ({
    userId: r.userId,
    timezone: r.timezone ?? "America/New_York",
    personalityPrefs: r.personalityPrefs as PersonalityPrefs | null,
    notificationPrefs: r.notificationPrefs as NotificationPrefs | null,
  }));
}

/**
 * Get all users whose notification prefs include morning or evening digest enabled.
 * Returns userId, timezone, email, and their prefs for time matching.
 */
export async function getAllUsersWithDigestEnabled() {
  const rows = await db
    .select({
      userId: userSettings.userId,
      timezone: users.timezone,
      email: users.email,
      notificationPrefs: userSettings.notificationPrefs,
    })
    .from(userSettings)
    .innerJoin(users, eq(userSettings.userId, users.id))
    .where(sql`${userSettings.notificationPrefs} IS NOT NULL`);

  return rows.map((r) => ({
    userId: r.userId,
    timezone: r.timezone ?? "America/New_York",
    email: r.email,
    prefs: r.notificationPrefs as NotificationPrefs | null,
  }));
}

/**
 * Get all users who have Canvas iCal configured.
 */
export async function getAllUsersWithCalendars() {
  const rows = await db
    .select({
      userId: userSettings.userId,
      canvasIcalUrl: userSettings.canvasIcalUrl,
      timezone: users.timezone,
    })
    .from(userSettings)
    .innerJoin(users, eq(users.id, userSettings.userId))
    .where(sql`${userSettings.canvasIcalUrl} IS NOT NULL`);

  return rows;
}


// ============================================================
// Crisis Plans
// ============================================================
export async function createCrisisPlan(params: {
  userId: string;
  taskName: string;
  deadline: Date;
  completionPct: number;
  panicLevel: string;
  panicLabel: string;
  summary: string;
  tasks: CrisisTask[];
}) {
  const [plan] = await db
    .insert(crisisPlans)
    .values({
      userId: params.userId,
      taskName: params.taskName,
      deadline: params.deadline,
      completionPct: params.completionPct,
      panicLevel: params.panicLevel,
      panicLabel: params.panicLabel,
      summary: params.summary,
      tasks: params.tasks,
    })
    .returning();
  return plan;
}

export async function getActiveCrisisPlan(userId: string) {
  const now = new Date();
  const [plan] = await db
    .select()
    .from(crisisPlans)
    .where(
      and(
        eq(crisisPlans.userId, userId),
        sql`${crisisPlans.completedAt} IS NULL`,
        gt(crisisPlans.deadline, now)
      )
    )
    .orderBy(desc(crisisPlans.createdAt))
    .limit(1);
  return plan ?? null;
}

/** Returns ALL active (incomplete, not past deadline) crisis plans, soonest deadline first. */
export async function getActiveCrisisPlans(userId: string) {
  const now = new Date();
  return db
    .select()
    .from(crisisPlans)
    .where(
      and(
        eq(crisisPlans.userId, userId),
        sql`${crisisPlans.completedAt} IS NULL`,
        gt(crisisPlans.deadline, now)
      )
    )
    .orderBy(crisisPlans.deadline); // soonest deadline first — most urgent at top
}


export async function getCrisisPlanById(planId: string, userId: string) {
  const [plan] = await db
    .select()
    .from(crisisPlans)
    .where(and(eq(crisisPlans.id, planId), eq(crisisPlans.userId, userId)))
    .limit(1);
  return plan ?? null;
}

export async function updateCrisisPlanProgress(
  planId: string,
  currentTaskIndex: number
) {
  const [updated] = await db
    .update(crisisPlans)
    .set({ currentTaskIndex, updatedAt: new Date() })
    .where(eq(crisisPlans.id, planId))
    .returning();
  return updated;
}

export async function completeCrisisPlan(planId: string) {
  const [updated] = await db
    .update(crisisPlans)
    .set({ completedAt: new Date(), updatedAt: new Date() })
    .where(eq(crisisPlans.id, planId))
    .returning();
  return updated;
}

// ============================================================
// Calendar Export Token
// ============================================================

export async function getOrCreateCalendarExportToken(userId: string): Promise<string> {
  const settings = await getUserSettings(userId);
  if (settings?.calendarExportToken) {
    return settings.calendarExportToken;
  }
  const token = crypto.randomUUID();
  await db
    .update(userSettings)
    .set({ calendarExportToken: token })
    .where(eq(userSettings.userId, userId));
  return token;
}

export async function regenerateCalendarExportToken(userId: string): Promise<string> {
  const token = crypto.randomUUID();
  await db
    .update(userSettings)
    .set({ calendarExportToken: token })
    .where(eq(userSettings.userId, userId));
  return token;
}

export async function getUserIdByCalendarToken(token: string): Promise<string | null> {
  const [row] = await db
    .select({ userId: userSettings.userId })
    .from(userSettings)
    .where(eq(userSettings.calendarExportToken, token))
    .limit(1);
  return row?.userId ?? null;
}

/**
 * Get the most recent syncedAt timestamp for a user's calendar events.
 * Returns null if no events exist.
 */
export async function getLastCalendarSync(userId: string): Promise<Date | null> {
  const [row] = await db
    .select({ lastSync: sql<string>`MAX(${calendarEvents.syncedAt})` })
    .from(calendarEvents)
    .where(eq(calendarEvents.userId, userId));

  return row?.lastSync ? new Date(row.lastSync) : null;
}

// ============================================================
// Snoozed Pushes
// ============================================================

export async function createSnoozedPush(
  userId: string,
  payload: { title: string; body: string; url?: string; tag?: string },
  sendAfter: Date
) {
  await db.insert(snoozedPushes).values({ userId, payload, sendAfter });
}

/** Returns all snoozed pushes whose sendAfter has passed and haven't been sent yet. */
export async function getPendingSnoozedPushes() {
  const now = new Date();
  return db
    .select()
    .from(snoozedPushes)
    .where(and(isNull(snoozedPushes.sentAt), lte(snoozedPushes.sendAfter, now)));
}

export async function markSnoozedPushSent(id: string) {
  await db
    .update(snoozedPushes)
    .set({ sentAt: new Date() })
    .where(eq(snoozedPushes.id, id));
}

// ============================================================
// Crisis Messages (chat within war room)
// ============================================================
export async function getCrisisMessages(crisisPlanId: string, userId: string) {
  return db
    .select()
    .from(crisisMessages)
    .where(
      and(
        eq(crisisMessages.crisisPlanId, crisisPlanId),
        eq(crisisMessages.userId, userId)
      )
    )
    .orderBy(asc(crisisMessages.createdAt));
}

export async function createCrisisMessage(params: {
  crisisPlanId: string;
  userId: string;
  role: "user" | "assistant";
  content: string;
}) {
  const [message] = await db
    .insert(crisisMessages)
    .values(params)
    .returning();
  return message;
}

// ============================================================
// Friendships
// ============================================================

export async function findUserByEmail(email: string) {
  const result = await db
    .select({ id: users.id, email: users.email, displayName: users.displayName })
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);
  return result[0] ?? null;
}

export async function getExistingFriendship(userA: string, userB: string) {
  const result = await db
    .select()
    .from(friendships)
    .where(
      or(
        and(eq(friendships.requesterId, userA), eq(friendships.addresseeId, userB)),
        and(eq(friendships.requesterId, userB), eq(friendships.addresseeId, userA))
      )
    )
    .limit(1);
  return result[0] ?? null;
}

export async function createFriendRequest(requesterId: string, addresseeId: string) {
  const [row] = await db
    .insert(friendships)
    .values({ requesterId, addresseeId, status: "pending" })
    .returning();
  return row;
}

export async function respondToFriendRequest(
  friendshipId: string,
  userId: string,
  status: "accepted" | "declined"
) {
  const [row] = await db
    .update(friendships)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(friendships.id, friendshipId), eq(friendships.addresseeId, userId)))
    .returning();
  return row ?? null;
}

export async function getAcceptedFriends(userId: string) {
  // Get friendships where this user is requester
  const asRequester = await db
    .select({
      friendshipId: friendships.id,
      friendId: friendships.addresseeId,
      displayName: users.displayName,
      email: users.email,
    })
    .from(friendships)
    .innerJoin(users, eq(users.id, friendships.addresseeId))
    .where(and(eq(friendships.requesterId, userId), eq(friendships.status, "accepted")));

  // Get friendships where this user is addressee
  const asAddressee = await db
    .select({
      friendshipId: friendships.id,
      friendId: friendships.requesterId,
      displayName: users.displayName,
      email: users.email,
    })
    .from(friendships)
    .innerJoin(users, eq(users.id, friendships.requesterId))
    .where(and(eq(friendships.addresseeId, userId), eq(friendships.status, "accepted")));

  return [...asRequester, ...asAddressee];
}

export async function getPendingFriendRequests(userId: string) {
  return db
    .select({
      friendshipId: friendships.id,
      requesterId: friendships.requesterId,
      displayName: users.displayName,
      email: users.email,
      createdAt: friendships.createdAt,
    })
    .from(friendships)
    .innerJoin(users, eq(users.id, friendships.requesterId))
    .where(and(eq(friendships.addresseeId, userId), eq(friendships.status, "pending")))
    .orderBy(desc(friendships.createdAt));
}

export async function deleteFriendship(friendshipId: string, userId: string) {
  const [row] = await db
    .delete(friendships)
    .where(
      and(
        eq(friendships.id, friendshipId),
        or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId))
      )
    )
    .returning();
  return row ?? null;
}

// ============================================================
// Nudges
// ============================================================

export async function createNudge(
  senderId: string,
  recipientId: string,
  category: string,
  message: string
) {
  const [row] = await db
    .insert(nudges)
    .values({ senderId, recipientId, category, message })
    .returning();
  return row;
}

export async function getNudgeCountToday(
  senderId: string,
  recipientId: string,
  timezone: string
): Promise<number> {
  const dayStart = startOfDayInTimezone(new Date(), timezone);
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(nudges)
    .where(
      and(
        eq(nudges.senderId, senderId),
        eq(nudges.recipientId, recipientId),
        gte(nudges.sentAt, dayStart)
      )
    );
  return result[0]?.count ?? 0;
}

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
