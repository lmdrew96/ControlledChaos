import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { parseBrainDump } from "@/lib/ai/parse-dump";
import { getUser, createBrainDump, createTasksFromDump } from "@/lib/db/queries";

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { extractedText, mediaUrl } = body as {
      extractedText: string;
      mediaUrl?: string;
    };

    if (!extractedText?.trim()) {
      return NextResponse.json(
        { error: "Extracted text is empty" },
        { status: 400 }
      );
    }

    // Get user timezone for accurate date parsing
    const user = await getUser(userId);
    const timezone = user?.timezone ?? "America/New_York";

    // Parse with AI (photo-aware: handles OCR artifacts)
    const result = await parseBrainDump(extractedText, "photo", timezone);

    // Save brain dump record with photo metadata
    const dump = await createBrainDump({
      userId,
      inputType: "photo",
      rawContent: extractedText,
      aiResponse: result,
      mediaUrl: mediaUrl ?? undefined,
    });

    // Create tasks from parsed output
    const createdTasks = await createTasksFromDump(
      userId,
      dump.id,
      result.tasks
    );

    return NextResponse.json({
      dump: {
        id: dump.id,
        summary: result.summary,
      },
      tasks: createdTasks,
    });
  } catch (error) {
    console.error("[API] POST /api/dump/photo/parse error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to parse brain dump";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
