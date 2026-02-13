import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { parseBrainDump } from "@/lib/ai/parse-dump";
import { ensureUser, createBrainDump, createTasksFromDump } from "@/lib/db/queries";

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const content = body.content?.trim();

    if (!content) {
      return NextResponse.json(
        { error: "Brain dump content cannot be empty" },
        { status: 400 }
      );
    }

    if (content.length > 10000) {
      return NextResponse.json(
        { error: "Brain dump is too long (max 10,000 characters)" },
        { status: 400 }
      );
    }

    // Ensure user exists in our DB (synced from Clerk)
    const clerkUser = await currentUser();
    await ensureUser(
      userId,
      clerkUser?.emailAddresses[0]?.emailAddress ?? "",
      clerkUser?.firstName ?? undefined
    );

    // Parse with AI
    const result = await parseBrainDump(content);

    // Save brain dump record
    const dump = await createBrainDump({
      userId,
      inputType: "text",
      rawContent: content,
      aiResponse: result,
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
    console.error("[API] POST /api/dump/text error:", error);
    const message =
      error instanceof Error ? error.message : "Something went wrong";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
