import { currentUser } from "@clerk/nextjs/server";
import { parseBrainDump, summarizeJunkJournal } from "@/lib/ai/parse-dump";
import { buildAIContext } from "@/lib/ai/context";
import { allDayRange, toDateKeyInTimezone } from "@/lib/timezone";
import { expandRecurrence } from "@/lib/calendar/expand-recurrence";
import {
  ensureUser,
  getUser,
  getUserSettings,
  getUserGoals,
  createGoal,
  getPendingTasks,
  getCalendarEventsByDateRange,
  getSavedLocations,
  createBrainDump,
  createTasksFromDump,
  createCalendarEventsFromDump,
} from "@/lib/db/queries";
import type { DumpCategory, DumpInputType, PersonalityPrefs } from "@/types";

export const MAX_DUMP_LENGTH = 10_000;

/**
 * Why a dump's text can't be committed, or null when it can. Shared so the
 * text, voice and photo routes all refuse the same things.
 */
export function dumpContentError(content: string): string | null {
  if (!content) return "Brain dump content cannot be empty";
  if (content.length > MAX_DUMP_LENGTH) {
    return "Brain dump is too long (max 10,000 characters)";
  }
  return null;
}

export function parseDumpCategory(raw: unknown): DumpCategory {
  return raw === "junk_journal" ? "junk_journal" : "braindump";
}

/**
 * Parse a brain dump and write everything it produced: the dump row, its
 * tasks and its calendar events.
 *
 * Text, voice and photo used to carry three copies of this. They drifted —
 * voice and photo skipped ensureUser and the length cap, and wrote only the
 * legacy mediaUrl — so they live here once. Callers validate with
 * dumpContentError first.
 */
export async function commitParsedDump(params: {
  userId: string;
  inputType: DumpInputType;
  content: string;
  category: DumpCategory;
  mediaUrl?: string | null;
}) {
  const { userId, inputType, content, category } = params;
  const mediaUrl = params.mediaUrl || null;
  const media = { mediaUrl, mediaUrls: mediaUrl ? [mediaUrl] : [] };

  // A first dump can land before the Clerk webhook has created the user row.
  const clerkUser = await currentUser();
  await ensureUser(
    userId,
    clerkUser?.emailAddresses[0]?.emailAddress ?? "",
    clerkUser?.firstName ?? undefined
  );

  const user = await getUser(userId);
  const timezone = user?.timezone ?? "America/New_York";

  // Junk Journal: summarize only, no task/event extraction. The summary
  // prompt doesn't need the context fetch below.
  if (category === "junk_journal") {
    const summary = await summarizeJunkJournal(content);
    const dump = await createBrainDump({
      userId,
      inputType,
      rawContent: content,
      aiResponse: { tasks: [], events: [], summary },
      ...media,
      category,
    });
    return { dump: { id: dump.id, summary }, tasks: [], eventsCreated: 0, goalsCreated: [] };
  }

  // Context for anti-hallucination grounding.
  const today = allDayRange(toDateKeyInTimezone(new Date(), timezone), timezone);
  const [activeGoals, existingTasks, todayEvents, savedLocs, settings, aiCtx] = await Promise.all([
    // Active only: a task shouldn't be linked to a goal that's finished or paused.
    getUserGoals(userId, "active"),
    getPendingTasks(userId),
    getCalendarEventsByDateRange(userId, new Date(today.startISO), new Date(today.endISO)),
    getSavedLocations(userId),
    getUserSettings(userId),
    buildAIContext(userId, { skipCalendar: true }), // calendar already fetched above
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

  // inputType tunes the prompt: voice filters filler speech, photo handles
  // OCR artifacts.
  const result = await parseBrainDump(content, inputType, timezone, {
    existingGoals: activeGoals.map((g) => ({ title: g.title })),
    existingTasks: existingTasks.map((t) => ({ title: t.title })),
    calendarSummary,
    savedLocationNames: savedLocs.map((l) => l.name),
    personalityPrefs: (settings?.personalityPrefs as PersonalityPrefs | null) ?? null,
    aiContextBlock: aiCtx.formatted,
  });

  const dump = await createBrainDump({
    userId,
    inputType,
    rawContent: content,
    aiResponse: result,
    ...media,
    category,
  });

  // A goal the dump proposed goes in first, so tasks that serve it can link to it.
  const createdGoals = await Promise.all(
    (result.goals ?? []).map((g) =>
      createGoal(userId, {
        title: g.title,
        description: g.description ?? null,
        targetDate: g.targetDate ? new Date(g.targetDate) : null,
      })
    )
  );

  const createdTasks = await createTasksFromDump(userId, dump.id, result.tasks, [
    ...activeGoals,
    ...createdGoals,
  ]);

  let eventsCreated = 0;
  if (result.events && result.events.length > 0) {
    const expandedEvents: Array<{
      title: string;
      description: string | null;
      startTime: Date;
      endTime: Date;
      location: string | null;
      isAllDay: boolean;
      seriesId: string | null;
    }> = [];

    for (const parsedEvent of result.events) {
      // Expand in the user's zone so the series keeps its wall-clock time
      // across DST — without timeZone the expander runs in server UTC.
      const instances = expandRecurrence({
        ...parsedEvent,
        recurrence: parsedEvent.recurrence && { ...parsedEvent.recurrence, timeZone: timezone },
      });
      const seriesId = instances.length > 1 ? crypto.randomUUID() : null;
      for (const instance of instances) {
        expandedEvents.push({ ...instance, seriesId });
      }
    }

    const created = await createCalendarEventsFromDump(userId, dump.id, expandedEvents);
    eventsCreated = created.length;
  }

  return {
    dump: { id: dump.id, summary: result.summary },
    tasks: createdTasks,
    eventsCreated,
    goalsCreated: createdGoals.map((g) => ({ id: g.id, title: g.title })),
  };
}
