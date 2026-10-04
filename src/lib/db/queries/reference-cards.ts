import { db } from "../index";
import { referenceCards } from "../schema";
import { eq, and, asc } from "drizzle-orm";
import {
  effectiveCheckedItems,
  toggleCheckedItem,
  type ChecklistReset,
} from "@/lib/reference-cards";

// ============================================================
// Reference Cards
// ============================================================

export type ReferenceCardRow = typeof referenceCards.$inferSelect;

export interface CreateReferenceCardInput {
  title: string;
  content?: string;
  daysOfWeek?: number[] | null;
  showFrom?: string | null;
  showUntil?: string | null;
  checklistReset?: ChecklistReset;
}

export interface UpdateReferenceCardInput {
  title?: string;
  content?: string;
  collapsed?: boolean;
  daysOfWeek?: number[] | null;
  showFrom?: string | null;
  showUntil?: string | null;
  checklistReset?: ChecklistReset;
  sortOrder?: number;
}

/** Rows as the dashboard sees them: ticks from a past day already dropped. */
export async function listReferenceCards(
  userId: string,
  todayKey: string
): Promise<ReferenceCardRow[]> {
  const rows = await db
    .select()
    .from(referenceCards)
    .where(eq(referenceCards.userId, userId))
    .orderBy(asc(referenceCards.sortOrder), asc(referenceCards.createdAt));
  return rows.map((r) => ({ ...r, checkedItems: effectiveCheckedItems(r, todayKey) }));
}

export async function createReferenceCard(
  userId: string,
  input: CreateReferenceCardInput
): Promise<ReferenceCardRow> {
  const [row] = await db
    .insert(referenceCards)
    .values({
      userId,
      title: input.title,
      content: input.content ?? "",
      daysOfWeek: input.daysOfWeek ?? null,
      showFrom: input.showFrom ?? null,
      showUntil: input.showUntil ?? null,
      checklistReset: input.checklistReset ?? "daily",
    })
    .returning();
  return row;
}

export async function updateReferenceCard(
  id: string,
  userId: string,
  patch: UpdateReferenceCardInput
): Promise<ReferenceCardRow | null> {
  const setFields: Partial<typeof referenceCards.$inferInsert> = { updatedAt: new Date() };
  if (patch.title !== undefined) setFields.title = patch.title;
  if (patch.content !== undefined) {
    setFields.content = patch.content;
    // Ticks are stored by position, so new text would inherit the wrong ones.
    setFields.checkedItems = [];
    setFields.checkedOn = null;
  }
  if (patch.collapsed !== undefined) setFields.collapsed = patch.collapsed;
  if (patch.daysOfWeek !== undefined) setFields.daysOfWeek = patch.daysOfWeek;
  if (patch.showFrom !== undefined) setFields.showFrom = patch.showFrom;
  if (patch.showUntil !== undefined) setFields.showUntil = patch.showUntil;
  if (patch.checklistReset !== undefined) setFields.checklistReset = patch.checklistReset;
  if (patch.sortOrder !== undefined) setFields.sortOrder = patch.sortOrder;

  const [row] = await db
    .update(referenceCards)
    .set(setFields)
    .where(and(eq(referenceCards.id, id), eq(referenceCards.userId, userId)))
    .returning();
  return row ?? null;
}

/**
 * Tick or untick one checklist item, or clear them all (`index` null).
 * Starts from what counts today, so the first tick of a new day on a daily
 * list doesn't resurrect yesterday's.
 */
export async function setReferenceCardCheck(
  id: string,
  userId: string,
  todayKey: string,
  change: { index: number; checked: boolean } | null
): Promise<ReferenceCardRow | null> {
  const [card] = await db
    .select()
    .from(referenceCards)
    .where(and(eq(referenceCards.id, id), eq(referenceCards.userId, userId)))
    .limit(1);
  if (!card) return null;

  const checkedItems = change
    ? toggleCheckedItem(effectiveCheckedItems(card, todayKey), change.index, change.checked)
    : [];

  const [row] = await db
    .update(referenceCards)
    .set({ checkedItems, checkedOn: todayKey, updatedAt: new Date() })
    .where(and(eq(referenceCards.id, id), eq(referenceCards.userId, userId)))
    .returning();
  return row ?? null;
}

export async function deleteReferenceCard(id: string, userId: string): Promise<boolean> {
  const rows = await db
    .delete(referenceCards)
    .where(and(eq(referenceCards.id, id), eq(referenceCards.userId, userId)))
    .returning({ id: referenceCards.id });
  return rows.length > 0;
}
