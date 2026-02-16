import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { parseBrainDump } from "@/lib/ai/parse-dump";
import {
  ensureUser,
  getUser,
  getUserGoals,
  getPendingTasks,
  getCalendarEventsByDateRange,
  createBrainDump,
  createTasksFromDump,
} from "@/lib/db/queries";
import { formatCurrentDateTime } from "@/lib/ai/prompts";

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

    // Get user timezone for accurate date parsing
    const user = await getUser(userId);
    const timezone = user?.timezone ?? "America/New_York";

    // Fetch context for anti-hallucination grounding
    const now = new Date();
    const todayStart = startOfDayInTz(now, timezone);
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    const [existingGoals, existingTasks, todayEvents] = await Promise.all([
      getUserGoals(userId),
      getPendingTasks(userId),
      getCalendarEventsByDateRange(userId, todayStart, todayEnd),
    ]);

    const calendarSummary =
      todayEvents.length > 0
        ? todayEvents
            .map((e) => {
              const time = new Date(e.startTime).toLocaleTimeString("en-US", {
                timeZone: timezone,
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              });
              return `${time}: ${e.title}`;
            })
            .join(", ")
        : undefined;

    // Parse with AI
    const result = await parseBrainDump(content, "text", timezone, {
      existingGoals: existingGoals.map((g) => ({ title: g.title })),
      existingTasks: existingTasks.map((t) => ({ title: t.title })),
      calendarSummary,
    });

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

function startOfDayInTz(date: Date, timezone: string): Date {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === "year")!.value;
  const month = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  return new Date(`${year}-${month}-${day}T00:00:00`);
}
