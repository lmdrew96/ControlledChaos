import { db } from "../index";
import { users, userSettings } from "../schema";
import { eq, and, sql } from "drizzle-orm";
import type { CalendarColors, EnergyProfile, NotificationPrefs, PersonalityPrefs } from "@/types";

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


