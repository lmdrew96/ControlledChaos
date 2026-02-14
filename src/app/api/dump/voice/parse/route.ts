import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { parseBrainDump } from "@/lib/ai/parse-dump";
import { createBrainDump, createTasksFromDump } from "@/lib/db/queries";

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { transcript, mediaUrl } = body as {
      transcript: string;
      mediaUrl?: string;
    };

    if (!transcript?.trim()) {
      return NextResponse.json(
        { error: "Transcript is empty" },
        { status: 400 }
      );
    }

    // Parse with AI (voice-aware: filters filler speech)
    const result = await parseBrainDump(transcript, "voice");

    // Save brain dump record with voice metadata
    const dump = await createBrainDump({
      userId,
      inputType: "voice",
      rawContent: transcript,
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
    console.error("[API] POST /api/dump/voice/parse error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to parse brain dump";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
