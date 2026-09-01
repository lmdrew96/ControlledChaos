import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sql, getUserId, getUserTimezone } from "./db.js";
import { formatTask, formatEvent, formatGoal, formatBrainDump, formatMoment, formatMirrorEntry, formatMicrotask, fmtTimeLocal, fmtLocal } from "./helpers.js";
import { expandRecurrence } from "./expand-recurrence.js";

// Compute today's calendar date (YYYY-MM-DD) in the given IANA timezone.
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

// ============================================================
// Register all ControlledChaos tools on the given server
// ============================================================
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

      const query = `SELECT * FROM tasks WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${paramIdx}`;
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
  - location_tags: Array of location tags like ["home", "campus"].

## deadline vs target_date — pick deliberately

These are independent: either, both, or neither may be set. Never derive one from the other.

- Use **deadline** ONLY when something outside the user imposes the date and missing it has real external consequences.
- Use **target_date** when the user chose the date for themselves ("I want this done by Wednesday even though it's due Friday"). Missing it has NO external consequence and it is theirs to move.
- If the user says a date is self-imposed, believe them and use target_date.
- If you are unsure which one a date is, ASK. Filing a self-imposed date as a deadline manufactures urgency the user never agreed to — that is the exact failure this field exists to prevent.

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
        location_tags: z.array(z.string()).optional().describe("Location tags"),
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
        `INSERT INTO tasks (user_id, title, description, priority, energy_level, estimated_minutes, category, deadline, target_date, location_tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
          params.location_tags?.length ? JSON.stringify(params.location_tags) : null,
        ]
      );

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
  - title, description, status, priority, energy_level, estimated_minutes, category, deadline, target_date, scheduled_for, location_tags: Fields to update.

## The three times a task can carry

They mean different things and are never interchangeable:

- **deadline** — a HARD wall imposed by the outside world. Missing it has real consequences; neither you nor the user can move it.
- **target_date** — a SOFT target the user set for THEMSELVES. Missing it has no external consequence and moving it is a legitimate choice, not a failure.
- **scheduled_for** — when the user planned to START working. It is not a due date of any kind.

Never describe a target_date as "due", and never apply deadline urgency to one. Moving a user's self-imposed target is a normal edit; moving a deadline usually means the user is telling you the stored data is wrong.

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
        deadline: z.string().optional().describe("New HARD deadline, imposed from outside (ISO 8601 UTC)"),
        target_date: z.string().optional().describe("New SOFT self-imposed target (ISO 8601 UTC)"),
        scheduled_for: z.string().optional().describe("When the user plans to START — not a due date (ISO 8601 UTC)"),
        location_tags: z.array(z.string()).optional().describe("New location tags"),
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
        ["deadline", "deadline", params.deadline ? new Date(params.deadline).toISOString() : undefined],
        ["target_date", "target_date", params.target_date ? new Date(params.target_date).toISOString() : undefined],
        ["scheduled_for", "scheduled_for", params.scheduled_for ? new Date(params.scheduled_for).toISOString() : undefined],
        ["location_tags", "location_tags", params.location_tags ? JSON.stringify(params.location_tags) : undefined],
      ];

      for (const [, col, val] of fields) {
        if (val !== undefined) {
          setClauses.push(`${col} = $${idx}`);
          values.push(val);
          idx++;
        }
      }

      // If marking completed, set completed_at
      if (params.status === "completed") {
        setClauses.push(`completed_at = NOW()`);
      }

      if (setClauses.length === 1) {
        return { content: [{ type: "text" as const, text: "No fields to update. Pass at least one field to change." }] };
      }

      values.push(params.task_id, userId);
      const query = `UPDATE tasks SET ${setClauses.join(", ")} WHERE id = $${idx} AND user_id = $${idx + 1} RETURNING *`;
      const rows = await sql(query, values);

      if (rows.length === 0) {
        return { content: [{ type: "text" as const, text: `Task \`${params.task_id}\` not found.` }] };
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
        `UPDATE tasks SET status = 'completed', completed_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND user_id = $2 RETURNING *`,
        [params.task_id, userId]
      );

      if (rows.length === 0) {
        return { content: [{ type: "text" as const, text: `Task \`${params.task_id}\` not found.` }] };
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
      description: `Permanently delete a task and its activity log.

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
      description: `Store a raw brain dump entry. This saves the text to the brain_dumps table for later AI parsing by the app.

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
        `INSERT INTO brain_dumps (user_id, input_type, raw_content, parsed, category)
         VALUES ($1, 'text', $2, false, $3)
         RETURNING id, created_at, category`,
        [userId, params.content, cat]
      );

      const label = rows[0].category === "junk_journal" ? "Junk journal entry" : "Brain dump";
      return {
        content: [{
          type: "text" as const,
          text: `🧠 ${label} saved!\nID: \`${rows[0].id}\`\nCategory: ${rows[0].category}\nCreated: ${rows[0].created_at}\n\nThis will be available for AI parsing in the ControlledChaos app.`,
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

Args:
  - start_date (required): Start of range (ISO 8601 in UTC, e.g. "2026-03-21T04:00:00Z" for midnight ET).
  - end_date (required): End of range (ISO 8601 in UTC).
  - source: Filter by source (canvas, google, controlledchaos).
  - category: Filter by category (school, work, personal, errands, health).

All datetimes must be in UTC. Convert the user's local time to UTC before calling.

Returns: Markdown-formatted list of events with times displayed in the user's timezone.`,
      inputSchema: {
        start_date: z.string().describe("Start date (ISO 8601 UTC, e.g. 2026-03-21T04:00:00Z)"),
        end_date: z.string().describe("End date (ISO 8601 UTC)"),
        source: z.enum(["canvas", "google", "controlledchaos"]).optional().describe("Filter by event source"),
        category: z.enum(["school", "work", "personal", "errands", "health"]).optional().describe("Filter by category"),
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

      const conditions: string[] = ["user_id = $1", "start_time <= $3", "end_time > $2"];
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

      if (rows.length === 0) {
        return { content: [{ type: "text" as const, text: "No calendar events found in that range." }] };
      }

      const text = `## Calendar Events (${rows.length} found)\n\n` +
        rows.map((r, i) => `### ${i + 1}. ${formatEvent(r, tz)}`).join("\n\n---\n\n");
      return { content: [{ type: "text" as const, text }] };
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
  - is_all_day: Whether it's an all-day event (default false).
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

      const instances = expandRecurrence({
        title: params.title,
        description: params.description ?? null,
        location: params.location ?? null,
        startTime: params.start_time,
        endTime: params.end_time,
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

Returns: Markdown-formatted list of goals with IDs, descriptions, and target dates.`,
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
        `SELECT * FROM goals WHERE user_id = $1 AND status = 'active' ORDER BY created_at`,
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

      // Completed today
      const completedToday = await sql(
        `SELECT COUNT(*) as count FROM tasks
         WHERE user_id = $1 AND status = 'completed' AND deleted_at IS NULL
         AND completed_at >= (NOW() AT TIME ZONE $2)::date`,
        [userId, tz]
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
         AND start_time >= (NOW() AT TIME ZONE $2)::date
         AND start_time < (NOW() AT TIME ZONE $2)::date + INTERVAL '1 day'
         ORDER BY start_time`,
        [userId, tz]
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
  - target_date: New target date (ISO 8601 UTC).
  - status: New status (active, completed, paused).

All datetimes must be in UTC. Convert the user's local time to UTC before calling.

Returns: The updated goal.`,
      inputSchema: {
        goal_id: z.string().uuid().describe("Goal ID to update"),
        title: z.string().min(1).max(500).optional().describe("New title"),
        description: z.string().max(2000).optional().describe("New description"),
        target_date: z.string().optional().describe("New target date (ISO 8601 UTC)"),
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
        ["target_date", params.target_date ? new Date(params.target_date).toISOString() : undefined],
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
      const query = `UPDATE goals SET ${setClauses.join(", ")} WHERE id = $${idx} AND user_id = $${idx + 1} RETURNING *`;
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
      description: `Permanently delete a goal. Tasks linked to this goal will have their goal_id set to null (they won't be deleted).

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
      const rows = await sql(
        `DELETE FROM goals WHERE id = $1 AND user_id = $2 RETURNING title`,
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

      if (params.scope !== "all" || !seriesId) {
        const setClauses: string[] = ["synced_at = NOW()"];
        const values: unknown[] = [];
        let idx = 1;

        const fields: Array<[string, unknown]> = [
          ["title", params.title],
          ["description", params.description],
          ["start_time", params.start_time ? new Date(params.start_time).toISOString() : undefined],
          ["end_time", params.end_time ? new Date(params.end_time).toISOString() : undefined],
          ["location", params.location],
          ["category", params.category],
          ["is_all_day", params.is_all_day],
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

      if (params.start_time !== undefined || params.end_time !== undefined) {
        const seriesRows = await sql(
          `SELECT * FROM calendar_events WHERE series_id = $1 AND user_id = $2 AND source = 'controlledchaos'`,
          [seriesId, userId]
        );
        const newStart = params.start_time ? new Date(params.start_time) : null;
        const newEnd = params.end_time ? new Date(params.end_time) : null;
        const durationMs = newStart && newEnd ? newEnd.getTime() - newStart.getTime() : null;

        updatedRows = [];
        for (const row of seriesRows) {
          let newRowStart: Date | undefined;
          let newRowEnd: Date | undefined;

          if (newStart) {
            const existingStart = new Date(row.start_time as string);
            const updated = new Date(existingStart);
            updated.setHours(newStart.getHours(), newStart.getMinutes(), 0, 0);
            newRowStart = updated;
            if (durationMs !== null) newRowEnd = new Date(updated.getTime() + durationMs);
          } else if (newEnd) {
            const existingEnd = new Date(row.end_time as string);
            const updated = new Date(existingEnd);
            updated.setHours(newEnd.getHours(), newEnd.getMinutes(), 0, 0);
            newRowEnd = updated;
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
  - parsed: Filter by parsed status (true = already processed, false = pending).
  - category: Filter by category (braindump, junk_journal). Useful for pulling only junk_journal entries for essay drafting.
  - limit: Max results (1-50, default 20).

Returns: Markdown-formatted list of brain dumps with IDs, type, category, content preview, and parsed status.`,
      inputSchema: {
        input_type: z.enum(["text", "voice", "photo"]).optional().describe("Filter by input type"),
        parsed: z.boolean().optional().describe("Filter by parsed status"),
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

      if (params.parsed !== undefined) {
        conditions.push(`parsed = $${paramIdx}`);
        values.push(params.parsed);
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

      const query = `SELECT * FROM tasks WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${paramIdx}`;
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
        occurred_at: z.string().optional().describe("Optional ISO 8601 UTC timestamp (defaults to now)"),
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
        occurred_at: z.string().optional(),
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

      // Single round-trip: compute the day window in user's timezone
      const windowRows = await sql(
        `SELECT
           ($1::date AT TIME ZONE $2)::timestamptz AS day_start,
           (($1::date + INTERVAL '1 day') AT TIME ZONE $2)::timestamptz AS day_end`,
        [params.date, tz]
      );
      const start = windowRows[0].day_start as Date | string;
      const end = windowRows[0].day_end as Date | string;

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
        `INSERT INTO brain_dumps (user_id, input_type, raw_content, parsed, category)
         VALUES ($1, 'text', $2, false, 'junk_journal')
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
        "status IN ('pending', 'in_progress')",
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
      const todayStr = todayInTz(tz);

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
             AND (completed_at AT TIME ZONE $2)::date = $3::date`,
          [userId, tz, todayStr]
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

      const ctxLines: string[] = [`Now: ${fmtTimeLocal(nowIso, tz)}`];
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
}
