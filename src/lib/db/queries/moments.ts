import { db } from "../index";
import { moments } from "../schema";
import { eq, and, desc, gte, lte, inArray, isNull } from "drizzle-orm";
import type { MomentType } from "@/types";

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


