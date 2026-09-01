import { db } from "../index";
import { crisisDetections, crisisMessages, crisisPlans, userSettings } from "../schema";
import { eq, and, asc, desc, gt, lt, isNull, or, sql } from "drizzle-orm";
import type { CrisisDetectionTier, CrisisTask } from "@/types";

// ============================================================
// Crisis Plans
// ============================================================
export async function createCrisisPlan(params: {
  userId: string;
  taskName: string;
  deadline: Date | null;
  targetDate?: Date | null;
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
      targetDate: params.targetDate ?? null,
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

/**
 * A plan is active while it is incomplete AND still relevant.
 *
 * "Still relevant" used to mean only `deadline > now`. Now that a plan can have
 * no hard deadline at all (the user told us the date was self-imposed), that
 * test would silently drop those plans out of existence — so a deadline-less
 * plan stays active for a bounded window after creation instead.
 */
const DEADLINELESS_PLAN_TTL_MS = 24 * 60 * 60 * 1000;

function activePlanCondition(userId: string, now: Date) {
  const cutoff = new Date(now.getTime() - DEADLINELESS_PLAN_TTL_MS);
  return and(
    eq(crisisPlans.userId, userId),
    sql`${crisisPlans.completedAt} IS NULL`,
    or(
      gt(crisisPlans.deadline, now),
      and(isNull(crisisPlans.deadline), gt(crisisPlans.createdAt, cutoff))
    )
  );
}

export async function getActiveCrisisPlan(userId: string) {
  const now = new Date();
  const [plan] = await db
    .select()
    .from(crisisPlans)
    .where(activePlanCondition(userId, now))
    .orderBy(desc(crisisPlans.createdAt))
    .limit(1);
  return plan ?? null;
}

/** All active crisis plans, soonest hard deadline first (deadline-less last). */
export async function getActiveCrisisPlans(userId: string) {
  const now = new Date();
  return db
    .select()
    .from(crisisPlans)
    .where(activePlanCondition(userId, now))
    // NULLS LAST: a plan with no hard deadline is by definition not the most
    // urgent thing on the list.
    .orderBy(sql`${crisisPlans.deadline} ASC NULLS LAST`);
}

/**
 * Apply a correction the user stated in chat.
 *
 * This is the write-back the rescue assistant was missing. Without it a
 * correction lived only in the transcript, while the system prompt kept being
 * rebuilt from the stale row every turn — so the assistant re-derived the same
 * panic no matter how many times it was told otherwise.
 */
export async function updateCrisisPlanDeadlines(
  planId: string,
  userId: string,
  deadlines: { deadline: Date | null; targetDate: Date | null }
) {
  const [updated] = await db
    .update(crisisPlans)
    .set({
      deadline: deadlines.deadline,
      targetDate: deadlines.targetDate,
      updatedAt: new Date(),
    })
    .where(and(eq(crisisPlans.id, planId), eq(crisisPlans.userId, userId)))
    .returning();
  return updated ?? null;
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
    dismissedAt: Date;
    resolvedAt: Date;
    involvedTaskIds: string[];
    involvedTaskNames: string[];
    firstDeadline: Date;
  }>
) {
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (data.crisisRatio !== undefined) updateData.crisisRatio = String(data.crisisRatio);
  if (data.availableMinutes !== undefined) updateData.availableMinutes = data.availableMinutes;
  if (data.requiredMinutes !== undefined) updateData.requiredMinutes = data.requiredMinutes;
  if (data.crisisPlanId !== undefined) updateData.crisisPlanId = data.crisisPlanId;
  if (data.reNudgeSent !== undefined) updateData.reNudgeSent = data.reNudgeSent;
  if (data.dismissedAt !== undefined) updateData.dismissedAt = data.dismissedAt;
  if (data.resolvedAt !== undefined) updateData.resolvedAt = data.resolvedAt;
  if (data.involvedTaskIds !== undefined) updateData.involvedTaskIds = data.involvedTaskIds;
  if (data.involvedTaskNames !== undefined) updateData.involvedTaskNames = data.involvedTaskNames;
  if (data.firstDeadline !== undefined) updateData.firstDeadline = data.firstDeadline;

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

/**
 * Mark the user's active detection as dismissed.
 *
 * Dismissal suppresses the proposal banner only — the row stays active so the
 * nav badge, re-nudge logic, and any generated plan are all unaffected. A new
 * detection row (i.e. a genuinely new collision) surfaces a fresh banner.
 */
export async function dismissActiveDetection(userId: string): Promise<string | null> {
  const now = new Date();
  const result = await db
    .update(crisisDetections)
    .set({ dismissedAt: now, updatedAt: now })
    .where(
      and(
        eq(crisisDetections.userId, userId),
        isNull(crisisDetections.resolvedAt),
        isNull(crisisDetections.dismissedAt)
      )
    )
    .returning({ id: crisisDetections.id });
  return result[0]?.id ?? null;
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


