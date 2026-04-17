import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getBrainDumpsByUser } from "@/lib/db/queries";
import type { DumpCategory } from "@/types";

const VALID_CATEGORIES: DumpCategory[] = ["braindump", "junk_journal"];

export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const categoryRaw = url.searchParams.get("category");
    const limitRaw = url.searchParams.get("limit");
    const offsetRaw = url.searchParams.get("offset");

    const category =
      categoryRaw && (VALID_CATEGORIES as string[]).includes(categoryRaw)
        ? (categoryRaw as DumpCategory)
        : undefined;
    const limit = limitRaw
      ? Math.max(1, Math.min(100, parseInt(limitRaw, 10)))
      : 30;
    const offset = offsetRaw
      ? Math.max(0, parseInt(offsetRaw, 10))
      : 0;

    const dumps = await getBrainDumpsByUser(userId, limit, { category, offset });

    return NextResponse.json({
      dumps: dumps.map((d) => ({
        id: d.id,
        inputType: d.inputType,
        category: d.category,
        rawContent: d.rawContent,
        mediaUrl: d.mediaUrl,
        summary: (d.aiResponse as { summary?: string })?.summary ?? null,
        taskCount:
          (d.aiResponse as { tasks?: unknown[] })?.tasks?.length ?? 0,
        eventCount:
          (d.aiResponse as { events?: unknown[] })?.events?.length ?? 0,
        createdAt: d.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("[API] GET /api/dump/history error:", error);
    return NextResponse.json(
      { error: "Failed to fetch history" },
      { status: 500 }
    );
  }
}
