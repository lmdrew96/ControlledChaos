import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sql, getUserId, getUserTimezone, getUserSettings } from "./db.js";
import { formatTask, formatEvent, formatGoal, formatBrainDump, formatMoment, formatMirrorEntry, formatMicrotask, fmtTimeLocal, fmtLocal } from "./helpers.js";
import { expandRecurrence, getZonedParts, zonedToUtc } from "./expand-recurrence.js";

/**
 * Keep task_sessions in step with a scheduled_for this server just wrote.
 *
 * The app treats task_sessions as the source of truth for planned work and
 * tasks.scheduled_for as a derived mirror of the earliest sitting. This server
 * writes the column directly with raw SQL, so it has to write the session too
 * — otherwise the next time the app recomputes the mirror it would find no
 * sessions and clear the plan.
 *
 * Mirrors the app's setPrimaryTaskSession / clearTaskSessions: a time moves
 * the earliest UNANSWERED sitting (or adds one), so a multi-sitting plan keeps
 * its other sittings; null clears the unanswered ones. Sittings with a logged
 * outcome are never touched — they're a record of work that happened.
 */
async function syncPlannedSession(
  userId: string,
  taskId: string,
  startsAt: Date | null
): Promise<void> {
  if (!startsAt) {
    await sql(
      `DELETE FROM task_sessions WHERE task_id = $1 AND user_id = $2 AND status IS NULL`,
      [taskId, userId]
    );
  } else {
    const moved = await sql(
      `UPDATE task_sessions SET starts_at = $3
        WHERE id = (SELECT id FROM task_sessions
                     WHERE task_id = $1 AND user_id = $2 AND status IS NULL
                     ORDER BY starts_at LIMIT 1)
        RETURNING id`,
      [taskId, userId, startsAt.toISOString()]
    );
    if (moved.length === 0) {
      await sql(
        `INSERT INTO task_sessions (task_id, user_id, starts_at) VALUES ($1, $2, $3)`,
        [taskId, userId, startsAt.toISOString()]
      );
    }
  }
  // The mirror is the earliest remaining sitting, which may not be the one
  // just written.
  await sql(
    `UPDATE tasks SET scheduled_for =
       (SELECT MIN(starts_at) FROM task_sessions WHERE task_id = $1 AND user_id = $2)
     WHERE id = $1 AND user_id = $2`,
    [taskId, userId]
  );
}

/**
 * SET fragment that stamps completed_at only on the transition into
 * completed. Re-completing a task keeps its original completion time, the
 * same way it doesn't log a second completion.
 */
const COMPLETED_AT_ON_COMPLETE = `completed_at = CASE WHEN status = 'completed' THEN COALESCE(completed_at, NOW()) ELSE NOW() END`;

const DAY_MS = 86_400_000;

/**
 * The calendar date a caller meant by a datetime for an all-day event.
 *
 * Callers are told to send UTC, and a careful one sends local midnight
 * converted to UTC. A careless one sends the date at UTC midnight
 * ("2026-09-30T00:00:00Z"), which is the previous evening in the Americas —
 * taken literally, the event lands a day early. A bare date or an exact UTC
 * midnight is read as the date itself; anything else is read in the user's
 * timezone.
 */
function intendedDateKey(value: string | Date, tz: string): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (d.getTime() % DAY_MS === 0) return d.toISOString().slice(0, 10);
  const p = getZonedParts(d, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Local midnight of a YYYY-MM-DD in `tz`, plus `addDays`. */
function localMidnight(dateKey: string, tz: string, addDays = 0): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + addDays));
  return zonedToUtc(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate(), 0, 0, 0, tz);
}

/**
 * The app's all-day convention (allDayRange): local midnight to the local
 * midnight after the last day, exclusive. `end` is optional; at least one day.
 */
function allDayBounds(
  start: string | Date,
  end: string | Date | null | undefined,
  tz: string
): { start: Date; end: Date } {
  const startKey = intendedDateKey(start, tz);
  const startAt = localMidnight(startKey, tz);
  // The end is exclusive, so the last day is the one just before it.
  const lastKey = end ? intendedDateKey(new Date(new Date(end).getTime() - 1), tz) : startKey;
  const endAt = localMidnight(lastKey > startKey ? lastKey : startKey, tz, 1);
  return { start: startAt, end: endAt };
}

/**
 * Log a completion the way the app's PATCH /api/tasks/[id] does. Check-ins
 * and idle nudges read task_activity to decide whether the user has been
 * active today, so a completion made through Claude has to land here too or
 * an active user reads as idle.
 */
async function logTaskCompleted(userId: string, taskId: string): Promise<void> {
  // Same context shape as the app's logTaskCompletion. Energy is left null
  // here — the app derives it from recent moments, which this server doesn't
  // replicate — but time of day still feeds the pattern analysis.
  const tz = await getUserTimezone(userId);
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(new Date())
  );
  const timeOfDay =
    hour >= 6 && hour < 12 ? "morning" : hour >= 12 && hour < 17 ? "afternoon" : hour >= 17 && hour < 21 ? "evening" : "night";
  await sql(
    `INSERT INTO task_activity (user_id, task_id, action, context) VALUES ($1, $2, 'completed', $3)`,
    [userId, taskId, JSON.stringify({ energy: null, time_of_day: timeOfDay })]
  );
}

/**
 * Resolve a goal_id param. Returns an error message when the goal isn't the
 * user's or was deleted, so a task never links to a goal the app hides.
 */
async function checkGoal(userId: string, goalId: string): Promise<string | null> {
  const rows = await sql(
    `SELECT 1 FROM goals WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [goalId, userId]
  );
  return rows.length === 0 ? `Goal \`${goalId}\` not found.` : null;
}

// Compute today's calendar date (YYYY-MM-DD) in the given IANA timezone.
/**
 * Normalize an optional, nullable datetime param for the update field maps.
 *
 * Returns `undefined` when the caller omitted the field (leave the column
 * alone) and `null` when the caller explicitly passed null or "" (write SQL
 * NULL). The two cases have to stay distinguishable, or a time can be set but
 * never cleared.
 */
/** A timestamp Postgres will accept, rather than a 500 from the INSERT/UPDATE. */
const isValidTimestamp = (value: string): boolean => !Number.isNaN(Date.parse(value));

function timeField(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return new Date(value).toISOString();
}

function todayInTz(tz: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

/**
 * [start, end) of a local calendar day, as instants.
 *
 * Timestamp columns here are naive UTC. Comparing one to
 * `(NOW() AT TIME ZONE tz)::date` lines it up against UTC midnight of the
 * local date (8pm the evening before in US Eastern), and casting a column
 * with `AT TIME ZONE tz` shifts it the other way. Build the local day's
 * bounds as real instants and compare the raw columns against those.
 *
 * The `::timestamp` casts matter: a bare `date AT TIME ZONE tz` resolves to
 * the timestamptz overload, which reads the date as UTC midnight and returns
 * the wrong start (Sep 23 20:00Z instead of Sep 24 04:00Z in New York).
 */
async function localDayWindow(
  date: string,
  tz: string
): Promise<{ start: Date | string; end: Date | string }> {
  const rows = await sql(
    `SELECT
       ($1::date::timestamp AT TIME ZONE $2) AS day_start,
       (($1::date + INTERVAL '1 day')::timestamp AT TIME ZONE $2) AS day_end`,
    [date, tz]
  );
  return {
    start: rows[0].day_start as Date | string,
    end: rows[0].day_end as Date | string,
  };
}

// ============================================================
// Register all ControlledChaos tools on the given server
// ============================================================
/**
 * Extra columns for task list queries: the next sitting that hasn't started
 * and how many sittings there are. formatTask uses them so a multi-sitting
 * task reports its upcoming block, not the earliest one (scheduled_for).
 */
const SESSION_SUMMARY_COLUMNS = `
  (SELECT MIN(x.starts_at) FROM task_sessions x WHERE x.task_id = tasks.id AND x.starts_at > NOW()) AS next_session_at,
  (SELECT COUNT(*)::int FROM task_sessions x WHERE x.task_id = tasks.id) AS session_count`;

export function registerAllTools(server: McpServer): void {

  // ----------------------------------------------------------
  // 1. cc_list_tasks
  // ----------------------------------------------------------
  server.registerTool(
    "cc_list_tasks",
    {
      title: "List Tasks",
      description: `List tasks from ControlledChaos, optionally filtered by status, priority, category, or energy level.

Args:
  - status: Filter by task status (pending, in_progress, completed, snoozed, cancelled). Default: shows pending + in_progress.
  - priority: Filter by priority (urgent, important, normal, someday).
  - category: Filter by category (school, work, personal, errands, health).
  - energy_level: Filter by energy required (low, medium, high).
  - limit: Max results (1-100, default 50).

Returns: Markdown-formatted list of tasks with IDs, status, priority, energy, deadlines, etc.`,
      inputSchema: {
        status: z.enum(["pending", "in_progress", "completed", "snoozed", "cancelled"]).optional().describe("Filter by status"),
        priority: z.enum(["urgent", "important", "normal", "someday"]).optional().describe("Filter by priority"),
        category: z.enum(["school", "work", "personal", "errands", "health"]).optional().describe("Filter by category"),
        energy_level: z.enum(["low", "medium", "high"]).optional().describe("Filter by energy level"),
        limit: z.number().int().min(1).max(100).default(50).describe("Max results"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      const userId = getUserId();
      const tz = await getUserTimezone(userId);
      const conditions: string[] = ["user_id = $1", "deleted_at IS NULL"];
      const values: unknown[] = [userId];
      let paramIdx = 2;

      if (params.status) {
        conditions.push(`status = $${paramIdx}`);
        values.push(params.status);
        paramIdx++;
      } else {
        conditions.push(`status IN ('pending', 'in_progress')`);
      }

      if (params.priority) {
        conditions.push(`priority = $${paramIdx}`);
        values.push(params.priority);
        paramIdx++;
      }
      if (params.category) {
        conditions.push(`category = $${paramIdx}`);
        values.push(params.category);
        paramIdx++;
      }
      if (params.energy_level) {
        conditions.push(`energy_level = $${paramIdx}`);
        values.push(params.energy_level);
        paramIdx++;
      }

      const query = `SELECT tasks.*, ${SESSION_SUMMARY_COLUMNS} FROM tasks WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${paramIdx}`;
      values.push(params.limit);

      const rows = await sql(query, values);

      if (rows.length === 0) {
        return { content: [{ type: "text" as const, text: "No tasks found matching those filters." }] };
      }

      const text = `## Tasks (${rows.length} found)\n\n` +
        rows.map((r, i) => `### ${i + 1}. ${formatTask(r, tz)}`).join("\n\n---\n\n");
      return { content: [{ type: "text" as const, text }] };
    }
  );

  // ----------------------------------------------------------
  // 2. cc_create_task
  // ----------------------------------------------------------
  server.registerTool(
    "cc_create_task",
    {
      title: "Create Task",
      description: `Create a new task in ControlledChaos.

Args:
  - title (required): Task title.
  - description: Optional longer description.
  - priority: urgent, important, normal (default), or someday.
  - energy_level: low, medium (default), or high.
  - estimated_minutes: Estimated time in minutes.
  - category: school, work, personal, errands, or health.
  - deadline: HARD wall, imposed from outside (an instructor, an employer, Canvas). ISO 8601 UTC.
  - target_date: SOFT target the user set for THEMSELVES, usually to leave buffer. ISO 8601 UTC.
  - scheduled_for: When the user plans to START working on it. A "when", not a "by when". ISO 8601 UTC.
  - location_tags: Array of location tags like ["home", "campus"].

## deadline vs target_date — pick deliberately

These are independent: either, both, or neither may be set. Never derive one from the other.

- Use **deadline** ONLY when something outside the user imposes the date and missing it has real external consequences.
- Use **target_date** when the user chose the date for themselves ("I want this done by Wednesday even though it's due Friday"). Missing it has NO external consequence and it is theirs to move.
- If the user says a date is self-imposed, believe them and use target_date.
- If you are unsure which one a date is, ASK. Filing a self-imposed date as a deadline manufactures urgency the user never agreed to — that is the exact failure this field exists to prevent.

**scheduled_for** is a third, independent thing: the block of time the user intends to sit down and work. Use it when planning a schedule ("work on this Tuesday at 2"). It is never a due date, and setting it does not imply anything is due.

All datetimes must be in UTC. Convert the user's local time to UTC before calling.

Returns: The created task with its ID.`,
      inputSchema: {
        title: z.string().min(1).max(500).describe("Task title"),
        description: z.string().max(2000).optional().describe("Task description"),
        priority: z.enum(["urgent", "important", "normal", "someday"]).default("normal").describe("Priority level"),
        energy_level: z.enum(["low", "medium", "high"]).default("medium").describe("Energy required"),
        estimated_minutes: z.number().int().min(1).max(480).optional().describe("Estimated minutes"),
        category: z.enum(["school", "work", "personal", "errands", "health"]).optional().describe("Category"),
        deadline: z.string().optional().describe("HARD deadline imposed from outside, as an ISO 8601 UTC string (e.g. 2026-04-11T18:00:00Z). Not for self-imposed dates."),
        target_date: z.string().optional().describe("SOFT self-imposed target, as an ISO 8601 UTC string. Missing it has no external consequence."),
        scheduled_for: z.string().optional().describe("When the user plans to START working, as an ISO 8601 UTC string. A planned start, never a due date."),
        location_tags: z.array(z.string()).optional().describe("Location tags"),
        goal_id: z.string().uuid().optional().describe("Goal this task works toward (from cc_list_goals)"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      const userId = getUserId();
      const tz = await getUserTimezone(userId);
      if (params.goal_id) {
        const goalError = await checkGoal(userId, params.goal_id);
        if (goalError) return { content: [{ type: "text" as const, text: goalError }] };
      }
      const rows = await sql(
        `INSERT INTO tasks (user_id, title, description, priority, energy_level, estimated_minutes, category, deadline, target_date, scheduled_for, location_tags, goal_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          userId,
          params.title,
          params.description ?? null,
          params.priority,
          params.energy_level,
          params.estimated_minutes ?? null,
          params.category ?? null,
          params.deadline ? new Date(params.deadline).toISOString() : null,
          params.target_date ? new Date(params.target_date).toISOString() : null,
          params.scheduled_for ? new Date(params.scheduled_for).toISOString() : null,
          params.location_tags?.length ? JSON.stringify(params.location_tags) : null,
          params.goal_id ?? null,
        ]
      );

      // Planned work lives in task_sessions; tasks.scheduled_for is a derived
      // mirror of the earliest one. Write both — the app reconciles a bare
      // scheduled_for at read time, but leaving the session missing means this
      // plan would vanish the next time the app recomputes the mirror.
      if (params.scheduled_for) {
        await syncPlannedSession(userId, String(rows[0].id), new Date(params.scheduled_for));
      }

      return {
        content: [{ type: "text" as const, text: `✅ Task created!\n\n${formatTask(rows[0], tz)}` }],
      };
    }
  );

  // ----------------------------------------------------------
  // 3. cc_update_task
  // ----------------------------------------------------------
  server.registerTool(
    "cc_update_task",
    {
      title: "Update Task",
      description: `Update an existing task. Pass only the fields you want to change.

Args:
  - task_id (required): UUID of the task to update.
  - title, description, status, priority, energy_level, estimated_minutes, category, deadline, target_date, scheduled_for, location_tags, goal_id: Fields to update.

## The three times a task can carry

They mean different things and are never interchangeable:

- **deadline** — a HARD wall imposed by the outside world. Missing it has real consequences; neither you nor the user can move it.
- **target_date** — a SOFT target the user set for THEMSELVES. Missing it has no external consequence and moving it is a legitimate choice, not a failure.
- **scheduled_for** — when the user planned to START working. It is not a due date of any kind.

Never describe a target_date as "due", and never apply deadline urgency to one. Moving a user's self-imposed target is a normal edit; moving a deadline usually means the user is telling you the stored data is wrong.

To CLEAR any of the three, pass null (not an empty string, not a zero date). Clearing scheduled_for takes the task off the calendar without touching when it is due. Clearing deadline says nothing external is driving the task any more. Omit a field entirely to leave it alone.

All datetimes must be in UTC. Convert the user's local time to UTC before calling.

Returns: The updated task.`,
      inputSchema: {
        task_id: z.string().uuid().describe("Task ID to update"),
        title: z.string().min(1).max(500).optional().describe("New title"),
        description: z.string().max(2000).optional().describe("New description"),
        status: z.enum(["pending", "in_progress", "completed", "snoozed", "cancelled"]).optional().describe("New status"),
        priority: z.enum(["urgent", "important", "normal", "someday"]).optional().describe("New priority"),
        energy_level: z.enum(["low", "medium", "high"]).optional().describe("New energy level"),
        estimated_minutes: z.number().int().min(1).max(480).optional().describe("New estimate"),
        category: z.enum(["school", "work", "personal", "errands", "health"]).optional().describe("New category"),
        deadline: z.string().nullable().optional().describe("New HARD deadline, imposed from outside (ISO 8601 UTC). Pass null to clear it."),
        target_date: z.string().nullable().optional().describe("New SOFT self-imposed target (ISO 8601 UTC). Pass null to clear it."),
        scheduled_for: z.string().nullable().optional().describe("When the user plans to START — not a due date (ISO 8601 UTC). Pass null to take the task off the schedule."),
        location_tags: z.array(z.string()).optional().describe("New location tags"),
        goal_id: z.string().uuid().nullable().optional().describe("Goal this task works toward. Pass null to unlink it from its goal."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      const userId = getUserId();
      const tz = await getUserTimezone(userId);
      if (params.goal_id) {
        const goalError = await checkGoal(userId, params.goal_id);
        if (goalError) return { content: [{ type: "text" as const, text: goalError }] };
      }
      const setClauses: string[] = ["updated_at = NOW()"];
      const values: unknown[] = [];
      let idx = 1;

      const fields: Array<[string, string, unknown]> = [
        ["title", "title", params.title],
        ["description", "description", params.description],
        ["status", "status", params.status],
        ["priority", "priority", params.priority],
        ["energy_level", "energy_level", params.energy_level],
        ["estimated_minutes", "estimated_minutes", params.estimated_minutes],
        ["category", "category", params.category],
        // timeField distinguishes "not provided" (skip) from an explicit null
        // (write SQL NULL). The old `x ? ... : undefined` collapsed both, so a
        // time could be set but never unset.
        ["deadline", "deadline", timeField(params.deadline)],
        ["target_date", "target_date", timeField(params.target_date)],
        ["scheduled_for", "scheduled_for", timeField(params.scheduled_for)],
        ["location_tags", "location_tags", params.location_tags ? JSON.stringify(params.location_tags) : undefined],
        ["goal_id", "goal_id", params.goal_id],
      ];

      for (const [, col, val] of fields) {
        if (val !== undefined) {
          setClauses.push(`${col} = $${idx}`);
          values.push(val);
          idx++;
        }
      }

      // Mirror the app: completed stamps completed_at, any other status clears it.
      if (params.status === "completed") {
        setClauses.push(COMPLETED_AT_ON_COMPLETE);
      } else if (params.status !== undefined) {
        setClauses.push(`completed_at = NULL`);
      }

      if (setClauses.length === 1) {
        return { content: [{ type: "text" as const, text: "No fields to update. Pass at least one field to change." }] };
      }

      values.push(params.task_id, userId);
      // The FROM subquery reads the row before the update, so we know whether
      // this call is what completed the task.
      const query = `UPDATE tasks SET ${setClauses.join(", ")}
        FROM (SELECT id AS prev_id, status AS prev_status FROM tasks
              WHERE id = $${idx} AND user_id = $${idx + 1} AND deleted_at IS NULL) prev
        WHERE tasks.id = prev.prev_id
        RETURNING tasks.*, prev.prev_status`;
      const rows = await sql(query, values);

      if (rows.length === 0) {
        return { content: [{ type: "text" as const, text: `Task \`${params.task_id}\` not found.` }] };
      }

      if (params.status === "completed" && rows[0].prev_status !== "completed") {
        await logTaskCompleted(userId, params.task_id);
      }

      // Keep task_sessions in step with the column we just wrote. Passing null
      // clears the plan; passing a time replaces it with a single sitting.
      if (params.scheduled_for !== undefined) {
        await syncPlannedSession(
          userId,
          params.task_id,
          params.scheduled_for ? new Date(params.scheduled_for) : null
        );
      }

      return { content: [{ type: "text" as const, text: `✅ Task updated!\n\n${formatTask(rows[0], tz)}` }] };
    }
  );

  // ----------------------------------------------------------
  // 4. cc_complete_task
  // ----------------------------------------------------------
  server.registerTool(
    "cc_complete_task",
    {
      title: "Complete Task",
      description: `Mark a task as completed. Shortcut for updating status to 'completed' with a timestamp.

Args:
  - task_id (required): UUID of the task to complete.

Returns: The completed task.`,
      inputSchema: {
        task_id: z.string().uuid().describe("Task ID to complete"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      const userId = getUserId();
      const tz = await getUserTimezone(userId);
      const rows = await sql(
        `UPDATE tasks SET status = 'completed', ${COMPLETED_AT_ON_COMPLETE}, updated_at = NOW()
         FROM (SELECT id AS prev_id, status AS prev_status FROM tasks
               WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL) prev
         WHERE tasks.id = prev.prev_id
         RETURNING tasks.*, prev.prev_status`,
        [params.task_id, userId]
      );

      if (rows.length === 0) {
        return { content: [{ type: "text" as const, text: `Task \`${params.task_id}\` not found.` }] };
      }

      if (rows[0].prev_status !== "completed") {
        await logTaskCompleted(userId, params.task_id);
      }

      return { content: [{ type: "text" as const, text: `🎉 Task completed!\n\n${formatTask(rows[0], tz)}` }] };
    }
  );

  // ----------------------------------------------------------
  // 5. cc_delete_task
  // ----------------------------------------------------------
  server.registerTool(
    "cc_delete_task",
    {
      title: "Delete Task",
      description: `Delete a task. It's a soft delete: the task leaves every list and view, but the row and its activity history are kept.

Args:
  - task_id (required): UUID of the task to delete.

Returns: Confirmation of deletion.`,
      inputSchema: {
        task_id: z.string().uuid().describe("Task ID to delete"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      const userId = getUserId();
      // Soft delete — set deletedAt instead of removing the row
      const rows = await sql(
        `UPDATE tasks SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING title`,
        [params.task_id, userId]
      );

      if (rows.length === 0) {
        return { content: [{ type: "text" as const, text: `Task \`${params.task_id}\` not found.` }] };
      }

      return { content: [{ type: "text" as const, text: `🗑️ Deleted task: "${rows[0].title}"` }] };
    }
  );

  // ----------------------------------------------------------
  // 6. cc_brain_dump
  // ----------------------------------------------------------
  server.registerTool(
    "cc_brain_dump",
    {
      title: "Brain Dump",
      description: `Store a raw brain dump entry in the user's dump history.

The text is saved as-is. The app does NOT parse it later — nothing turns a stored dump into tasks or events. If the dump contains things the user wants to do, create them directly with cc_create_task / cc_create_event.

Args:
  - content (required): Raw text of the brain dump.
  - category: "braindump" (default) or "junk_journal". Junk journal entries are raw material for essays/literary analysis, kept separate from dev/life brain dumps.

Returns: Confirmation with the dump ID.`,
      inputSchema: {
        content: z.string().min(1).max(10000).describe("Raw brain dump text"),
        category: z.enum(["braindump", "junk_journal"]).default("braindump").describe("Category: braindump (default) or junk_journal"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      const userId = getUserId();
      const cat = params.category ?? "braindump";
      const rows = await sql(
        `INSERT INTO brain_dumps (user_id, input_type, raw_content, category)
         VALUES ($1, 'text', $2, $3)
         RETURNING id, created_at, category`,
        [userId, params.content, cat]
      );

      const label = rows[0].category === "junk_journal" ? "Junk journal entry" : "Brain dump";
      return {
        content: [{
          type: "text" as const,
          text: `🧠 ${label} saved!\nID: \`${rows[0].id}\`\nCategory: ${rows[0].category}\nCreated: ${rows[0].created_at}`,
        }],
      };
    }
  );

  // ----------------------------------------------------------
  // 7. cc_list_calendar
  // ----------------------------------------------------------
  server.registerTool(
    "cc_list_calendar",
    {
      title: "List Calendar Events",
      description: `List calendar events from ControlledChaos within a date range.

Also returns PLANNED WORK BLOCKS — tasks whose scheduled_for falls in the range. Those are intentions, not commitments: the user meant to start that task then. They still occupy real time, so read them before planning anything new or you will double-book the user against their own plan.

Args:
  - start_date (required): Start of range (ISO 8601 in UTC, e.g. "2026-03-21T04:00:00Z" for midnight ET).
  - end_date (required): End of range (ISO 8601 in UTC).
  - source: Filter by source (canvas, google, controlledchaos). Also excludes planned work blocks, which have no source.
  - category: Filter by category (school, work, personal, errands, health). Applies to both events and planned blocks.
  - include_planned: Set false to get calendar events only. Defaults to true.

All datetimes must be in UTC. Convert the user's local time to UTC before calling.

Returns: Markdown list of events, then a Planned Work section, with times in the user's timezone.`,
      inputSchema: {
        start_date: z.string().describe("Start date (ISO 8601 UTC, e.g. 2026-03-21T04:00:00Z)"),
        end_date: z.string().describe("End date (ISO 8601 UTC)"),
        source: z.enum(["canvas", "google", "controlledchaos"]).optional().describe("Filter by event source"),
        category: z.enum(["school", "work", "personal", "errands", "health"]).optional().describe("Filter by category"),
        // Some MCP clients serialize booleans as strings; a strict z.boolean()
        // rejects "false" outright. Note z.coerce.boolean() is NOT usable here
        // — it treats the non-empty string "false" as true.
        include_planned: z
          .union([z.boolean(), z.enum(["true", "false"])])
          .transform((v) => (typeof v === "boolean" ? v : v === "true"))
          .optional()
          .describe("Include planned work blocks (tasks with a scheduled_for in range). Default true."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      const userId = getUserId();
      const tz = await getUserTimezone(userId);

      // Same as the app's getCalendarEventsByDateRange: half-open [start, end),
      // so tomorrow's all-day event (stored at exactly midnight) doesn't leak
      // into today, and legacy cc- plan rows (duplicates of plan blocks) are
      // left out.
      const conditions: string[] = [
        "user_id = $1",
        "start_time < $3",
        "end_time > $2",
        "(external_id IS NULL OR external_id NOT LIKE 'cc-%')",
      ];
      const values: unknown[] = [userId, new Date(params.start_date).toISOString(), new Date(params.end_date).toISOString()];
      let paramIdx = 4;

      if (params.source) {
        conditions.push(`source = $${paramIdx}`);
        values.push(params.source);
        paramIdx++;
      }
      if (params.category) {
        conditions.push(`category = $${paramIdx}`);
        values.push(params.category);
        paramIdx++;
      }

      const query = `SELECT * FROM calendar_events WHERE ${conditions.join(" AND ")} ORDER BY start_time`;
      const rows = await sql(query, values);

      // Planned work blocks. A scheduling model that can write scheduled_for
      // but can't read it back will happily plan two things into one slot —
      // which is exactly the overlap users end up staring at.
      let planned: Record<string, unknown>[] = [];
      if (params.include_planned !== false && !params.source) {
        const planValues: unknown[] = [
          userId,
          new Date(params.start_date).toISOString(),
          new Date(params.end_date).toISOString(),
        ];
        let planCategory = "";
        if (params.category) {
          planValues.push(params.category);
          planCategory = ` AND category = $4`;
        }
        // Reads task_sessions, so a task planned across several sittings shows
        // up at each one. Reading tasks.scheduled_for (the derived mirror of
        // the EARLIEST sitting) would report a two-block plan as one block and
        // leave the later slot looking free.
        //
        // The UNION picks up plans written straight to scheduled_for with no
        // session behind them, which is what an older build of this server
        // left behind.
        planned = await sql(
          `SELECT t.id, t.title, s.starts_at AS scheduled_for,
                  -- Mirrors resolveSessionMinutes in the app: a logged sitting
                  -- shows what was done; an explicit length wins; otherwise a
                  -- NULL sitting takes an even share of (estimate − logged −
                  -- explicit open lengths), so two sittings of 120 are 60 each.
                  -- Needs migration 0017 (task_sessions.status/actual_minutes).
                  CASE
                    WHEN s.status IS NOT NULL AND s.status <> 'skipped' AND COALESCE(s.actual_minutes, 0) > 0 THEN s.actual_minutes
                    WHEN s.minutes IS NOT NULL THEN s.minutes
                    WHEN t.estimated_minutes IS NULL THEN NULL
                    ELSE GREATEST(15, ROUND(
                      (t.estimated_minutes
                        - COALESCE((SELECT SUM(x.actual_minutes) FROM task_sessions x WHERE x.task_id = s.task_id AND x.status IS NOT NULL), 0)
                        - COALESCE((SELECT SUM(x.minutes) FROM task_sessions x WHERE x.task_id = s.task_id AND x.status IS NULL), 0))::numeric
                      / NULLIF((SELECT COUNT(*) FROM task_sessions x WHERE x.task_id = s.task_id AND x.status IS NULL AND x.minutes IS NULL), 0)
                    ))::int
                  END AS estimated_minutes,
                  t.status, t.category, t.deadline, t.target_date
           FROM task_sessions s
           JOIN tasks t ON t.id = s.task_id
           WHERE s.user_id = $1
             AND t.deleted_at IS NULL
             AND t.status IN ('pending', 'in_progress', 'snoozed')
             AND s.starts_at >= $2
             AND s.starts_at < $3${planCategory.replace("category", "t.category")}
           UNION ALL
           SELECT t.id, t.title, t.scheduled_for,
                  t.estimated_minutes, t.status, t.category, t.deadline, t.target_date
           FROM tasks t
           WHERE t.user_id = $1
             AND t.deleted_at IS NULL
             AND t.status IN ('pending', 'in_progress', 'snoozed')
             AND t.scheduled_for IS NOT NULL
             AND t.scheduled_for >= $2
             AND t.scheduled_for < $3${planCategory.replace("category", "t.category")}
             AND NOT EXISTS (
               SELECT 1 FROM task_sessions s2
               WHERE s2.task_id = t.id AND s2.starts_at = t.scheduled_for
             )
           ORDER BY scheduled_for`,
          planValues
        );
      }

      if (rows.length === 0 && planned.length === 0) {
        return { content: [{ type: "text" as const, text: "No calendar events or planned work in that range." }] };
      }

      const sections: string[] = [];

      if (rows.length > 0) {
        sections.push(
          `## Calendar Events (${rows.length} found)\n\n` +
            rows.map((r, i) => `### ${i + 1}. ${formatEvent(r, tz)}`).join("\n\n---\n\n")
        );
      }

      if (planned.length > 0) {
        sections.push(
          `## Planned Work (${planned.length} found)\n` +
            `_Task blocks the user planned to start. Intentions, not commitments — but they occupy the time._\n\n` +
            planned
              .map((t) => {
                const mins = (t.estimated_minutes as number | null) ?? null;
                const bits = [
                  `- **${t.title}** — ${fmtLocal(t.scheduled_for, tz)}`,
                  mins ? ` (${mins} min)` : "",
                  `\n  Task ID: \`${t.id}\` · status: ${t.status}`,
                  t.deadline ? `\n  Deadline (HARD): ${fmtLocal(t.deadline, tz)}` : "",
                  t.target_date ? `\n  Target (SOFT): ${fmtLocal(t.target_date, tz)}` : "",
                ];
                return bits.join("");
              })
              .join("\n\n")
        );
      }

      return { content: [{ type: "text" as const, text: sections.join("\n\n") }] };
    }
  );

  // ----------------------------------------------------------
  // 8. cc_create_event
  // ----------------------------------------------------------
  server.registerTool(
    "cc_create_event",
    {
      title: "Create Calendar Event",
      description: `Create a new calendar event in ControlledChaos, optionally recurring.

Args:
  - title (required): Event title.
  - start_time (required): Start datetime of the first instance (ISO 8601 in UTC).
  - end_time (required): End datetime of the first instance (ISO 8601 in UTC).
  - description: Optional description.
  - location: Optional location string.
  - category: school, work, personal, errands, or health.
  - is_all_day: Whether it's an all-day event (default false). All-day events are stored from local midnight to the
    local midnight after the last day; a bare date ("2026-09-30") or that date at UTC midnight is read as that date.
  - recurrence: Optional. Makes this a recurring series instead of a single event:
      - type (required): "daily" or "weekly".
      - days_of_week: For weekly recurrence, which days (0=Sun...6=Sat). Defaults to start_time's day.
      - end_date: Last possible date for the series (ISO 8601). Defaults to 16 weeks out if omitted.
      - exceptions: Individual dates to skip (ISO 8601 or YYYY-MM-DD), e.g. holidays. List each date separately —
        a multi-day break (e.g. a week off) must be listed as one date per day, not a range.
    Instances are capped at 200 per series and stored as individual events sharing a series_id.
    Use cc_update_event / cc_delete_event with scope: "all" to edit or remove the whole series later.

All datetimes must be in UTC. Convert the user's local time to UTC before calling.

Returns: The created event (or a summary if recurring).`,
      inputSchema: {
        title: z.string().min(1).max(500).describe("Event title"),
        start_time: z.string().describe("Start datetime of the first instance (ISO 8601 UTC)"),
        end_time: z.string().describe("End datetime of the first instance (ISO 8601 UTC)"),
        description: z.string().max(2000).optional().describe("Event description"),
        location: z.string().max(500).optional().describe("Event location"),
        category: z.enum(["school", "work", "personal", "errands", "health"]).optional().describe("Category"),
        is_all_day: z.boolean().default(false).describe("All-day event?"),
        recurrence: z
          .object({
            type: z.enum(["daily", "weekly"]).describe("Recurrence frequency"),
            days_of_week: z
              .array(z.number().int().min(0).max(6))
              .optional()
              .describe("For weekly recurrence: days of week (0=Sun...6=Sat). Defaults to start_time's day."),
            end_date: z.string().optional().describe("Last possible date for the series (ISO 8601). Defaults to 16 weeks out."),
            exceptions: z.array(z.string()).optional().describe("Individual dates to skip (ISO 8601 or YYYY-MM-DD), one per day — not a range."),
          })
          .optional()
          .describe("Make this a recurring event. Omit for a single event."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      const userId = getUserId();
      const tz = await getUserTimezone(userId);

      // All-day events use the app's local-midnight convention, whatever
      // instant the caller sent. The expander then keeps that wall-clock time
      // across DST for a series.
      const bounds = params.is_all_day
        ? allDayBounds(params.start_time, params.end_time, tz)
        : null;
      const instances = expandRecurrence({
        title: params.title,
        description: params.description ?? null,
        location: params.location ?? null,
        startTime: bounds ? bounds.start.toISOString() : params.start_time,
        endTime: bounds ? bounds.end.toISOString() : params.end_time,
        isAllDay: params.is_all_day,
        recurrence: params.recurrence
          ? {
              type: params.recurrence.type,
              daysOfWeek: params.recurrence.days_of_week,
              endDate: params.recurrence.end_date,
              exceptions: params.recurrence.exceptions,
              timeZone: tz,
            }
          : undefined,
      });

      const seriesId = instances.length > 1 ? crypto.randomUUID() : null;
      const created: Record<string, unknown>[] = [];

      for (const inst of instances) {
        const externalId = `mcp-${crypto.randomUUID()}`;
        const rows = await sql(
          `INSERT INTO calendar_events (user_id, source, external_id, title, description, start_time, end_time, location, is_all_day, category, series_id, synced_at)
           VALUES ($1, 'controlledchaos', $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
           RETURNING *`,
          [
            userId,
            externalId,
            inst.title,
            inst.description,
            inst.startTime.toISOString(),
            inst.endTime.toISOString(),
            inst.location,
            inst.isAllDay,
            params.category ?? null,
            seriesId,
          ]
        );
        created.push(rows[0]);
      }

      if (created.length === 1) {
        return { content: [{ type: "text" as const, text: `📅 Event created!\n\n${formatEvent(created[0], tz)}` }] };
      }

      const first = created[0];
      const last = created[created.length - 1];
      return {
        content: [{
          type: "text" as const,
          text: `📅 Recurring event created! ${created.length} instances (series \`${seriesId}\`).\n\nFirst: ${formatEvent(first, tz)}\n\n---\n\nLast: ${formatEvent(last, tz)}`,
        }],
      };
    }
  );

  // ----------------------------------------------------------
  // 9. cc_list_goals
  // ----------------------------------------------------------
  server.registerTool(
    "cc_list_goals",
    {
      title: "List Goals",
      description: `List active goals from ControlledChaos.

Returns: Markdown-formatted list of goals with IDs, descriptions, target dates, and progress (completed / total linked tasks).`,
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const userId = getUserId();
      const tz = await getUserTimezone(userId);
      const rows = await sql(
        // Progress is counted live from linked tasks, same as the app
        // (getGoalTaskCounts): deleted and cancelled tasks don't count.
        `SELECT g.*,
           (SELECT COUNT(*)::int FROM tasks t
             WHERE t.goal_id = g.id AND t.user_id = g.user_id AND t.deleted_at IS NULL
               AND t.status <> 'cancelled') AS task_total,
           (SELECT COUNT(*)::int FROM tasks t
             WHERE t.goal_id = g.id AND t.user_id = g.user_id AND t.deleted_at IS NULL
               AND t.status = 'completed') AS task_completed
         FROM goals g
         WHERE g.user_id = $1 AND g.status = 'active' AND g.deleted_at IS NULL
         ORDER BY g.created_at`,
        [userId]
      );

      if (rows.length === 0) {
        return { content: [{ type: "text" as const, text: "No active goals found." }] };
      }

      const text = `## Active Goals (${rows.length})\n\n` +
        rows.map((r, i) => `### ${i + 1}. ${formatGoal(r, tz)}`).join("\n\n---\n\n");
      return { content: [{ type: "text" as const, text }] };
    }
  );

  // ----------------------------------------------------------
  // 10. cc_get_daily_stats
  // ----------------------------------------------------------
  server.registerTool(
    "cc_get_daily_stats",
    {
      title: "Get Daily Stats",
      description: `Get a snapshot of today's productivity stats: tasks completed today, total pending, overdue count, and upcoming events.

Returns: Markdown-formatted daily stats summary.`,
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const userId = getUserId();
      const tz = await getUserTimezone(userId);

      const day = await localDayWindow(todayInTz(tz), tz);

      // Completed today
      const completedToday = await sql(
        `SELECT COUNT(*) as count FROM tasks
         WHERE user_id = $1 AND status = 'completed' AND deleted_at IS NULL
         AND completed_at >= $2 AND completed_at < $3`,
        [userId, day.start, day.end]
      );

      // Total pending
      const pending = await sql(
        `SELECT COUNT(*) as count FROM tasks
         WHERE user_id = $1 AND status IN ('pending', 'in_progress') AND deleted_at IS NULL`,
        [userId]
      );

      // Overdue
      const overdue = await sql(
        `SELECT COUNT(*) as count FROM tasks
         WHERE user_id = $1 AND status IN ('pending', 'in_progress') AND deleted_at IS NULL
         AND deadline IS NOT NULL AND deadline < NOW()`,
        [userId]
      );

      // Urgent tasks
      const urgent = await sql(
        `SELECT COUNT(*) as count FROM tasks
         WHERE user_id = $1 AND status IN ('pending', 'in_progress') AND deleted_at IS NULL
         AND priority = 'urgent'`,
        [userId]
      );

      // Today's events
      const todaysEvents = await sql(
        `SELECT title, start_time, end_time FROM calendar_events
         WHERE user_id = $1
         AND start_time >= $2
         AND start_time < $3
         ORDER BY start_time`,
        [userId, day.start, day.end]
      );

      const eventsText = todaysEvents.length > 0
        ? todaysEvents.map(e => {
            const start = fmtTimeLocal(e.start_time, tz);
            const end = fmtTimeLocal(e.end_time, tz);
            return `  - ${e.title} (${start} – ${end})`;
          }).join("\n")
        : "  No events today";

      const text = `## 📊 Daily Stats

**Tasks Completed Today:** ${completedToday[0].count}
**Pending Tasks:** ${pending[0].count}
**Overdue:** ${overdue[0].count}
**Urgent:** ${urgent[0].count}

### Today's Events
${eventsText}`;

      return { content: [{ type: "text" as const, text }] };
    }
  );

  // ----------------------------------------------------------
  // 11. cc_create_goal
  // ----------------------------------------------------------
  server.registerTool(
    "cc_create_goal",
    {
      title: "Create Goal",
      description: `Create a new goal in ControlledChaos.

Args:
  - title (required): Goal title.
  - description: Optional longer description.
  - target_date: Target completion date (ISO 8601 UTC).

All datetimes must be in UTC. Convert the user's local time to UTC before calling.

Returns: The created goal with its ID.`,
      inputSchema: {
        title: z.string().min(1).max(500).describe("Goal title"),
        description: z.string().max(2000).optional().describe("Goal description"),
        target_date: z.string().optional().describe("Target date (ISO 8601 UTC)"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      const userId = getUserId();
      const tz = await getUserTimezone(userId);
      const rows = await sql(
        `INSERT INTO goals (user_id, title, description, target_date)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [
          userId,
          params.title,
          params.description ?? null,
          params.target_date ? new Date(params.target_date).toISOString() : null,
        ]
      );

      return { content: [{ type: "text" as const, text: `🎯 Goal created!\n\n${formatGoal(rows[0], tz)}` }] };
    }
  );

  // ----------------------------------------------------------
  // 12. cc_update_goal
  // ----------------------------------------------------------
  server.registerTool(
    "cc_update_goal",
    {
      title: "Update Goal",
      description: `Update an existing goal. Pass only the fields you want to change.

Args:
  - goal_id (required): UUID of the goal to update.
  - title: New title.
  - description: New description.
  - target_date: New target date (ISO 8601 UTC). Pass null to clear it.
  - status: New status (active, completed, paused).

All datetimes must be in UTC. Convert the user's local time to UTC before calling.

Returns: The updated goal.`,
      inputSchema: {
        goal_id: z.string().uuid().describe("Goal ID to update"),
        title: z.string().min(1).max(500).optional().describe("New title"),
        description: z.string().max(2000).optional().describe("New description"),
        target_date: z.string().nullable().optional().describe("New target date (ISO 8601 UTC). Pass null to clear it."),
        status: z.enum(["active", "completed", "paused"]).optional().describe("New status"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      const userId = getUserId();
      const tz = await getUserTimezone(userId);
      const setClauses: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      const fields: Array<[string, unknown]> = [
        ["title", params.title],
        ["description", params.description],
        ["target_date", timeField(params.target_date)],
        ["status", params.status],
      ];

      for (const [col, val] of fields) {
        if (val !== undefined) {
          setClauses.push(`${col} = $${idx}`);
          values.push(val);
          idx++;
        }
      }

      if (setClauses.length === 0) {
        return { content: [{ type: "text" as const, text: "No fields to update. Pass at least one field to change." }] };
      }

      values.push(params.goal_id, userId);
      const query = `UPDATE goals SET ${setClauses.join(", ")} WHERE id = $${idx} AND user_id = $${idx + 1} AND deleted_at IS NULL RETURNING *`;
      const rows = await sql(query, values);

      if (rows.length === 0) {
        return { content: [{ type: "text" as const, text: `Goal \`${params.goal_id}\` not found.` }] };
      }

      return { content: [{ type: "text" as const, text: `✅ Goal updated!\n\n${formatGoal(rows[0], tz)}` }] };
    }
  );

  // ----------------------------------------------------------
  // 13. cc_delete_goal
  // ----------------------------------------------------------
  server.registerTool(
    "cc_delete_goal",
    {
      title: "Delete Goal",
      description: `Delete a goal. Tasks linked to this goal will have their goal_id set to null (they won't be deleted). Like the app, this is a soft delete: the goal disappears everywhere but the row is kept.

Args:
  - goal_id (required): UUID of the goal to delete.

Returns: Confirmation of deletion.`,
      inputSchema: {
        goal_id: z.string().uuid().describe("Goal ID to delete"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      const userId = getUserId();
      // Unlink tasks from this goal first
      await sql(`UPDATE tasks SET goal_id = NULL WHERE goal_id = $1 AND user_id = $2`, [params.goal_id, userId]);
      // Soft delete, matching the app's deleteGoal
      const rows = await sql(
        `UPDATE goals SET deleted_at = NOW() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING title`,
        [params.goal_id, userId]
      );

      if (rows.length === 0) {
        return { content: [{ type: "text" as const, text: `Goal \`${params.goal_id}\` not found.` }] };
      }

      return { content: [{ type: "text" as const, text: `🗑️ Deleted goal: "${rows[0].title}"` }] };
    }
  );

  // ----------------------------------------------------------
  // 14. cc_update_event
  // ----------------------------------------------------------
  server.registerTool(
    "cc_update_event",
    {
      title: "Update Calendar Event",
      description: `Update an existing calendar event. Pass only the fields you want to change. Only ControlledChaos-created events can be updated.

Args:
  - event_id (required): UUID of the event to update.
  - title, description, start_time, end_time, location, category, is_all_day: Fields to update.
  - badge: Short label shown ON this occurrence's calendar tile, e.g. "📝 Quiz" (max 24 chars; "" clears it).
    Always applies to THIS event only, even with scope "all" — use it to mark one class meeting ("quiz today")
    without touching the rest of the series.
  - scope: "this" (default) updates only this event. "all" updates every event in its series (if it belongs to one) —
    title/description/location/is_all_day are applied to every instance; start_time/end_time only change the time-of-day,
    each instance keeps its own date.

All datetimes must be in UTC. Convert the user's local time to UTC before calling.

Returns: The updated event, or a summary if scope is "all".`,
      inputSchema: {
        event_id: z.string().uuid().describe("Event ID to update"),
        title: z.string().min(1).max(500).optional().describe("New title"),
        description: z.string().max(2000).optional().describe("New description"),
        start_time: z.string().optional().describe("New start datetime (ISO 8601 UTC)"),
        end_time: z.string().optional().describe("New end datetime (ISO 8601 UTC)"),
        location: z.string().max(500).optional().describe("New location"),
        category: z.enum(["school", "work", "personal", "errands", "health"]).optional().describe("New category"),
        is_all_day: z.boolean().optional().describe("All-day event?"),
        badge: z.string().max(24).optional().describe('Occurrence-only tile label like "📝 Quiz". "" clears it. Never applied to the whole series.'),
        scope: z.enum(["this", "all"]).default("this").describe("Update just this event, or every instance in its series"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      const userId = getUserId();
      const tz = await getUserTimezone(userId);

      const existingRows = await sql(
        `SELECT * FROM calendar_events WHERE id = $1 AND user_id = $2 AND source = 'controlledchaos' LIMIT 1`,
        [params.event_id, userId]
      );
      if (existingRows.length === 0) {
        return { content: [{ type: "text" as const, text: `Event \`${params.event_id}\` not found, or it's a synced event (only ControlledChaos-created events can be updated).` }] };
      }
      const seriesId = existingRows[0].series_id as string | null;
      const badge =
        params.badge === undefined ? undefined : params.badge.trim() === "" ? null : params.badge.trim();

      // The badge belongs to this occurrence alone, so a series-wide edit
      // writes it here, separately, and never to the other instances.
      if (params.scope === "all" && seriesId && badge !== undefined) {
        await sql(
          `UPDATE calendar_events SET badge = $1, synced_at = NOW() WHERE id = $2 AND user_id = $3 AND source = 'controlledchaos'`,
          [badge, params.event_id, userId]
        );
      }

      if (params.scope !== "all" || !seriesId) {
        const setClauses: string[] = ["synced_at = NOW()"];
        const values: unknown[] = [];
        let idx = 1;

        // Resolve the new times. A start with no end keeps the event's length.
        // Becoming (or staying) all-day snaps to local midnights — flipping
        // the flag alone used to leave a 2pm–3pm "all-day" event.
        const ex = existingRows[0];
        const exStart = new Date(ex.start_time as string);
        const exEnd = new Date(ex.end_time as string);
        const willBeAllDay = params.is_all_day ?? Boolean(ex.is_all_day);
        let newStartAt: Date | undefined;
        let newEndAt: Date | undefined;
        if (willBeAllDay && (params.is_all_day === true || params.start_time || params.end_time)) {
          const b = allDayBounds(
            params.start_time ?? exStart,
            params.end_time ?? (params.start_time ? null : exEnd),
            tz
          );
          newStartAt = b.start;
          newEndAt = b.end;
        } else if (params.start_time) {
          newStartAt = new Date(params.start_time);
          newEndAt = params.end_time
            ? new Date(params.end_time)
            : new Date(newStartAt.getTime() + (exEnd.getTime() - exStart.getTime()));
        } else if (params.end_time) {
          newEndAt = new Date(params.end_time);
        }

        const fields: Array<[string, unknown]> = [
          ["title", params.title],
          ["description", params.description],
          ["start_time", newStartAt?.toISOString()],
          ["end_time", newEndAt?.toISOString()],
          ["location", params.location],
          ["category", params.category],
          ["is_all_day", params.is_all_day],
          ["badge", badge],
        ];

        for (const [col, val] of fields) {
          if (val !== undefined) {
            setClauses.push(`${col} = $${idx}`);
            values.push(val);
            idx++;
          }
        }

        if (setClauses.length === 1) {
          return { content: [{ type: "text" as const, text: "No fields to update. Pass at least one field to change." }] };
        }

        values.push(params.event_id, userId);
        const query = `UPDATE calendar_events SET ${setClauses.join(", ")} WHERE id = $${idx} AND user_id = $${idx + 1} AND source = 'controlledchaos' RETURNING *`;
        const rows = await sql(query, values);

        return { content: [{ type: "text" as const, text: `✅ Event updated!\n\n${formatEvent(rows[0], tz)}` }] };
      }

      // scope === "all" and event belongs to a series
      const metaClauses: string[] = ["synced_at = NOW()"];
      const metaValues: unknown[] = [];
      let metaIdx = 1;
      const metaFields: Array<[string, unknown]> = [
        ["title", params.title],
        ["description", params.description],
        ["location", params.location],
        ["category", params.category],
        ["is_all_day", params.is_all_day],
      ];
      for (const [col, val] of metaFields) {
        if (val !== undefined) {
          metaClauses.push(`${col} = $${metaIdx}`);
          metaValues.push(val);
          metaIdx++;
        }
      }

      let updatedRows: Record<string, unknown>[] = [];

      if (metaClauses.length > 1) {
        metaValues.push(seriesId, userId);
        const query = `UPDATE calendar_events SET ${metaClauses.join(", ")} WHERE series_id = $${metaIdx} AND user_id = $${metaIdx + 1} AND source = 'controlledchaos' RETURNING *`;
        updatedRows = await sql(query, metaValues);
      }

      // Turning a whole series all-day: snap each instance to its own local
      // day, the way a single-event flip does.
      if (params.is_all_day === true && params.start_time === undefined && params.end_time === undefined) {
        const seriesRows = await sql(
          `SELECT id, start_time FROM calendar_events WHERE series_id = $1 AND user_id = $2 AND source = 'controlledchaos'`,
          [seriesId, userId]
        );
        updatedRows = [];
        for (const row of seriesRows) {
          const b = allDayBounds(new Date(row.start_time as string), null, tz);
          const res = await sql(
            `UPDATE calendar_events SET start_time = $1, end_time = $2, synced_at = NOW() WHERE id = $3 AND user_id = $4 RETURNING *`,
            [b.start.toISOString(), b.end.toISOString(), row.id, userId]
          );
          if (res[0]) updatedRows.push(res[0]);
        }
      }

      if (params.start_time !== undefined || params.end_time !== undefined) {
        const seriesRows = await sql(
          `SELECT * FROM calendar_events WHERE series_id = $1 AND user_id = $2 AND source = 'controlledchaos'`,
          [seriesId, userId]
        );
        const newStart = params.start_time ? new Date(params.start_time) : null;
        const newEnd = params.end_time ? new Date(params.end_time) : null;
        const durationMs = newStart && newEnd ? newEnd.getTime() - newStart.getTime() : null;

        // Keep each instance's own LOCAL date and swap in the new LOCAL time.
        // setHours ran in server UTC, which moved post-DST instances by an hour.
        const withLocalTime = (existing: Date, source: Date): Date => {
          const src = getZonedParts(source, tz);
          const ex = getZonedParts(existing, tz);
          return zonedToUtc(ex.year, ex.month, ex.day, src.hour, src.minute, 0, tz);
        };

        updatedRows = [];
        for (const row of seriesRows) {
          let newRowStart: Date | undefined;
          let newRowEnd: Date | undefined;

          if (newStart) {
            newRowStart = withLocalTime(new Date(row.start_time as string), newStart);
            // A start-only change keeps this row's own length.
            const rowDurationMs =
              durationMs ??
              new Date(row.end_time as string).getTime() - new Date(row.start_time as string).getTime();
            newRowEnd = new Date(newRowStart.getTime() + rowDurationMs);
          } else if (newEnd) {
            newRowEnd = withLocalTime(new Date(row.end_time as string), newEnd);
          }

          const rowClauses: string[] = ["synced_at = NOW()"];
          const rowValues: unknown[] = [];
          let rowIdx = 1;
          if (newRowStart) { rowClauses.push(`start_time = $${rowIdx}`); rowValues.push(newRowStart.toISOString()); rowIdx++; }
          if (newRowEnd) { rowClauses.push(`end_time = $${rowIdx}`); rowValues.push(newRowEnd.toISOString()); rowIdx++; }
          rowValues.push(row.id, userId);

          const rowResult = await sql(
            `UPDATE calendar_events SET ${rowClauses.join(", ")} WHERE id = $${rowIdx} AND user_id = $${rowIdx + 1} RETURNING *`,
            rowValues
          );
          if (rowResult[0]) updatedRows.push(rowResult[0]);
        }
      }

      if (updatedRows.length === 0) {
        return { content: [{ type: "text" as const, text: "No fields to update. Pass at least one field to change." }] };
      }

      return {
        content: [{
          type: "text" as const,
          text: `✅ Updated ${updatedRows.length} events in series \`${seriesId}\`.`,
        }],
      };
    }
  );

  // ----------------------------------------------------------
  // 15. cc_delete_event
  // ----------------------------------------------------------
  server.registerTool(
    "cc_delete_event",
    {
      title: "Delete Calendar Event",
      description: `Permanently delete a calendar event. Only ControlledChaos-created events can be deleted.

Args:
  - event_id (required): UUID of the event to delete.
  - scope: "this" (default) deletes only this event. "all" deletes every event in its series (if it belongs to one).

Returns: Confirmation of deletion.`,
      inputSchema: {
        event_id: z.string().uuid().describe("Event ID to delete"),
        scope: z.enum(["this", "all"]).default("this").describe("Delete just this event, or every instance in its series"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      const userId = getUserId();

      if (params.scope === "all") {
        const existingRows = await sql(
          `SELECT series_id, title FROM calendar_events WHERE id = $1 AND user_id = $2 AND source = 'controlledchaos' LIMIT 1`,
          [params.event_id, userId]
        );
        if (existingRows.length === 0) {
          return { content: [{ type: "text" as const, text: `Event \`${params.event_id}\` not found, or it's a synced event (only ControlledChaos-created events can be deleted).` }] };
        }
        const seriesId = existingRows[0].series_id as string | null;
        if (!seriesId) {
          const rows = await sql(
            `DELETE FROM calendar_events WHERE id = $1 AND user_id = $2 AND source = 'controlledchaos' RETURNING title`,
            [params.event_id, userId]
          );
          return { content: [{ type: "text" as const, text: `🗑️ Deleted event: "${rows[0].title}" (it wasn't part of a series).` }] };
        }
        const rows = await sql(
          `DELETE FROM calendar_events WHERE series_id = $1 AND user_id = $2 AND source = 'controlledchaos' RETURNING title`,
          [seriesId, userId]
        );
        return { content: [{ type: "text" as const, text: `🗑️ Deleted ${rows.length} events from series "${rows[0]?.title ?? ""}".` }] };
      }

      const rows = await sql(
        `DELETE FROM calendar_events WHERE id = $1 AND user_id = $2 AND source = 'controlledchaos' RETURNING title`,
        [params.event_id, userId]
      );

      if (rows.length === 0) {
        return { content: [{ type: "text" as const, text: `Event \`${params.event_id}\` not found, or it's a synced event (only ControlledChaos-created events can be deleted).` }] };
      }

      return { content: [{ type: "text" as const, text: `🗑️ Deleted event: "${rows[0].title}"` }] };
    }
  );

  // ----------------------------------------------------------
  // 16. cc_list_brain_dumps
  // ----------------------------------------------------------
  server.registerTool(
    "cc_list_brain_dumps",
    {
      title: "List Brain Dumps",
      description: `List past brain dump entries from ControlledChaos.

Args:
  - input_type: Filter by type (text, voice, photo).
  - category: Filter by category (braindump, junk_journal). Useful for pulling only junk_journal entries for essay drafting.
  - limit: Max results (1-50, default 20).

Returns: Markdown-formatted list of brain dumps with IDs, type, category, AI summary (when the app made one), and a content preview.`,
      inputSchema: {
        input_type: z.enum(["text", "voice", "photo"]).optional().describe("Filter by input type"),
        category: z.enum(["braindump", "junk_journal"]).optional().describe("Filter by category"),
        limit: z.number().int().min(1).max(50).default(20).describe("Max results"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      const userId = getUserId();
      const tz = await getUserTimezone(userId);
      const conditions: string[] = ["user_id = $1"];
      const values: unknown[] = [userId];
      let paramIdx = 2;

      if (params.input_type) {
        conditions.push(`input_type = $${paramIdx}`);
        values.push(params.input_type);
        paramIdx++;
      }

      if (params.category) {
        conditions.push(`category = $${paramIdx}`);
        values.push(params.category);
        paramIdx++;
      }

      const query = `SELECT * FROM brain_dumps WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${paramIdx}`;
      values.push(params.limit);

      const rows = await sql(query, values);

      if (rows.length === 0) {
        return { content: [{ type: "text" as const, text: "No brain dumps found matching those filters." }] };
      }

      const text = `## Brain Dumps (${rows.length} found)\n\n` +
        rows.map((r, i) => `### ${i + 1}. ${formatBrainDump(r, tz)}`).join("\n\n---\n\n");
      return { content: [{ type: "text" as const, text }] };
    }
  );

  // ----------------------------------------------------------
  // 17. cc_search_tasks
  // ----------------------------------------------------------
  server.registerTool(
    "cc_search_tasks",
    {
      title: "Search Tasks",
      description: `Search tasks by text across titles and descriptions.

Args:
  - query (required): Search text (case-insensitive, matches partial words).
  - status: Optionally filter by status. Default: all statuses.
  - limit: Max results (1-100, default 25).

Returns: Markdown-formatted list of matching tasks.`,
      inputSchema: {
        query: z.string().min(1).max(200).describe("Search text"),
        status: z.enum(["pending", "in_progress", "completed", "snoozed", "cancelled"]).optional().describe("Filter by status"),
        limit: z.number().int().min(1).max(100).default(25).describe("Max results"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      const userId = getUserId();
      const tz = await getUserTimezone(userId);
      const conditions: string[] = ["user_id = $1", "(title ILIKE $2 OR description ILIKE $2)", "deleted_at IS NULL"];
      const values: unknown[] = [userId, `%${params.query}%`];
      let paramIdx = 3;

      if (params.status) {
        conditions.push(`status = $${paramIdx}`);
        values.push(params.status);
        paramIdx++;
      }

      const query = `SELECT tasks.*, ${SESSION_SUMMARY_COLUMNS} FROM tasks WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${paramIdx}`;
      values.push(params.limit);

      const rows = await sql(query, values);

      if (rows.length === 0) {
        return { content: [{ type: "text" as const, text: `No tasks found matching "${params.query}".` }] };
      }

      const text = `## Search Results for "${params.query}" (${rows.length} found)\n\n` +
        rows.map((r, i) => `### ${i + 1}. ${formatTask(r, tz)}`).join("\n\n---\n\n");
      return { content: [{ type: "text" as const, text }] };
    }
  );

  // ----------------------------------------------------------
  // 18. cc_log_moment
  // ----------------------------------------------------------
  server.registerTool(
    "cc_log_moment",
    {
      title: "Log Moment",
      description: `Log a behavioral state moment. Lightweight one-tap entity for ADHD-friendly state tracking — adjacent to brain dumps but structured.

Args:
  - type (required): Moment type — energy_high, energy_low, energy_crash, focus_start, focus_end, tough_moment, sleep_logged.
  - intensity: Optional 1-5 intensity rating.
  - note: Optional one-liner (max 500 chars).
  - occurred_at: Optional ISO 8601 UTC timestamp. Defaults to now (for retro-logging).

Returns: Confirmation with the moment ID.`,
      inputSchema: {
        type: z.enum([
          "energy_high",
          "energy_low",
          "energy_crash",
          "focus_start",
          "focus_end",
          "tough_moment",
          "sleep_logged",
        ]).describe("Moment type"),
        intensity: z.number().int().min(1).max(5).optional().describe("Optional 1-5 intensity"),
        note: z.string().max(500).optional().describe("Optional one-liner note"),
        occurred_at: z.string().refine(isValidTimestamp, "occurred_at must be an ISO 8601 timestamp").optional().describe("Optional ISO 8601 UTC timestamp (defaults to now)"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      const userId = getUserId();
      const tz = await getUserTimezone(userId);
      const occurredAt = params.occurred_at ?? new Date().toISOString();

      const rows = await sql(
        `INSERT INTO moments (user_id, type, intensity, note, occurred_at, source)
         VALUES ($1, $2, $3, $4, $5, 'manual')
         RETURNING id, type, intensity, note, occurred_at, source`,
        [
          userId,
          params.type,
          params.intensity ?? null,
          params.note ?? null,
          occurredAt,
        ]
      );

      return {
        content: [{
          type: "text" as const,
          text: `✓ Moment logged\n\n${formatMoment(rows[0], tz)}`,
        }],
      };
    }
  );

  // ----------------------------------------------------------
  // 19. cc_list_moments
  // ----------------------------------------------------------
  server.registerTool(
    "cc_list_moments",
    {
      title: "List Moments",
      description: `List recent moments, optionally filtered by date range or type.

Args:
  - start_date: ISO 8601 UTC start of range (optional).
  - end_date: ISO 8601 UTC end of range (optional).
  - types: Array of moment types to include (optional — defaults to all).
  - limit: Max results (1-200, default 50).

Returns: Markdown-formatted list of moments with times in the user's timezone.`,
      inputSchema: {
        start_date: z.string().optional().describe("Start of range (ISO 8601 UTC)"),
        end_date: z.string().optional().describe("End of range (ISO 8601 UTC)"),
        types: z.array(z.enum([
          "energy_high",
          "energy_low",
          "energy_crash",
          "focus_start",
          "focus_end",
          "tough_moment",
          "sleep_logged",
        ])).optional().describe("Filter by moment types"),
        limit: z.number().int().min(1).max(200).default(50).describe("Max results"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      const userId = getUserId();
      const tz = await getUserTimezone(userId);

      const conditions: string[] = ["user_id = $1", "deleted_at IS NULL"];
      const values: unknown[] = [userId];
      let paramIdx = 2;

      if (params.start_date) {
        conditions.push(`occurred_at >= $${paramIdx}`);
        values.push(params.start_date);
        paramIdx++;
      }
      if (params.end_date) {
        conditions.push(`occurred_at <= $${paramIdx}`);
        values.push(params.end_date);
        paramIdx++;
      }
      if (params.types && params.types.length > 0) {
        const placeholders = params.types.map(() => {
          const p = `$${paramIdx}`;
          paramIdx++;
          return p;
        });
        conditions.push(`type IN (${placeholders.join(", ")})`);
        values.push(...params.types);
      }

      const query = `SELECT * FROM moments WHERE ${conditions.join(" AND ")} ORDER BY occurred_at DESC LIMIT $${paramIdx}`;
      values.push(params.limit);

      const rows = await sql(query, values);

      if (rows.length === 0) {
        return { content: [{ type: "text" as const, text: "No moments found for those filters." }] };
      }

      const text = `## Moments (${rows.length} found)\n\n` +
        rows.map((r, i) => `### ${i + 1}. ${formatMoment(r, tz)}`).join("\n\n---\n\n");
      return { content: [{ type: "text" as const, text }] };
    }
  );

  // ----------------------------------------------------------
  // 20. cc_update_moment
  // ----------------------------------------------------------
  server.registerTool(
    "cc_update_moment",
    {
      title: "Update Moment",
      description: `Update a moment's intensity, note, or timestamp. Moment type is immutable — delete and re-log if the type was wrong.

Args:
  - id (required): Moment UUID.
  - intensity: Set to null to clear.
  - note: Set to null to clear.
  - occurred_at: ISO 8601 UTC timestamp.

Returns: Updated moment.`,
      inputSchema: {
        id: z.string().uuid().describe("Moment ID"),
        intensity: z.number().int().min(1).max(5).nullable().optional(),
        note: z.string().max(500).nullable().optional(),
        occurred_at: z.string().refine(isValidTimestamp, "occurred_at must be an ISO 8601 timestamp").optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      const userId = getUserId();
      const tz = await getUserTimezone(userId);

      const setParts: string[] = [];
      const values: unknown[] = [];
      let paramIdx = 1;

      if (params.intensity !== undefined) {
        setParts.push(`intensity = $${paramIdx}`);
        values.push(params.intensity);
        paramIdx++;
      }
      if (params.note !== undefined) {
        setParts.push(`note = $${paramIdx}`);
        values.push(params.note);
        paramIdx++;
      }
      if (params.occurred_at !== undefined) {
        setParts.push(`occurred_at = $${paramIdx}`);
        values.push(params.occurred_at);
        paramIdx++;
      }

      if (setParts.length === 0) {
        return { content: [{ type: "text" as const, text: "No fields to update." }] };
      }

      values.push(params.id, userId);
      const query = `UPDATE moments SET ${setParts.join(", ")}
                     WHERE id = $${paramIdx} AND user_id = $${paramIdx + 1} AND deleted_at IS NULL
                     RETURNING id, type, intensity, note, occurred_at, source`;

      const rows = await sql(query, values);

      if (rows.length === 0) {
        return { content: [{ type: "text" as const, text: `Moment ${params.id} not found.` }] };
      }

      return {
        content: [{
          type: "text" as const,
          text: `✓ Moment updated\n\n${formatMoment(rows[0], tz)}`,
        }],
      };
    }
  );

  // ----------------------------------------------------------
  // 22. cc_get_mirror_day
  // ----------------------------------------------------------
  server.registerTool(
    "cc_get_mirror_day",
    {
      title: "Get Mirror Day",
      description: `Read the chronological timeline for a single day — completed tasks, calendar events, brain dumps, journal entries, and moments, merged and sorted in reverse-chronological order. Day boundaries are computed in the user's timezone.

Args:
  - date (required): YYYY-MM-DD for the local day to render.
  - kinds: Optional array filter — subset of ["task","event","dump","journal","moment"]. Omit for all kinds.

Returns: Markdown timeline with times in the user's timezone.`,
      inputSchema: {
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Local date YYYY-MM-DD"),
        kinds: z.array(z.enum(["task", "event", "dump", "journal", "moment"])).optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      const userId = getUserId();
      const tz = await getUserTimezone(userId);
      type MirrorKind = "task" | "event" | "dump" | "journal" | "moment";
      const want = (k: MirrorKind) => !params.kinds || params.kinds.includes(k);
      const toIso = (v: unknown): string =>
        v instanceof Date ? v.toISOString() : String(v);
      const extractSummary = (v: unknown): string | null => {
        if (!v || typeof v !== "object") return null;
        const s = (v as { summary?: unknown }).summary;
        return typeof s === "string" ? s : null;
      };

      const { start, end } = await localDayWindow(params.date, tz);

      const [tasksRows, eventRows, dumpRows, journalRows, momentRows] = await Promise.all([
        want("task")
          ? sql(
              `SELECT id, title, category, completed_at AS at
               FROM tasks
               WHERE user_id = $1 AND status = 'completed' AND deleted_at IS NULL
                 AND completed_at >= $2 AND completed_at < $3`,
              [userId, start, end]
            )
          : Promise.resolve([]),
        want("event")
          ? sql(
              `SELECT id, title, location, start_time AS at, end_time AS end_at, is_all_day
               FROM calendar_events
               WHERE user_id = $1 AND start_time <= $3 AND end_time > $2`,
              [userId, start, end]
            )
          : Promise.resolve([]),
        want("dump")
          ? sql(
              `SELECT id, input_type, ai_response, created_at AS at
               FROM brain_dumps
               WHERE user_id = $1 AND category = 'braindump'
                 AND created_at >= $2 AND created_at < $3`,
              [userId, start, end]
            )
          : Promise.resolve([]),
        want("journal")
          ? sql(
              `SELECT id, input_type, ai_response, media_url, media_urls, created_at AS at
               FROM brain_dumps
               WHERE user_id = $1 AND category = 'junk_journal'
                 AND created_at >= $2 AND created_at < $3`,
              [userId, start, end]
            )
          : Promise.resolve([]),
        want("moment")
          ? sql(
              `SELECT id, type, intensity, note, occurred_at AS at
               FROM moments
               WHERE user_id = $1 AND deleted_at IS NULL
                 AND occurred_at >= $2 AND occurred_at < $3`,
              [userId, start, end]
            )
          : Promise.resolve([]),
      ]);

      type Entry = Record<string, unknown> & { kind: string; at: string };
      const entries: Entry[] = [];

      for (const r of tasksRows) {
        entries.push({ kind: "task", id: r.id, at: toIso(r.at), title: r.title, category: r.category });
      }
      for (const r of eventRows) {
        entries.push({ kind: "event", id: r.id, at: toIso(r.at), endAt: toIso(r.end_at), title: r.title, location: r.location, isAllDay: r.is_all_day });
      }
      for (const r of dumpRows) {
        entries.push({ kind: "dump", id: r.id, at: toIso(r.at), summary: extractSummary(r.ai_response), inputType: r.input_type });
      }
      for (const r of journalRows) {
        const mediaArr = Array.isArray(r.media_urls) ? (r.media_urls as string[]) : [];
        const mediaCount =
          mediaArr.length > 0 ? mediaArr.length : r.media_url ? 1 : 0;
        entries.push({
          kind: "journal",
          id: r.id,
          at: toIso(r.at),
          summary: extractSummary(r.ai_response),
          inputType: r.input_type,
          mediaCount,
        });
      }
      for (const r of momentRows) {
        entries.push({ kind: "moment", id: r.id, at: toIso(r.at), type: r.type, intensity: r.intensity, note: r.note });
      }

      entries.sort((a, b) => b.at.localeCompare(a.at));

      if (entries.length === 0) {
        return {
          content: [{ type: "text" as const, text: `No activity on ${params.date} (${tz}).` }],
        };
      }

      const text = `## Mirror — ${params.date} (${tz}) · ${entries.length} entries\n\n` +
        entries.map((e) => `- ${formatMirrorEntry(e, tz)}`).join("\n");

      return { content: [{ type: "text" as const, text }] };
    }
  );

  // ----------------------------------------------------------
  // 21. cc_delete_moment
  // ----------------------------------------------------------
  server.registerTool(
    "cc_delete_moment",
    {
      title: "Delete Moment",
      description: `Soft-delete a moment. The row remains in the DB with deleted_at set — not visible in lists but recoverable with direct DB access.

Args:
  - id (required): Moment UUID.

Returns: Confirmation.`,
      inputSchema: {
        id: z.string().uuid().describe("Moment ID"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      const userId = getUserId();
      const rows = await sql(
        `UPDATE moments SET deleted_at = NOW()
         WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
         RETURNING id, type`,
        [params.id, userId]
      );

      if (rows.length === 0) {
        return { content: [{ type: "text" as const, text: `Moment ${params.id} not found.` }] };
      }

      return {
        content: [{
          type: "text" as const,
          text: `🗑 Moment deleted (${rows[0].type})`,
        }],
      };
    }
  );

  // ----------------------------------------------------------
  // cc_create_journal — dedicated journal entry creator
  // Stores into brain_dumps with category='junk_journal'. A thin wrapper
  // around cc_brain_dump for cleaner tool semantics when the caller
  // specifically wants a journal entry (longer-form, separate from task
  // brain dumps).
  // ----------------------------------------------------------
  server.registerTool(
    "cc_create_journal",
    {
      title: "Create Journal Entry",
      description: `Save a new junk journal entry — longer-form, reflective writing kept separate from task brain dumps. Stored in the brain_dumps table with category='junk_journal'.

Args:
  - content (required): Journal entry text (max 20000 chars).

Returns: Confirmation with the new entry's ID.`,
      inputSchema: {
        content: z.string().min(1).max(20000).describe("Journal entry text"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      const userId = getUserId();
      const rows = await sql(
        `INSERT INTO brain_dumps (user_id, input_type, raw_content, category)
         VALUES ($1, 'text', $2, 'junk_journal')
         RETURNING id, created_at`,
        [userId, params.content]
      );

      return {
        content: [{
          type: "text" as const,
          text: `📖 Journal entry saved!\nID: \`${rows[0].id}\`\nCreated: ${rows[0].created_at}`,
        }],
      };
    }
  );

  // ----------------------------------------------------------
  // cc_list_journals — list junk_journal entries
  // ----------------------------------------------------------
  server.registerTool(
    "cc_list_journals",
    {
      title: "List Journal Entries",
      description: `List junk journal entries (category='junk_journal'). Optionally filter by date range.

Args:
  - start_date: Start of range (ISO 8601 UTC). Optional.
  - end_date: End of range (ISO 8601 UTC). Optional.
  - limit: Max results (1-50, default 20).

Returns: Markdown-formatted list of entries with IDs, content previews, and timestamps in the user's timezone.`,
      inputSchema: {
        start_date: z.string().datetime().optional().describe("ISO 8601 UTC start date"),
        end_date: z.string().datetime().optional().describe("ISO 8601 UTC end date"),
        limit: z.number().int().min(1).max(50).default(20).describe("Max results"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      const userId = getUserId();
      const tz = await getUserTimezone(userId);
      const conditions: string[] = ["user_id = $1", "category = 'junk_journal'"];
      const values: unknown[] = [userId];
      let paramIdx = 2;

      if (params.start_date) {
        conditions.push(`created_at >= $${paramIdx}`);
        values.push(params.start_date);
        paramIdx++;
      }

      if (params.end_date) {
        conditions.push(`created_at <= $${paramIdx}`);
        values.push(params.end_date);
        paramIdx++;
      }

      const query = `SELECT * FROM brain_dumps WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${paramIdx}`;
      values.push(params.limit);

      const rows = await sql(query, values);

      if (rows.length === 0) {
        return { content: [{ type: "text" as const, text: "No journal entries found matching those filters." }] };
      }

      const text = `## Journal Entries (${rows.length} found)\n\n` +
        rows.map((r, i) => `### ${i + 1}. ${formatBrainDump(r, tz)}`).join("\n\n---\n\n");
      return { content: [{ type: "text" as const, text }] };
    }
  );

  // ============================================================
  // Microtasks
  // ============================================================

  // ----------------------------------------------------------
  // cc_list_microtasks
  // ----------------------------------------------------------
  server.registerTool(
    "cc_list_microtasks",
    {
      title: "List Microtasks",
      description: `List the user's active microtasks with today's completion status and a rolling 7-day count.

Microtasks are small repeatable prompts (e.g. "5 min Upwork scan", "drink water") that reset every day. They do NOT accumulate when missed.

Returns: Markdown list of active microtasks with their IDs, time-of-day, schedule, whether completed today, and 7-day completion ratio.`,
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const userId = getUserId();
      const tz = await getUserTimezone(userId);
      const today = todayInTz(tz);
      const todayDate = new Date(today + "T12:00:00Z");
      const dayOfWeek = todayDate.getUTCDay();
      const weekStart = new Date(todayDate.getTime() - 6 * 86_400_000)
        .toISOString()
        .slice(0, 10);

      const rows = await sql(
        `SELECT * FROM microtasks
         WHERE user_id = $1 AND active = true
         ORDER BY sort_order ASC, created_at ASC`,
        [userId]
      );

      if (rows.length === 0) {
        return {
          content: [
            { type: "text" as const, text: "No active microtasks. Create one with `cc_create_microtask`." },
          ],
        };
      }

      const ids = rows.map((r) => r.id as string);
      const completions = await sql(
        `SELECT microtask_id, completed_date, note FROM microtask_completions
         WHERE user_id = $1
           AND microtask_id = ANY($2::uuid[])
           AND completed_date >= $3
           AND completed_date <= $4`,
        [userId, ids, weekStart, today]
      );

      const byId = new Map<string, { count: number; todayNote: string | null; completedToday: boolean }>();
      for (const id of ids) byId.set(id, { count: 0, todayNote: null, completedToday: false });
      for (const c of completions) {
        const e = byId.get(c.microtask_id as string);
        if (!e) continue;
        e.count += 1;
        if (c.completed_date === today) {
          e.completedToday = true;
          e.todayNote = (c.note as string | null) ?? null;
        }
      }

      const text =
        `## Microtasks (${rows.length} active)\n\n_Today: ${today}_\n\n` +
        rows
          .map((r, i) => {
            const enrich = byId.get(r.id as string) ?? {
              count: 0,
              todayNote: null,
              completedToday: false,
            };
            const days = Array.isArray(r.days_of_week)
              ? (r.days_of_week as number[])
              : (() => {
                  try {
                    return JSON.parse(r.days_of_week as string) as number[];
                  } catch {
                    return [] as number[];
                  }
                })();
            return `### ${i + 1}. ${formatMicrotask(r, {
              completedToday: enrich.completedToday,
              todayNote: enrich.todayNote,
              completionCount7d: enrich.count,
              scheduledToday: days.includes(dayOfWeek),
            })}`;
          })
          .join("\n\n---\n\n");

      return { content: [{ type: "text" as const, text }] };
    }
  );

  // ----------------------------------------------------------
  // cc_create_microtask
  // ----------------------------------------------------------
  server.registerTool(
    "cc_create_microtask",
    {
      title: "Create Microtask",
      description: `Create a small repeatable microtask (a prompt, not a real task).

Args:
  - title (required): Short label, e.g. "5 min Upwork scan".
  - emoji: Optional emoji for the chip (e.g. "🔍").
  - time_of_day: morning | afternoon | evening | anytime (default: anytime).
  - days_of_week: Array of 0-6 integers where 0=Sunday, 6=Saturday. Default: every day.

Returns: The created microtask with its ID.`,
      inputSchema: {
        title: z.string().min(1).max(200).describe("Microtask title"),
        emoji: z.string().max(8).optional().describe("Optional chip emoji"),
        time_of_day: z
          .enum(["morning", "afternoon", "evening", "anytime"])
          .default("anytime"),
        days_of_week: z
          .array(z.number().int().min(0).max(6))
          .min(1)
          .max(7)
          .optional()
          .describe("Days 0=Sun..6=Sat (default every day)"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      const userId = getUserId();
      const days = params.days_of_week
        ? Array.from(new Set(params.days_of_week)).sort()
        : [0, 1, 2, 3, 4, 5, 6];

      const rows = await sql(
        `INSERT INTO microtasks (user_id, title, emoji, time_of_day, days_of_week)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         RETURNING *`,
        [
          userId,
          params.title,
          params.emoji ?? null,
          params.time_of_day,
          JSON.stringify(days),
        ]
      );

      return {
        content: [
          { type: "text" as const, text: `✅ Microtask created!\n\n${formatMicrotask(rows[0])}` },
        ],
      };
    }
  );

  // ----------------------------------------------------------
  // cc_complete_microtask
  // ----------------------------------------------------------
  server.registerTool(
    "cc_complete_microtask",
    {
      title: "Complete Microtask",
      description: `Mark a microtask done for today. Idempotent — calling twice in one day is safe.

Args:
  - microtask_id (required): UUID of the microtask.
  - note: Optional quick note about the completion.

Returns: The completion record (with date and note).`,
      inputSchema: {
        microtask_id: z.string().uuid().describe("Microtask UUID"),
        note: z.string().max(1000).optional().describe("Optional quick note"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      const userId = getUserId();
      const tz = await getUserTimezone(userId);
      const today = todayInTz(tz);

      const owned = await sql(
        `SELECT id FROM microtasks WHERE id = $1 AND user_id = $2 LIMIT 1`,
        [params.microtask_id, userId]
      );
      if (owned.length === 0) {
        return {
          content: [{ type: "text" as const, text: "❌ Microtask not found." }],
          isError: true,
        };
      }

      // If a note is given, write it on conflict so re-tapping with a new note
      // updates the existing completion. If no note, leave any existing one alone.
      const onConflictClause = params.note
        ? `ON CONFLICT (microtask_id, completed_date) DO UPDATE SET note = EXCLUDED.note`
        : `ON CONFLICT (microtask_id, completed_date) DO NOTHING`;

      const inserted = await sql(
        `INSERT INTO microtask_completions (microtask_id, user_id, completed_date, note)
         VALUES ($1, $2, $3, $4)
         ${onConflictClause}
         RETURNING *`,
        [params.microtask_id, userId, today, params.note ?? null]
      );

      let row = inserted[0];
      if (!row) {
        const existing = await sql(
          `SELECT * FROM microtask_completions
           WHERE microtask_id = $1 AND completed_date = $2 LIMIT 1`,
          [params.microtask_id, today]
        );
        row = existing[0];
      }

      const note = row?.note ? ` — _${row.note as string}_` : "";
      return {
        content: [
          {
            type: "text" as const,
            text: `✓ Marked done for ${today}${note}`,
          },
        ],
      };
    }
  );

  // ----------------------------------------------------------
  // cc_uncomplete_microtask
  // ----------------------------------------------------------
  server.registerTool(
    "cc_uncomplete_microtask",
    {
      title: "Uncomplete Microtask",
      description: `Undo today's completion of a microtask.

Args:
  - microtask_id (required): UUID of the microtask.

Returns: success/failure message.`,
      inputSchema: {
        microtask_id: z.string().uuid().describe("Microtask UUID"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      const userId = getUserId();
      const tz = await getUserTimezone(userId);
      const today = todayInTz(tz);

      const removed = await sql(
        `DELETE FROM microtask_completions
         WHERE microtask_id = $1 AND user_id = $2 AND completed_date = $3
         RETURNING id`,
        [params.microtask_id, userId, today]
      );

      if (removed.length === 0) {
        return {
          content: [
            { type: "text" as const, text: `No completion to undo for today (${today}).` },
          ],
        };
      }
      return {
        content: [{ type: "text" as const, text: `↩️ Undid today's completion (${today}).` }],
      };
    }
  );

  // ----------------------------------------------------------
  // cc_update_microtask
  // ----------------------------------------------------------
  server.registerTool(
    "cc_update_microtask",
    {
      title: "Update Microtask",
      description: `Update fields on an existing microtask. Pass only what changes.

Args:
  - microtask_id (required): UUID of the microtask.
  - title: New title.
  - emoji: New emoji (pass empty string "" to clear).
  - time_of_day: morning | afternoon | evening | anytime.
  - days_of_week: Array of 0..6.
  - active: true/false.
  - sort_order: Integer for manual ordering.

Returns: The updated microtask.`,
      inputSchema: {
        microtask_id: z.string().uuid().describe("Microtask UUID"),
        title: z.string().min(1).max(200).optional(),
        emoji: z.string().max(8).optional(),
        time_of_day: z.enum(["morning", "afternoon", "evening", "anytime"]).optional(),
        days_of_week: z
          .array(z.number().int().min(0).max(6))
          .min(1)
          .max(7)
          .optional(),
        active: z.boolean().optional(),
        sort_order: z.number().int().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      const userId = getUserId();
      const sets: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (params.title !== undefined) {
        sets.push(`title = $${idx++}`);
        values.push(params.title);
      }
      if (params.emoji !== undefined) {
        sets.push(`emoji = $${idx++}`);
        values.push(params.emoji === "" ? null : params.emoji);
      }
      if (params.time_of_day !== undefined) {
        sets.push(`time_of_day = $${idx++}`);
        values.push(params.time_of_day);
      }
      if (params.days_of_week !== undefined) {
        sets.push(`days_of_week = $${idx++}::jsonb`);
        values.push(JSON.stringify(Array.from(new Set(params.days_of_week)).sort()));
      }
      if (params.active !== undefined) {
        sets.push(`active = $${idx++}`);
        values.push(params.active);
      }
      if (params.sort_order !== undefined) {
        sets.push(`sort_order = $${idx++}`);
        values.push(params.sort_order);
      }

      if (sets.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No fields to update." }],
          isError: true,
        };
      }

      sets.push(`updated_at = now()`);
      values.push(params.microtask_id, userId);
      const rows = await sql(
        `UPDATE microtasks SET ${sets.join(", ")}
         WHERE id = $${idx++} AND user_id = $${idx}
         RETURNING *`,
        values
      );

      if (rows.length === 0) {
        return {
          content: [{ type: "text" as const, text: "❌ Microtask not found." }],
          isError: true,
        };
      }
      return {
        content: [
          { type: "text" as const, text: `✅ Updated.\n\n${formatMicrotask(rows[0])}` },
        ],
      };
    }
  );

  // ----------------------------------------------------------
  // cc_deactivate_microtask
  // ----------------------------------------------------------
  server.registerTool(
    "cc_deactivate_microtask",
    {
      title: "Deactivate Microtask",
      description: `Soft-pause a microtask (sets active=false). Completion history is preserved. Reactivate by calling cc_update_microtask with active=true.

Args:
  - microtask_id (required): UUID of the microtask.

Returns: The updated (now inactive) microtask.`,
      inputSchema: {
        microtask_id: z.string().uuid().describe("Microtask UUID"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      const userId = getUserId();
      const rows = await sql(
        `UPDATE microtasks SET active = false, updated_at = now()
         WHERE id = $1 AND user_id = $2
         RETURNING *`,
        [params.microtask_id, userId]
      );
      if (rows.length === 0) {
        return {
          content: [{ type: "text" as const, text: "❌ Microtask not found." }],
          isError: true,
        };
      }
      return {
        content: [
          { type: "text" as const, text: `⏸ Paused.\n\n${formatMicrotask(rows[0])}` },
        ],
      };
    }
  );

  // ----------------------------------------------------------
  // cc_recommend_next_task
  // Returns a ranked list of candidate next tasks plus the context
  // needed for the calling AI client to pick one. Does NOT call the
  // server-side recommendation engine — the client model does the
  // ranking from this data, which is more flexible and avoids burning
  // Haiku tokens on a request the client can answer itself.
  // ----------------------------------------------------------
  server.registerTool(
    "cc_recommend_next_task",
    {
      title: "Recommend Next Task",
      description: `Return up to 5 candidate next tasks plus current context (energy, calendar, today's progress) so the calling AI can recommend "what to do right now."

Tasks are ranked by:
  1. Has a HARD deadline (deadlined tasks first)
  2. Deadline ascending
  3. Priority (urgent > important > normal > someday)

Soft self-imposed targets are shown on each candidate but are deliberately NOT ranked on — a self-imposed date should inform your recommendation, not outrank an external one. Weigh it yourself; don't speak about it as a deadline.

Optional filters narrow the candidate pool before ranking.

Args:
  - energy_level: Only suggest tasks matching this energy level (low, medium, high).
  - time_available_minutes: Only suggest tasks whose estimated_minutes fits in this window.
  - location_tag: Only suggest tasks tagged for this location (e.g., "home", "office").

Returns: Markdown with a Recommendations section (top tasks) and a Context section (now-time, current/next calendar event, tasks completed today).`,
      inputSchema: {
        energy_level: z.enum(["low", "medium", "high"]).optional().describe("Match this energy level"),
        time_available_minutes: z.number().int().positive().optional().describe("Only tasks fitting in this many minutes"),
        location_tag: z.string().optional().describe("Only tasks tagged for this location"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      const userId = getUserId();
      const tz = await getUserTimezone(userId);

      const conditions: string[] = [
        "user_id = $1",
        "deleted_at IS NULL",
        // Same pool as the app's getPendingTasks: open tasks, plus snoozed
        // ones whose snooze has run out.
        "(status IN ('pending', 'in_progress') OR (status = 'snoozed' AND (snoozed_until IS NULL OR snoozed_until < NOW())))",
      ];
      const values: unknown[] = [userId];
      let paramIdx = 2;

      if (params.energy_level) {
        conditions.push(`energy_level = $${paramIdx}`);
        values.push(params.energy_level);
        paramIdx++;
      }
      if (params.time_available_minutes != null) {
        conditions.push(`(estimated_minutes IS NULL OR estimated_minutes <= $${paramIdx})`);
        values.push(params.time_available_minutes);
        paramIdx++;
      }
      if (params.location_tag) {
        conditions.push(`location_tags::jsonb @> $${paramIdx}::jsonb`);
        values.push(JSON.stringify([params.location_tag]));
        paramIdx++;
      }

      const taskQuery = `
        SELECT *
        FROM tasks
        WHERE ${conditions.join(" AND ")}
        ORDER BY
          CASE WHEN deadline IS NULL THEN 1 ELSE 0 END,
          deadline ASC,
          CASE priority
            WHEN 'urgent' THEN 0
            WHEN 'important' THEN 1
            WHEN 'normal' THEN 2
            WHEN 'someday' THEN 3
            ELSE 4
          END,
          created_at ASC
        LIMIT 5
      `;
      const tasks = await sql(taskQuery, values);

      // Context: current event, next event, completed today
      const nowIso = new Date().toISOString();
      const today = await localDayWindow(todayInTz(tz), tz);

      const [currentEventRows, nextEventRows, completedTodayRows] = await Promise.all([
        sql(
          `SELECT * FROM calendar_events
           WHERE user_id = $1 AND start_time <= $2 AND end_time > $2
           ORDER BY start_time DESC LIMIT 1`,
          [userId, nowIso]
        ),
        sql(
          `SELECT * FROM calendar_events
           WHERE user_id = $1 AND start_time > $2
           ORDER BY start_time ASC LIMIT 1`,
          [userId, nowIso]
        ),
        sql(
          `SELECT count(*)::int AS n FROM tasks
           WHERE user_id = $1 AND deleted_at IS NULL
             AND status = 'completed'
             AND completed_at >= $2 AND completed_at < $3`,
          [userId, today.start, today.end]
        ),
      ]);

      const completedToday = (completedTodayRows[0]?.n as number) ?? 0;

      const sections: string[] = [];

      sections.push(`## Recommendations (${tasks.length})`);
      if (tasks.length === 0) {
        sections.push("_No pending tasks match those filters. Try a brain dump?_");
      } else {
        tasks.forEach((t, i) => {
          sections.push(`### ${i + 1}. ${formatTask(t, tz)}`);
        });
      }

      // The day's bounds ride along here so a planner acting on a
      // recommendation doesn't need a second call to know where the day ends.
      const settings = await getUserSettings(userId);
      const ctxLines: string[] = [
        `Now: ${fmtTimeLocal(nowIso, tz)}`,
        `Timezone: ${tz}`,
        `Scheduling window: ${settings.wakeTime}:00–${settings.sleepTime}:00 local (wake_time–sleep_time). Never place work outside it. The calendar's display range is a separate, cosmetic setting — see cc_get_settings.`,
      ];
      if (currentEventRows[0]) {
        ctxLines.push(`Currently in: ${currentEventRows[0].title} (until ${fmtTimeLocal(currentEventRows[0].end_time, tz)})`);
      }
      if (nextEventRows[0]) {
        ctxLines.push(`Next event: ${nextEventRows[0].title} at ${fmtTimeLocal(nextEventRows[0].start_time, tz)}`);
      }
      ctxLines.push(`Completed today: ${completedToday}`);

      sections.push(`## Context\n${ctxLines.join("\n")}`);

      return { content: [{ type: "text" as const, text: sections.join("\n\n") }] };
    }
  );

  // ----------------------------------------------------------
  // cc_get_active_crisis
  // Surfaces an in-progress crisis plan (if one exists) so the
  // calling AI knows the user is in a high-stakes deadline state.
  // ----------------------------------------------------------
  server.registerTool(
    "cc_get_active_crisis",
    {
      title: "Get Active Crisis",
      description: `Return the user's active crisis plan if one is in progress, or report none.

A crisis plan is "active" when it is incomplete AND either its hard deadline is still in the future, or it has no hard deadline and was created in the last 24 hours. This mirrors the app exactly — a plan the app has already dropped will not be reported here.

A rescue plan may have NO hard deadline: the user asked for help getting through something they set for themselves. Such a plan is still real work worth supporting, but it is NOT an external emergency. Do not manufacture deadline urgency for it.

Use this to detect when the user is in damage-control mode so you can adjust tone, scope, and recommendations accordingly.

Returns: Markdown with task name, deadline (or an explicit "no hard deadline"), soft target, panic level, summary, and progress (current step / total). Empty-state when no active crisis.`,
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const userId = getUserId();
      const tz = await getUserTimezone(userId);
      const rows = await sql(
        // Mirrors activePlanCondition() in src/lib/db/queries/crisis.ts. The
        // 24h bound exists so a deadline-less plan doesn't stay "active"
        // forever; without it this tool reported plans the app had dropped.
        `SELECT id, task_name, deadline, target_date, panic_level, panic_label, summary,
                tasks, current_task_index, completion_pct, source, created_at
         FROM crisis_plans
         WHERE user_id = $1
           AND completed_at IS NULL
           AND (
             deadline > NOW()
             OR (deadline IS NULL AND created_at > NOW() - INTERVAL '24 hours')
           )
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId]
      );

      if (rows.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No active crisis plan." }],
        };
      }

      const c = rows[0];
      const taskList = Array.isArray(c.tasks) ? c.tasks : [];
      const totalSteps = taskList.length;
      const currentIdx = (c.current_task_index as number) ?? 0;
      const currentTask =
        totalSteps > 0 && currentIdx < totalSteps
          ? (taskList[currentIdx] as Record<string, unknown>)
          : null;

      const lines: string[] = [
        `## Active Crisis: ${c.task_name}`,
        `ID: \`${c.id}\``,
        // An empty "Deadline: " is worse than useless to a calling model — it
        // can't tell "none" from "field missing", and guessing in the urgent
        // direction is the exact behavior the rescue-session fix targeted.
        c.deadline
          ? `Deadline (HARD): ${fmtLocal(c.deadline, tz)}`
          : `Deadline: none — this is self-imposed work, not an external emergency`,
        ...(c.target_date
          ? [`Target (SOFT, self-imposed): ${fmtLocal(c.target_date, tz)}`]
          : []),
        `Panic level: **${c.panic_level}** (${c.panic_label})`,
        `Progress: ${currentIdx}/${totalSteps} steps · ${c.completion_pct ?? 0}% task complete`,
        `Source: ${c.source ?? "manual"}`,
        `Started: ${fmtTimeLocal(c.created_at, tz)}`,
        ``,
        `### Summary`,
        String(c.summary ?? ""),
      ];

      if (currentTask) {
        lines.push(``, `### Current step (#${currentIdx + 1})`);
        if (currentTask.title) lines.push(`**${currentTask.title}**`);
        if (currentTask.instruction) lines.push(String(currentTask.instruction));
      }

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );

  // ----------------------------------------------------------
  // cc_get_settings
  // ----------------------------------------------------------
  server.registerTool(
    "cc_get_settings",
    {
      title: "Get Settings",
      description: `Read the user's timezone and the hour bounds of their day. Read-only.

Call this BEFORE proposing or writing any schedule. Without it you are guessing at boundaries the app itself enforces, and a plan that lands outside them will be rejected or will simply be wrong.

THE TWO HOUR RANGES ARE NOT THE SAME THING:
  - wake_time / sleep_time — the AI SCHEDULING WINDOW. This is the one you must respect. Never place work before wake_time or after sleep_time.
  - calendar_start_hour / calendar_end_hour — purely the VISUAL range of the calendar grid. It only controls what the user sees on screen. It is NOT permission to schedule, and it is NOT a constraint on scheduling.

They often read the same because calendar_start_hour falls back to wake_time when the user has never set it explicitly. Do not infer from that they are interchangeable.

There is deliberately NO write counterpart. Settings belong to the user; a model quietly moving someone's sleep time is a worse failure than not being able to.

Returns: Markdown with timezone, the scheduling window, the calendar display range, and the week start day.`,
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const userId = getUserId();
      const s = await getUserSettings(userId);

      const hour = (h: number) => {
        const suffix = h < 12 ? "AM" : "PM";
        const display = h % 12 === 0 ? 12 : h % 12;
        return `${display} ${suffix}`;
      };

      const lines = [
        `## Settings`,
        ``,
        `**Timezone:** ${s.timezone}`,
        `All datetimes you send must be UTC. Convert from this timezone before writing.`,
        ``,
        `### Scheduling window — respect this`,
        `${hour(s.wakeTime)} to ${hour(s.sleepTime)} (wake_time ${s.wakeTime}, sleep_time ${s.sleepTime})`,
        `Never schedule work outside this range.`,
        ``,
        `### Calendar display range — cosmetic only`,
        `${hour(s.calendarStartHour)} to ${hour(s.calendarEndHour)} (calendar_start_hour ${s.calendarStartHour}, calendar_end_hour ${s.calendarEndHour})`,
        `This is only what the calendar grid draws. It is not a scheduling constraint.`,
        ``,
        `### Week starts on`,
        s.weekStartDay === 0 ? "Sunday" : "Monday",
      ];

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );

  // ----------------------------------------------------------
  // cc_update_journal
  // ----------------------------------------------------------
  server.registerTool(
    "cc_update_journal",
    {
      title: "Update Journal Entry",
      description: `Edit the text of an existing junk journal entry — fixing a typo, finishing a sentence the user trailed off on.

Only entries with category='junk_journal' can be edited. A brain dump is raw unedited input and is deliberately NOT editable here: rewriting what someone actually said is not the same as fixing their journal prose.

Args:
  - journal_id (required): UUID of the journal entry.
  - content (required): The full replacement text (max 20000 chars). This REPLACES the entry, it does not append.

Returns: Confirmation with the updated entry.`,
      inputSchema: {
        journal_id: z.string().uuid().describe("Journal entry ID"),
        content: z.string().min(1).max(20000).describe("Replacement text for the entry"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      const userId = getUserId();
      const rows = await sql(
        `UPDATE brain_dumps SET raw_content = $3
          WHERE id = $1 AND user_id = $2 AND category = 'junk_journal'
          RETURNING id, raw_content, created_at`,
        [params.journal_id, userId, params.content]
      );

      if (rows.length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: `No journal entry \`${params.journal_id}\` found. (Brain dumps are not editable — only entries created as journals.)`,
          }],
        };
      }

      return {
        content: [{
          type: "text" as const,
          text: `📖 Journal entry updated.\nID: \`${rows[0].id}\`\n\n${String(rows[0].raw_content ?? "")}`,
        }],
      };
    }
  );

  // ----------------------------------------------------------
  // cc_uncomplete_task — mirrors cc_uncomplete_microtask
  // ----------------------------------------------------------
  server.registerTool(
    "cc_uncomplete_task",
    {
      title: "Uncomplete Task",
      description: `Reopen a completed task — put it back to pending and clear its completion timestamp. The inverse of cc_complete_task.

Use when a task was marked done by mistake, or turned out not to actually be finished.

Args:
  - task_id (required): UUID of the task to reopen.

Returns: The reopened task.`,
      inputSchema: {
        task_id: z.string().uuid().describe("Task ID to reopen"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      const userId = getUserId();
      const tz = await getUserTimezone(userId);
      const rows = await sql(
        `UPDATE tasks SET status = 'pending', completed_at = NULL, updated_at = NOW()
          WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING *`,
        [params.task_id, userId]
      );

      if (rows.length === 0) {
        return { content: [{ type: "text" as const, text: `Task \`${params.task_id}\` not found.` }] };
      }

      return { content: [{ type: "text" as const, text: `↩️ Task reopened.\n\n${formatTask(rows[0], tz)}` }] };
    }
  );
}
