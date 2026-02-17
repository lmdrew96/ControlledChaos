import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getBrainDumpsByUser } from "@/lib/db/queries";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dumps = await getBrainDumpsByUser(userId, 30);

    return NextResponse.json({
      dumps: dumps.map((d) => ({
        id: d.id,
        inputType: d.inputType,
        rawContent: d.rawContent,
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
