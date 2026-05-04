import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { brainDumps } from "@/lib/db/schema";
import { getUser } from "@/lib/db/queries";
import { toUserLocal } from "@/lib/timezone";
import type { BrainDumpResult } from "@/types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const SNIPPET_MAX = 60;

function makeSnippet(raw: string | null, ai: BrainDumpResult | null): string {
  const source = raw?.trim() || ai?.summary?.trim() || "";
  if (!source) return "brain dump";
  const collapsed = source.replace(/\s+/g, " ");
  return collapsed.length > SNIPPET_MAX
    ? `${collapsed.slice(0, SNIPPET_MAX - 1).trimEnd()}…`
    : collapsed;
}

export async function GET(_req: Request, context: RouteContext) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    const [dump] = await db
      .select({
        id: brainDumps.id,
        rawContent: brainDumps.rawContent,
        aiResponse: brainDumps.aiResponse,
        category: brainDumps.category,
        createdAt: brainDumps.createdAt,
      })
      .from(brainDumps)
      .where(and(eq(brainDumps.id, id), eq(brainDumps.userId, userId)))
      .limit(1);

    if (!dump) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const user = await getUser(userId);
    const timezone = user?.timezone ?? "America/New_York";
    const local = toUserLocal(dump.createdAt, timezone);
    const pad = (n: number) => String(n).padStart(2, "0");
    const date = `${local.year}-${pad(local.month)}-${pad(local.day)}`;

    return NextResponse.json({
      id: dump.id,
      date,
      category: dump.category,
      snippet: makeSnippet(
        dump.rawContent,
        dump.aiResponse as BrainDumpResult | null
      ),
    });
  } catch (error) {
    console.error("[API] GET /api/dump/[id]/source-info error:", error);
    return NextResponse.json(
      { error: "Failed to load dump source info" },
      { status: 500 }
    );
  }
}
