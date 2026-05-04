import { db } from "./index";
import {
  brainDumps,
  calendarEvents,
  crisisDetections,
  crisisMessages,
  crisisPlans,
  friendships,
  goals,
  medications,
  medicationLogs,
  commuteTimes,
  locations,
  locationNotificationLog,
  microtasks,
  microtaskCompletions,
  moments,
  notifications,
  nudges,
  pushSubscriptions,
  rooms,
  roomMembers,
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
  CrisisDetectionTier,
  EnergyProfile,
  RecapEntry,
  RecapKind,
  MomentType,
  NotificationPrefs,
  PersonalityPrefs,
  CrisisTask,
} from "@/types";
import { assembleRecapEntries } from "@/lib/recap/assemble";
import { DEFAULT_CALENDAR_COLORS } from "@/lib/calendar/colors";
import { startOfDayInTimezone, todayInTimezone, startOfWeekInTimezone } from "@/lib/timezone";

// ============================================================
// Users
// ============================================================

export class EmailConflictError extends Error {
  constructor(
    public readonly email: string,
    public readonly existingClerkId: string,
    public readonly newClerkId: string,
  ) {
    super(
      `Email ${email} is already linked to Clerk user ${existingClerkId}; refusing to attach new Clerk user ${newClerkId}. Run scripts/dedupe-users-by-email.ts or remap-clerk-ids.ts to consolidate.`,
    );
    this.name = "EmailConflictError";
  }
}

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
    const current = existing[0];
    const emailChanged = !!email && current.email !== email;
    const nameChanged =
      displayName !== undefined && current.displayName !== displayName;

    if (!emailChanged && !nameChanged) return current;

    // If the email is changing, make sure the new one isn't already attached
    // to a different Clerk identity — same protection as the insert path.
    if (emailChanged) {
      const sameEmail = await db
        .select()
        .from(users)
        .where(
          and(
            sql`LOWER(${users.email}) = LOWER(${email})`,
            sql`${users.id} <> ${clerkId}`
          )
        )
        .limit(1);
      if (sameEmail.length > 0) {
        throw new EmailConflictError(email, sameEmail[0].id, clerkId);
      }
    }

    const updates: { email?: string; displayName?: string; updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if (emailChanged) updates.email = email;
    if (nameChanged) updates.displayName = displayName;

    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, clerkId))
      .returning();
    return updated;
  }

  // No row for this clerkId — but the email may already belong to another
  // Clerk identity (e.g., Clerk rotated the user_id between dev/prod, or the
  // user signed up twice). Refuse to silently create a duplicate; that would
  // produce orphaned rows whose notification prefs keep firing the cron, and
  // worse, in production it could let one Clerk identity inherit another
  // user's data.
  if (email) {
    const sameEmail = await db
      .select()
      .from(users)
      .where(sql`LOWER(${users.email}) = LOWER(${email})`)
      .limit(1);

    if (sameEmail.length > 0) {
      throw new EmailConflictError(email, sameEmail[0].id, clerkId);
    }
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
  // Idempotent: re-running onboarding (back-button, retry, double-submit)
  // must not create a second user_settings row. Once the unique index on
  // user_settings.user_id ships, the INSERT path is also race-safe; until
  // then this SELECT-then-INSERT closes the common case.
  const existing = await getUserSettings(params.userId);
  if (existing) return existing;

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
  limit: number = 20,
  opts?: { category?: DumpCategory; offset?: number }
) {
  const conditions = [eq(brainDumps.userId, userId)];
  if (opts?.category) conditions.push(eq(brainDumps.category, opts.category));
  return db
    .select()
    .from(brainDumps)
    .where(and(...conditions))
    .orderBy(desc(brainDumps.createdAt))
    .limit(limit)
    .offset(opts?.offset ?? 0);
}

export async function getBrainDumpsByDateRange(
  userId: string,
  from: Date,
  to: Date,
  category?: DumpCategory
) {
  const conditions = [
    eq(brainDumps.userId, userId),
    gte(brainDumps.createdAt, from),
    lt(brainDumps.createdAt, to),
  ];
  if (category) conditions.push(eq(brainDumps.category, category));
  return db
    .select()
    .from(brainDumps)
    .where(and(...conditions))
    .orderBy(desc(brainDumps.createdAt));
}

export async function createBrainDump(params: {
  userId: string;
  inputType: DumpInputType;
  rawContent: string | null;
  aiResponse: BrainDumpResult;
  mediaUrl?: string | null;
  mediaUrls?: string[];
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
      mediaUrls: params.mediaUrls ?? [],
      category: params.category ?? "braindump",
    })
    .returning();

  return dump;
}

// ============================================================
// Moments (behavioral state log)
// ============================================================

const VALID_MOMENT_TYPES: MomentType[] = [
  "energy_high",
  "energy_low",
  "energy_crash",
  "focus_start",
  "focus_end",
  "tough_moment",
  "sleep_logged",
];

export function isValidMomentType(value: string): value is MomentType {
  return (VALID_MOMENT_TYPES as string[]).includes(value);
}

export async function insertMoment(params: {
  userId: string;
  type: MomentType;
  intensity?: number | null;
  note?: string | null;
  occurredAt?: Date;
}) {
  const [moment] = await db
    .insert(moments)
    .values({
      userId: params.userId,
      type: params.type,
      intensity: params.intensity ?? null,
      note: params.note ?? null,
      occurredAt: params.occurredAt ?? new Date(),
    })
    .returning();
  return moment;
}

export async function listMoments(
  userId: string,
  opts?: {
    from?: Date;
    to?: Date;
    types?: MomentType[];
    limit?: number;
  }
) {
  const conditions = [eq(moments.userId, userId), isNull(moments.deletedAt)];
  if (opts?.from) conditions.push(gte(moments.occurredAt, opts.from));
  if (opts?.to) conditions.push(lte(moments.occurredAt, opts.to));
  if (opts?.types && opts.types.length > 0) {
    conditions.push(inArray(moments.type, opts.types));
  }

  return db
    .select()
    .from(moments)
    .where(and(...conditions))
    .orderBy(desc(moments.occurredAt))
    .limit(opts?.limit ?? 200);
}

export async function updateMoment(
  momentId: string,
  userId: string,
  patch: {
    intensity?: number | null;
    note?: string | null;
    occurredAt?: Date;
  }
) {
  const set: Record<string, unknown> = {};
  if (patch.intensity !== undefined) set.intensity = patch.intensity;
  if (patch.note !== undefined) set.note = patch.note;
  if (patch.occurredAt !== undefined) set.occurredAt = patch.occurredAt;
  if (Object.keys(set).length === 0) return null;

  const [updated] = await db
    .update(moments)
    .set(set)
    .where(
      and(
        eq(moments.id, momentId),
        eq(moments.userId, userId),
        isNull(moments.deletedAt)
      )
    )
    .returning();
  return updated ?? null;
}

export async function softDeleteMoment(momentId: string, userId: string) {
  const [deleted] = await db
    .update(moments)
    .set({ deletedAt: new Date() })
    .where(and(eq(moments.id, momentId), eq(moments.userId, userId)))
    .returning();
  return deleted ?? null;
}

/**
 * Most recent non-deleted Moment within the window, or null.
 * Default window = 120 minutes (matches plan "last 2 hours" for AI context).
 */
export async function getRecentMoment(
  userId: string,
  maxAgeMinutes: number = 120
) {
  const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
  const [row] = await db
    .select()
    .from(moments)
    .where(
      and(
        eq(moments.userId, userId),
        isNull(moments.deletedAt),
        gte(moments.occurredAt, cutoff)
      )
    )
    .orderBy(desc(moments.occurredAt))
    .limit(1);
  return row ?? null;
}

/** All recent Moments in a window — used by crisis detection for multi-signal rules. */
export async function getRecentMoments(
  userId: string,
  maxAgeMinutes: number = 120,
  types?: MomentType[]
) {
  const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
  const conditions = [
    eq(moments.userId, userId),
    isNull(moments.deletedAt),
    gte(moments.occurredAt, cutoff),
  ];
  if (types && types.length > 0) {
    conditions.push(inArray(moments.type, types));
  }
  return db
    .select()
    .from(moments)
    .where(and(...conditions))
    .orderBy(desc(moments.occurredAt));
}

// ============================================================
// Daily Recap (chronological day timeline — merges 6 source tables)
// ============================================================

/**
 * Fetch a day's worth of activity across tasks, events, brain dumps,
 * junk journal entries, moments, and medication logs. Runs all source
 * queries in parallel and merges into a single array sorted by `at`
 * descending (most recent first). Respects `typeFilters` — unspecified
 * kinds are skipped entirely (no wasted DB round-trip).
 *
 * Accepts a date-string (YYYY-MM-DD) for the medication-logs path which
 * stores date as text, and a Date window for timestamp-based queries.
 */
export async function getRecapDay(
  userId: string,
  dayStart: Date,
  dayEnd: Date,
  dateString: string, // YYYY-MM-DD for medication_logs.scheduledDate
  typeFilters?: RecapKind[]
): Promise<RecapEntry[]> {
  const want = (k: RecapKind) => !typeFilters || typeFilters.includes(k);

  const [
    completedTasks,
    dayEvents,
    dayDumps,
    dayJournal,
    dayMoments,
    medLogs,
  ] = await Promise.all([
    want("task")
      ? db
          .select()
          .from(tasks)
          .where(
            and(
              eq(tasks.userId, userId),
              eq(tasks.status, "completed"),
              gte(tasks.completedAt, dayStart),
              lt(tasks.completedAt, dayEnd),
              isNull(tasks.deletedAt)
            )
          )
      : Promise.resolve([]),
    want("event")
      ? getCalendarEventsByDateRange(userId, dayStart, dayEnd)
      : Promise.resolve([]),
    want("dump")
      ? getBrainDumpsByDateRange(userId, dayStart, dayEnd, "braindump")
      : Promise.resolve([]),
    want("journal")
      ? getBrainDumpsByDateRange(userId, dayStart, dayEnd, "junk_journal")
      : Promise.resolve([]),
    want("moment")
      ? listMoments(userId, { from: dayStart, to: dayEnd, limit: 200 })
      : Promise.resolve([]),
    want("med")
      ? getMedicationLogsByDate(userId, dateString)
      : Promise.resolve([]),
  ]);

  // Hydrate medication names+dosages in a single batched query
  const medIds = Array.from(new Set(medLogs.map((m) => m.medicationId)));
  const medLookup = new Map<string, { name: string; dosage: string }>();
  if (medIds.length > 0) {
    const meds = await db
      .select({
        id: medications.id,
        name: medications.name,
        dosage: medications.dosage,
      })
      .from(medications)
      .where(
        and(eq(medications.userId, userId), inArray(medications.id, medIds))
      );
    for (const m of meds) {
      medLookup.set(m.id, { name: m.name, dosage: m.dosage });
    }
  }

  return assembleRecapEntries({
    tasks: completedTasks,
    events: dayEvents,
    dumps: dayDumps,
    journal: dayJournal,
    moments: dayMoments,
    medLogs,
    medLookup,
    typeFilters,
  });
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
    goalId?: string | null;
    sourceEventId?: string | null;
    roomVisibility?: "none" | "category" | "title";
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
      goalId: params.goalId ?? null,
      sourceEventId: params.sourceEventId ?? null,
      ...(params.roomVisibility ? { roomVisibility: params.roomVisibility } : {}),
    })
    .returning();
  return task;
}

/**
 * Look up a task previously auto-generated from a Canvas event.
 * Returns the task regardless of status or deletedAt state — callers use this
 * for dedup, and we never want to recreate a task the user already has or
 * soft-deleted.
 */
export async function findTaskBySourceEventId(
  userId: string,
  sourceEventId: string
) {
  const [task] = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        eq(tasks.sourceEventId, sourceEventId)
      )
    )
    .limit(1);
  return task ?? null;
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
  const conditions = [eq(tasks.userId, userId), isNull(tasks.deletedAt)];

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
    .orderBy(asc(tasks.sortOrder), desc(tasks.createdAt));
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
    sortOrder: number | null;
    goalId: string | null;
    roomVisibility: string;
  }>
) {
  const [updated] = await db
    .update(tasks)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .returning();

  return updated;
}

export async function reorderTasks(
  userId: string,
  orderedIds: string[]
) {
  // Update sortOrder for each task in a single transaction
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx
        .update(tasks)
        .set({ sortOrder: i, updatedAt: new Date() })
        .where(and(eq(tasks.id, orderedIds[i]), eq(tasks.userId, userId)));
    }
  });
}

export async function deleteTask(taskId: string, userId: string) {
  // Soft delete — set deletedAt instead of removing the row
  const [deleted] = await db
    .update(tasks)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .returning();

  return deleted;
}

// ============================================================
// Goals
// ============================================================
export async function getUserGoals(userId: string, status?: string) {
  const conditions = [eq(goals.userId, userId), isNull(goals.deletedAt)];
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

  // Soft delete — set deletedAt instead of removing the row
  const [deleted] = await db
    .update(goals)
    .set({ deletedAt: new Date() })
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
    .where(and(eq(tasks.userId, userId), sql`${tasks.goalId} is not null`, isNull(tasks.deletedAt)))
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
        gte(tasks.completedAt, startOfDay),
        isNull(tasks.deletedAt)
      )
    );
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
  hourlyHeatmap: Array<{
    dayOfWeek: number; // 0 = Mon ... 6 = Sun
    hour: number; // 0..23 in user's timezone
    count: number;
  }>;
  marination: {
    active: MarinationBuckets;
    historical: MarinationBuckets;
  };
  chunkOutcomes: {
    parentsChunked: number; // parent tasks that have at least one chunk
    parentsCompleted: number; // of those, how many are completed
    chunksTotal: number; // total chunks (children)
    chunksCompleted: number; // of those, how many are completed
  };
  byCategory: Array<{ category: string | null; count: number }>;
  byEnergy: { low: number; medium: number; high: number };
  wins: Array<{ icon: string; title: string; subtitle: string }>;
  calendarColors: CalendarColors;
  weekStartDate: string; // ISO "YYYY-MM-DD" of Monday in user's timezone
}

export type MarinationBuckets = {
  fresh: number; // <1 day
  week: number; // 1–7 days
  marinating: number; // 7–30 days
  aging: number; // 30+ days
};

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
    hourlyHeatmapRows,
    marinationActiveRows,
    marinationHistoricalRows,
    chunkOutcomesRows,
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
        AND deleted_at IS NULL
      GROUP BY date
      ORDER BY date ASC`
    ),
    // 2. Hourly heatmap (all-time, 7 days × 24 hours)
    db.execute<{ day_of_week: number; hour: number; count: number }>(
      sql`SELECT
        (EXTRACT(ISODOW FROM completed_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})::int - 1) AS day_of_week,
        EXTRACT(HOUR FROM completed_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})::int AS hour,
        COUNT(*)::int AS count
      FROM tasks
      WHERE user_id = ${userId}
        AND status = 'completed'
        AND deleted_at IS NULL
      GROUP BY day_of_week, hour`
    ),
    // 2a. Marination — active tasks bucketed by current age (top-level only)
    db.execute<{ bucket: string; count: number }>(
      sql`SELECT
        CASE
          WHEN NOW() - created_at < INTERVAL '1 day' THEN 'fresh'
          WHEN NOW() - created_at < INTERVAL '7 days' THEN 'week'
          WHEN NOW() - created_at < INTERVAL '30 days' THEN 'marinating'
          ELSE 'aging'
        END AS bucket,
        COUNT(*)::int AS count
      FROM tasks
      WHERE user_id = ${userId}
        AND status IN ('pending', 'in_progress')
        AND completed_at IS NULL
        AND deleted_at IS NULL
        AND parent_task_id IS NULL
      GROUP BY bucket`
    ),
    // 2b. Marination — historical distribution: age at completion (top-level only)
    db.execute<{ bucket: string; count: number }>(
      sql`SELECT
        CASE
          WHEN completed_at - created_at < INTERVAL '1 day' THEN 'fresh'
          WHEN completed_at - created_at < INTERVAL '7 days' THEN 'week'
          WHEN completed_at - created_at < INTERVAL '30 days' THEN 'marinating'
          ELSE 'aging'
        END AS bucket,
        COUNT(*)::int AS count
      FROM tasks
      WHERE user_id = ${userId}
        AND status = 'completed'
        AND completed_at IS NOT NULL
        AND deleted_at IS NULL
        AND parent_task_id IS NULL
      GROUP BY bucket`
    ),
    // 2c. Chunk outcomes — chunks are stored in tasks.progress_steps JSONB,
    // NOT as child rows. One task = one "chunked parent"; its chunks live
    // inline. current_step_index is the count of completed chunks (0-based
    // becomes a count since users increment past the last step on complete).
    db.execute<{
      parents_total: number;
      parents_completed: number;
      chunks_total: number;
      chunks_completed: number;
    }>(
      sql`SELECT
        COUNT(*)::int AS parents_total,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS parents_completed,
        COALESCE(SUM(jsonb_array_length(progress_steps)), 0)::int AS chunks_total,
        COALESCE(SUM(
          CASE
            WHEN status = 'completed' THEN jsonb_array_length(progress_steps)
            ELSE LEAST(current_step_index, jsonb_array_length(progress_steps))
          END
        ), 0)::int AS chunks_completed
      FROM tasks
      WHERE user_id = ${userId}
        AND deleted_at IS NULL
        AND progress_steps IS NOT NULL
        AND jsonb_array_length(progress_steps) > 0`
    ),
    // 3. By category (current week)
    db.execute<{ category: string | null; count: number }>(
      sql`SELECT category, COUNT(*)::int AS count
      FROM tasks
      WHERE user_id = ${userId}
        AND status = 'completed'
        AND completed_at >= ${startOfWeek}
        AND deleted_at IS NULL
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
        AND deleted_at IS NULL
      GROUP BY energy_level`
    ),
    // 5. Biggest day (all-time)
    db.execute<{ date: string | Date; count: number }>(
      sql`SELECT
        DATE(completed_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}) AS date,
        COUNT(*)::int AS count
      FROM tasks
      WHERE user_id = ${userId} AND status = 'completed' AND deleted_at IS NULL
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
        WHERE user_id = ${userId} AND status = 'completed' AND deleted_at IS NULL
        GROUP BY DATE(completed_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})
      ) AS daily_counts`
    ),
    // 7. All-time count
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.status, "completed"), isNull(tasks.deletedAt))),
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
        AND deleted_at IS NULL
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

  // Hourly heatmap (all-time)
  const hourlyHeatmap = hourlyHeatmapRows.rows.map((r) => ({
    dayOfWeek: Number(r.day_of_week),
    hour: Number(r.hour),
    count: Number(r.count),
  }));

  // Marination buckets
  const emptyBuckets: MarinationBuckets = {
    fresh: 0,
    week: 0,
    marinating: 0,
    aging: 0,
  };
  const readBuckets = (
    rows: Array<{ bucket: string; count: number }>
  ): MarinationBuckets => {
    const buckets: MarinationBuckets = { ...emptyBuckets };
    for (const r of rows) {
      const key = r.bucket as keyof MarinationBuckets;
      if (key in buckets) buckets[key] = Number(r.count);
    }
    return buckets;
  };
  const marination = {
    active: readBuckets(marinationActiveRows.rows),
    historical: readBuckets(marinationHistoricalRows.rows),
  };

  // Chunk outcomes
  const chunkRow = chunkOutcomesRows.rows[0];
  const chunkOutcomes = {
    parentsChunked: Number(chunkRow?.parents_total ?? 0),
    parentsCompleted: Number(chunkRow?.parents_completed ?? 0),
    chunksTotal: Number(chunkRow?.chunks_total ?? 0),
    chunksCompleted: Number(chunkRow?.chunks_completed ?? 0),
  };

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
    hourlyHeatmap,
    marination,
    chunkOutcomes,
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
        isNull(tasks.deletedAt),
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

  // Prune stale endpoints for the same user. iOS PWAs rotate push endpoints
  // without invalidating the old one, which silently produces duplicate
  // deliveries. Any sibling row older than 14 days is safe to drop — a real
  // active device re-subscribes far more often than that.
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, userId),
        ne(pushSubscriptions.endpoint, endpoint),
        lt(pushSubscriptions.createdAt, cutoff)
      )
    );

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
    .where(and(eq(tasks.userId, userId), eq(tasks.status, "completed"), isNull(tasks.deletedAt)))
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
      crisisDetectionTier: userSettings.crisisDetectionTier,
    })
    .from(pushSubscriptions)
    .innerJoin(users, eq(pushSubscriptions.userId, users.id))
    .leftJoin(userSettings, eq(userSettings.userId, users.id));

  return rows.map((r) => ({
    userId: r.userId,
    timezone: r.timezone ?? "America/New_York",
    personalityPrefs: r.personalityPrefs as PersonalityPrefs | null,
    notificationPrefs: r.notificationPrefs as NotificationPrefs | null,
    crisisDetectionTier: (r.crisisDetectionTier as CrisisDetectionTier) ?? "nudge",
  }));
}

/**
 * Get all users with any non-null notification prefs.
 * Returns userId, timezone, email, and their prefs.
 * Callers must gate on the specific flag they care about (e.g.
 * emailMorningDigest, emailEveningDigest) — this function does NOT
 * filter on any digest flag.
 */
export async function getAllUsersWithNotificationPrefs() {
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
  source?: string;
  dataHash?: string;
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
      ...(params.source ? { source: params.source } : {}),
      ...(params.dataHash ? { dataHash: params.dataHash } : {}),
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

/** Restore a soft-deleted (abandoned) crisis plan by clearing completedAt. */
export async function restoreCrisisPlan(planId: string, userId: string) {
  const [updated] = await db
    .update(crisisPlans)
    .set({ completedAt: null, updatedAt: new Date() })
    .where(and(eq(crisisPlans.id, planId), eq(crisisPlans.userId, userId)))
    .returning();
  return updated ?? null;
}

/** Returns completed crisis plans (both finished and abandoned), most recent first. */
export async function getCompletedCrisisPlans(userId: string, limit = 10) {
  return db
    .select()
    .from(crisisPlans)
    .where(
      and(
        eq(crisisPlans.userId, userId),
        sql`${crisisPlans.completedAt} IS NOT NULL`
      )
    )
    .orderBy(desc(crisisPlans.completedAt))
    .limit(limit);
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

// ============================================================
// Crisis Detection
// ============================================================

/** Get the most recent unresolved crisis detection for a user. */
export async function getActiveDetectionForUser(userId: string) {
  const rows = await db
    .select()
    .from(crisisDetections)
    .where(
      and(
        eq(crisisDetections.userId, userId),
        isNull(crisisDetections.resolvedAt)
      )
    )
    .orderBy(desc(crisisDetections.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/** Create a new crisis detection record. */
export async function createCrisisDetection(params: {
  userId: string;
  crisisRatio: number;
  involvedTaskIds: string[];
  involvedTaskNames: string[];
  firstDeadline: Date;
  availableMinutes: number;
  requiredMinutes: number;
  tierActionTaken: CrisisDetectionTier;
}) {
  const rows = await db
    .insert(crisisDetections)
    .values({
      userId: params.userId,
      crisisRatio: String(params.crisisRatio),
      involvedTaskIds: params.involvedTaskIds,
      involvedTaskNames: params.involvedTaskNames,
      firstDeadline: params.firstDeadline,
      availableMinutes: params.availableMinutes,
      requiredMinutes: params.requiredMinutes,
      tierActionTaken: params.tierActionTaken,
    })
    .returning();
  return rows[0];
}

/** Update fields on an existing crisis detection. */
export async function updateCrisisDetection(
  id: string,
  data: Partial<{
    crisisRatio: number;
    availableMinutes: number;
    requiredMinutes: number;
    crisisPlanId: string;
    reNudgeSent: boolean;
    resolvedAt: Date;
  }>
) {
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (data.crisisRatio !== undefined) updateData.crisisRatio = String(data.crisisRatio);
  if (data.availableMinutes !== undefined) updateData.availableMinutes = data.availableMinutes;
  if (data.requiredMinutes !== undefined) updateData.requiredMinutes = data.requiredMinutes;
  if (data.crisisPlanId !== undefined) updateData.crisisPlanId = data.crisisPlanId;
  if (data.reNudgeSent !== undefined) updateData.reNudgeSent = data.reNudgeSent;
  if (data.resolvedAt !== undefined) updateData.resolvedAt = data.resolvedAt;

  await db
    .update(crisisDetections)
    .set(updateData)
    .where(eq(crisisDetections.id, id));
}

/** Resolve any active detections whose first deadline has already passed. */
export async function resolveStaleDetections(userId: string): Promise<number> {
  const now = new Date();
  const result = await db
    .update(crisisDetections)
    .set({ resolvedAt: now, updatedAt: now })
    .where(
      and(
        eq(crisisDetections.userId, userId),
        isNull(crisisDetections.resolvedAt),
        lt(crisisDetections.firstDeadline, now)
      )
    )
    .returning({ id: crisisDetections.id });
  return result.length;
}

/** Get the crisis detection tier for a user (defaults to "nudge"). */
export async function getCrisisDetectionTier(userId: string): Promise<CrisisDetectionTier> {
  const rows = await db
    .select({ tier: userSettings.crisisDetectionTier })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  const tier = rows[0]?.tier;
  if (tier === "off" || tier === "watch" || tier === "nudge" || tier === "auto_triage") {
    return tier;
  }
  return "nudge";
}

// ============================================================
// Microtasks
// ============================================================

export type MicrotaskTimeOfDay = "morning" | "afternoon" | "evening" | "anytime";

export type MicrotaskRow = typeof microtasks.$inferSelect;

export interface MicrotaskWithStatus extends MicrotaskRow {
  completedToday: boolean;
  todayNote: string | null;
  completionCount7d: number;
  scheduledToday: boolean;
}

export interface CreateMicrotaskInput {
  title: string;
  emoji?: string | null;
  timeOfDay?: MicrotaskTimeOfDay;
  daysOfWeek?: number[];
  sortOrder?: number;
}

export interface UpdateMicrotaskInput {
  title?: string;
  emoji?: string | null;
  timeOfDay?: MicrotaskTimeOfDay;
  daysOfWeek?: number[];
  active?: boolean;
  sortOrder?: number;
}

export async function createMicrotask(userId: string, input: CreateMicrotaskInput) {
  const [row] = await db
    .insert(microtasks)
    .values({
      userId,
      title: input.title,
      emoji: input.emoji ?? null,
      timeOfDay: input.timeOfDay ?? "anytime",
      ...(input.daysOfWeek ? { daysOfWeek: input.daysOfWeek } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    })
    .returning();
  return row;
}

export async function updateMicrotask(
  id: string,
  userId: string,
  patch: UpdateMicrotaskInput
): Promise<MicrotaskRow | null> {
  const setFields: Partial<typeof microtasks.$inferInsert> = { updatedAt: new Date() };
  if (patch.title !== undefined) setFields.title = patch.title;
  if (patch.emoji !== undefined) setFields.emoji = patch.emoji;
  if (patch.timeOfDay !== undefined) setFields.timeOfDay = patch.timeOfDay;
  if (patch.daysOfWeek !== undefined) setFields.daysOfWeek = patch.daysOfWeek;
  if (patch.active !== undefined) setFields.active = patch.active;
  if (patch.sortOrder !== undefined) setFields.sortOrder = patch.sortOrder;

  const [row] = await db
    .update(microtasks)
    .set(setFields)
    .where(and(eq(microtasks.id, id), eq(microtasks.userId, userId)))
    .returning();
  return row ?? null;
}

/** Soft delete: sets active=false. Preserves completion history. */
export async function deactivateMicrotask(id: string, userId: string): Promise<MicrotaskRow | null> {
  return updateMicrotask(id, userId, { active: false });
}

/** Manage view: list every microtask the user owns (active first, then inactive). */
export async function listAllMicrotasksForUser(userId: string): Promise<MicrotaskRow[]> {
  return db
    .select()
    .from(microtasks)
    .where(eq(microtasks.userId, userId))
    .orderBy(desc(microtasks.active), asc(microtasks.sortOrder), asc(microtasks.createdAt));
}

/**
 * Dashboard view: list active microtasks for the user, enriched with
 * today-completion + rolling 7-day count + scheduledToday flag.
 *
 * `today` is YYYY-MM-DD in the user's timezone (compute via todayInTimezone).
 * `dayOfWeek` is 0=Sun..6=Sat in the user's timezone.
 */
export async function getMicrotasksForDashboard(
  userId: string,
  today: string,
  dayOfWeek: number
): Promise<MicrotaskWithStatus[]> {
  const rows = await db
    .select()
    .from(microtasks)
    .where(and(eq(microtasks.userId, userId), eq(microtasks.active, true)))
    .orderBy(asc(microtasks.sortOrder), asc(microtasks.createdAt));

  if (rows.length === 0) return [];

  // Rolling 7-day window inclusive of today (today minus 6 days → today)
  const todayDate = new Date(today + "T00:00:00Z");
  const weekStart = new Date(todayDate.getTime() - 6 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const ids = rows.map((r) => r.id);
  const completions = await db
    .select({
      microtaskId: microtaskCompletions.microtaskId,
      completedDate: microtaskCompletions.completedDate,
      note: microtaskCompletions.note,
    })
    .from(microtaskCompletions)
    .where(
      and(
        eq(microtaskCompletions.userId, userId),
        inArray(microtaskCompletions.microtaskId, ids),
        gte(microtaskCompletions.completedDate, weekStart),
        lte(microtaskCompletions.completedDate, today)
      )
    );

  const byMicrotask = new Map<string, { count: number; todayNote: string | null; completedToday: boolean }>();
  for (const id of ids) {
    byMicrotask.set(id, { count: 0, todayNote: null, completedToday: false });
  }
  for (const c of completions) {
    const entry = byMicrotask.get(c.microtaskId);
    if (!entry) continue;
    entry.count += 1;
    if (c.completedDate === today) {
      entry.completedToday = true;
      entry.todayNote = c.note ?? null;
    }
  }

  return rows.map((row) => {
    const status = byMicrotask.get(row.id) ?? {
      count: 0,
      todayNote: null,
      completedToday: false,
    };
    return {
      ...row,
      completedToday: status.completedToday,
      todayNote: status.todayNote,
      completionCount7d: status.count,
      scheduledToday: Array.isArray(row.daysOfWeek) && row.daysOfWeek.includes(dayOfWeek),
    };
  });
}

/**
 * Idempotent: if a completion already exists for (microtaskId, completedDate),
 * returns it (updating the note if a new one was provided); otherwise inserts
 * and returns the new row.
 *
 * Note semantics:
 *   - note === undefined or null → leave any existing note untouched on conflict.
 *   - note is a string → write/overwrite it on conflict (so users can long-press
 *     after a one-tap completion and add a note).
 *
 * Validates ownership: returns null if the microtask isn't owned by userId.
 */
export async function completeMicrotask(
  microtaskId: string,
  userId: string,
  completedDate: string,
  note?: string | null
): Promise<typeof microtaskCompletions.$inferSelect | null> {
  const [owned] = await db
    .select({ id: microtasks.id })
    .from(microtasks)
    .where(and(eq(microtasks.id, microtaskId), eq(microtasks.userId, userId)))
    .limit(1);
  if (!owned) return null;

  const insert = db
    .insert(microtaskCompletions)
    .values({
      microtaskId,
      userId,
      completedDate,
      note: note ?? null,
    });

  const [row] =
    note != null
      ? await insert
          .onConflictDoUpdate({
            target: [microtaskCompletions.microtaskId, microtaskCompletions.completedDate],
            set: { note },
          })
          .returning()
      : await insert
          .onConflictDoNothing({
            target: [microtaskCompletions.microtaskId, microtaskCompletions.completedDate],
          })
          .returning();

  if (row) return row;

  // onConflictDoNothing path with no insert → row already exists, fetch it.
  const [existing] = await db
    .select()
    .from(microtaskCompletions)
    .where(
      and(
        eq(microtaskCompletions.microtaskId, microtaskId),
        eq(microtaskCompletions.completedDate, completedDate)
      )
    )
    .limit(1);
  return existing ?? null;
}

export async function uncompleteMicrotask(
  microtaskId: string,
  userId: string,
  completedDate: string
): Promise<boolean> {
  const deleted = await db
    .delete(microtaskCompletions)
    .where(
      and(
        eq(microtaskCompletions.microtaskId, microtaskId),
        eq(microtaskCompletions.userId, userId),
        eq(microtaskCompletions.completedDate, completedDate)
      )
    )
    .returning({ id: microtaskCompletions.id });
  return deleted.length > 0;
}

// ============================================================
// Parallel Play — Rooms
// ============================================================

export type RoomRow = typeof rooms.$inferSelect;

/**
 * Generate a short, URL-safe invite code (8 chars, base32-ish).
 * Collision-resistant for our scale (rooms are personal/small group).
 */
function generateInviteCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no I,L,O,0,1
  let code = "";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  for (let i = 0; i < 8; i++) {
    code += alphabet[bytes[i] % alphabet.length];
  }
  return code;
}

export async function getOrCreatePersonalRoom(userId: string): Promise<RoomRow> {
  const [existing] = await db
    .select()
    .from(rooms)
    .where(and(eq(rooms.ownerId, userId), eq(rooms.type, "personal")))
    .limit(1);
  if (existing) return existing;

  // Retry once on the (extremely unlikely) invite-code collision.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const [created] = await db
        .insert(rooms)
        .values({
          ownerId: userId,
          type: "personal",
          name: null,
          inviteCode: generateInviteCode(),
        })
        .returning();
      // Owner is implicitly a member.
      await db
        .insert(roomMembers)
        .values({ roomId: created.id, userId })
        .onConflictDoNothing();
      return created;
    } catch (err) {
      if (attempt === 2) throw err;
    }
  }
  throw new Error("Could not create personal room after retries");
}

export async function createAdhocRoom(params: {
  ownerId: string;
  name: string;
  maxCapacity?: number;
  expiresAt?: Date | null;
}): Promise<RoomRow> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const [created] = await db
        .insert(rooms)
        .values({
          ownerId: params.ownerId,
          type: "adhoc",
          name: params.name,
          maxCapacity: params.maxCapacity ?? 8,
          expiresAt: params.expiresAt ?? null,
          inviteCode: generateInviteCode(),
        })
        .returning();
      await db
        .insert(roomMembers)
        .values({ roomId: created.id, userId: params.ownerId })
        .onConflictDoNothing();
      return created;
    } catch (err) {
      if (attempt === 2) throw err;
    }
  }
  throw new Error("Could not create adhoc room after retries");
}

export async function getRoomById(roomId: string): Promise<RoomRow | null> {
  const [row] = await db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
  return row ?? null;
}

export async function getRoomByInviteCode(code: string): Promise<RoomRow | null> {
  const [row] = await db
    .select()
    .from(rooms)
    .where(eq(rooms.inviteCode, code))
    .limit(1);
  return row ?? null;
}

export async function listRoomsForUser(userId: string): Promise<
  Array<RoomRow & { isOwner: boolean; memberCount: number }>
> {
  // All rooms the user is a member of (owner is always a member, see helpers above).
  const memberRows = await db
    .select({ roomId: roomMembers.roomId })
    .from(roomMembers)
    .where(eq(roomMembers.userId, userId));

  if (memberRows.length === 0) return [];
  const roomIds = memberRows.map((r) => r.roomId);

  const roomRows = await db
    .select()
    .from(rooms)
    .where(inArray(rooms.id, roomIds));

  // Member counts per room — single grouped query.
  const counts = await db
    .select({
      roomId: roomMembers.roomId,
      count: sql<number>`count(*)::int`,
    })
    .from(roomMembers)
    .where(inArray(roomMembers.roomId, roomIds))
    .groupBy(roomMembers.roomId);

  const countMap = new Map(counts.map((c) => [c.roomId, c.count]));

  return roomRows.map((r) => ({
    ...r,
    isOwner: r.ownerId === userId,
    memberCount: countMap.get(r.id) ?? 0,
  }));
}

/**
 * Rooms hosted by users in this user's friends list, that the user has not
 * already joined, where the room hasn't expired. Powers the "Friends' rooms"
 * browse view in RoomManager — live occupancy is layered on the client via
 * Convex's reactive presence query.
 */
export async function getRoomsHostedByFriends(userId: string): Promise<
  Array<{
    id: string;
    name: string | null;
    type: "personal" | "adhoc";
    inviteCode: string;
    maxCapacity: number;
    expiresAt: Date | null;
    hostId: string;
    hostName: string | null;
  }>
> {
  const friends = await getAcceptedFriends(userId);
  if (friends.length === 0) return [];
  const friendIds = friends.map((f) => f.friendId);

  // Rooms the user is already a member of — surface in "Joined rooms" instead
  // of duplicating them here.
  const myMemberships = await db
    .select({ roomId: roomMembers.roomId })
    .from(roomMembers)
    .where(eq(roomMembers.userId, userId));
  const memberRoomIds = new Set(myMemberships.map((m) => m.roomId));

  const now = new Date();
  const rows = await db
    .select({
      id: rooms.id,
      name: rooms.name,
      type: rooms.type,
      inviteCode: rooms.inviteCode,
      maxCapacity: rooms.maxCapacity,
      expiresAt: rooms.expiresAt,
      hostId: rooms.ownerId,
      hostName: users.displayName,
    })
    .from(rooms)
    .innerJoin(users, eq(users.id, rooms.ownerId))
    .where(
      and(
        inArray(rooms.ownerId, friendIds),
        or(isNull(rooms.expiresAt), gt(rooms.expiresAt, now))
      )
    )
    .orderBy(asc(users.displayName), asc(rooms.createdAt));

  return rows
    .filter((r) => !memberRoomIds.has(r.id))
    .map((r) => ({
      ...r,
      type: r.type as "personal" | "adhoc",
    }));
}

export async function isRoomMember(
  roomId: string,
  userId: string
): Promise<boolean> {
  const [row] = await db
    .select({ id: roomMembers.id })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)))
    .limit(1);
  return !!row;
}

export async function getRoomMemberCount(roomId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(roomMembers)
    .where(eq(roomMembers.roomId, roomId));
  return row?.count ?? 0;
}

/**
 * Idempotent join. Returns true if newly added, false if already a member.
 * Throws if room is at capacity.
 */
export async function joinRoom(
  roomId: string,
  userId: string
): Promise<{ added: boolean; alreadyMember: boolean }> {
  const room = await getRoomById(roomId);
  if (!room) throw new Error("Room not found");

  const already = await isRoomMember(roomId, userId);
  if (already) return { added: false, alreadyMember: true };

  const count = await getRoomMemberCount(roomId);
  if (count >= (room.maxCapacity ?? 8)) {
    throw new Error("Room is at capacity");
  }

  await db
    .insert(roomMembers)
    .values({ roomId, userId })
    .onConflictDoNothing();
  return { added: true, alreadyMember: false };
}

/**
 * Remove a user from a room. If the user is the owner of an adhoc room and is
 * the last member, the room is deleted (cascades room_members). Personal rooms
 * always persist for their owner — we just leave the member row in place.
 */
export async function leaveRoom(
  roomId: string,
  userId: string
): Promise<{ left: boolean; roomDeleted: boolean }> {
  const room = await getRoomById(roomId);
  if (!room) return { left: false, roomDeleted: false };

  // Personal-room owners can't leave their own room — it's their default room.
  if (room.type === "personal" && room.ownerId === userId) {
    return { left: false, roomDeleted: false };
  }

  await db
    .delete(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));

  // If owner of an adhoc room is leaving and no members remain → delete.
  if (room.type === "adhoc" && room.ownerId === userId) {
    const remaining = await getRoomMemberCount(roomId);
    if (remaining === 0) {
      await db.delete(rooms).where(eq(rooms.id, roomId));
      return { left: true, roomDeleted: true };
    }
  }

  return { left: true, roomDeleted: false };
}

/**
 * Owner-only: kick a member. Returns true if a row was removed.
 */
export async function revokeRoomMember(
  roomId: string,
  ownerId: string,
  targetUserId: string
): Promise<boolean> {
  const room = await getRoomById(roomId);
  if (!room || room.ownerId !== ownerId) return false;
  if (targetUserId === ownerId) return false; // owner cannot kick self

  const result = await db
    .delete(roomMembers)
    .where(
      and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, targetUserId))
    )
    .returning({ id: roomMembers.id });
  return result.length > 0;
}

export async function listRoomMembers(
  roomId: string
): Promise<Array<{ userId: string; displayName: string | null; joinedAt: Date }>> {
  return await db
    .select({
      userId: roomMembers.userId,
      displayName: users.displayName,
      joinedAt: roomMembers.joinedAt,
    })
    .from(roomMembers)
    .innerJoin(users, eq(roomMembers.userId, users.id))
    .where(eq(roomMembers.roomId, roomId))
    .orderBy(asc(roomMembers.joinedAt));
}
