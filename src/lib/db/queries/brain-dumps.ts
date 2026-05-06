import { db } from "../index";
import { brainDumps } from "../schema";
import { eq, and, desc, gte, lt } from "drizzle-orm";
import type { DumpInputType, DumpCategory, BrainDumpResult } from "@/types";

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
      aiResponse: params.aiResponse,
      mediaUrl: params.mediaUrl ?? null,
      mediaUrls: params.mediaUrls ?? [],
      category: params.category ?? "braindump",
    })
    .returning();

  return dump;
}


