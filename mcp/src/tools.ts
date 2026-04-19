import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sql, getUserId, getUserTimezone } from "./db.js";
import { formatTask, formatEvent, formatGoal, formatBrainDump, formatMoment, formatMirrorEntry, fmtTimeLocal } from "./helpers.js";

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
  - deadline: ISO 8601 date/datetime string in UTC (append Z or +00:00).
  - location_tags: Array of location tags like ["home", "campus"].

All datetimes must be in UTC. Convert the user's local time to UTC before calling.

Returns: The created task with its ID.`,
      inputSchema: {
        title: z.string().min(1).max(500).describe("Task title"),
        description: z.string().max(2000).optional().describe("Task description"),
        priority: z.enum(["urgent", "important", "normal", "someday"]).default("normal").describe("Priority level"),
        energy_level: z.enum(["low", "medium", "high"]).default("medium").describe("Energy required"),
        estimated_minutes: z.number().int().min(1).max(480).optional().describe("Estimated minutes"),
        category: z.enum(["school", "work", "personal", "errands", "health"]).optional().describe("Category"),
        deadline: z.string().optional().describe("Deadline as ISO 8601 UTC string (e.g. 2026-04-11T18:00:00Z)"),
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
        `INSERT INTO tasks (user_id, title, description, priority, energy_level, estimated_minutes, category, deadline, location_tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
  - title, description, status, priority, energy_level, estimated_minutes, category, deadline, scheduled_for, location_tags: Fields to update.

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
        deadline: z.string().optional().describe("New deadline (ISO 8601 UTC)"),
        scheduled_for: z.string().optional().describe("Scheduled datetime (ISO 8601 UTC)"),
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

All datetimes must be in UTC. Convert the user's local time to UTC before calling.

Returns: Markdown-formatted list of events with times displayed in the user's timezone.`,
      inputSchema: {
        start_date: z.string().describe("Start date (ISO 8601 UTC, e.g. 2026-03-21T04:00:00Z)"),
        end_date: z.string().describe("End date (ISO 8601 UTC)"),
        source: z.enum(["canvas", "google", "controlledchaos"]).optional().describe("Filter by event source"),
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
      let query: string;
      let values: unknown[];

      if (params.source) {
        query = `SELECT * FROM calendar_events
                 WHERE user_id = $1 AND start_time >= $2 AND start_time <= $3 AND source = $4
                 ORDER BY start_time`;
        values = [userId, new Date(params.start_date).toISOString(), new Date(params.end_date).toISOString(), params.source];
      } else {
        query = `SELECT * FROM calendar_events
                 WHERE user_id = $1 AND start_time >= $2 AND start_time <= $3
                 ORDER BY start_time`;
        values = [userId, new Date(params.start_date).toISOString(), new Date(params.end_date).toISOString()];
      }

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
      description: `Create a new calendar event in ControlledChaos.

Args:
  - title (required): Event title.
  - start_time (required): Start datetime (ISO 8601 in UTC).
  - end_time (required): End datetime (ISO 8601 in UTC).
  - description: Optional description.
  - location: Optional location string.
  - is_all_day: Whether it's an all-day event (default false).

All datetimes must be in UTC. Convert the user's local time to UTC before calling.

Returns: The created event with its ID.`,
      inputSchema: {
        title: z.string().min(1).max(500).describe("Event title"),
        start_time: z.string().describe("Start datetime (ISO 8601 UTC)"),
        end_time: z.string().describe("End datetime (ISO 8601 UTC)"),
        description: z.string().max(2000).optional().describe("Event description"),
        location: z.string().max(500).optional().describe("Event location"),
        is_all_day: z.boolean().default(false).describe("All-day event?"),
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
      const externalId = `mcp-${crypto.randomUUID()}`;
      const rows = await sql(
        `INSERT INTO calendar_events (user_id, source, external_id, title, description, start_time, end_time, location, is_all_day, synced_at)
         VALUES ($1, 'controlledchaos', $2, $3, $4, $5, $6, $7, $8, NOW())
         RETURNING *`,
        [
          userId,
          externalId,
          params.title,
          params.description ?? null,
          new Date(params.start_time).toISOString(),
          new Date(params.end_time).toISOString(),
          params.location ?? null,
          params.is_all_day,
        ]
      );

      return { content: [{ type: "text" as const, text: `📅 Event created!\n\n${formatEvent(rows[0], tz)}` }] };
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
  - title, description, start_time, end_time, location, is_all_day: Fields to update.

All datetimes must be in UTC. Convert the user's local time to UTC before calling.

Returns: The updated event.`,
      inputSchema: {
        event_id: z.string().uuid().describe("Event ID to update"),
        title: z.string().min(1).max(500).optional().describe("New title"),
        description: z.string().max(2000).optional().describe("New description"),
        start_time: z.string().optional().describe("New start datetime (ISO 8601 UTC)"),
        end_time: z.string().optional().describe("New end datetime (ISO 8601 UTC)"),
        location: z.string().max(500).optional().describe("New location"),
        is_all_day: z.boolean().optional().describe("All-day event?"),
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
      const setClauses: string[] = ["synced_at = NOW()"];
      const values: unknown[] = [];
      let idx = 1;

      const fields: Array<[string, unknown]> = [
        ["title", params.title],
        ["description", params.description],
        ["start_time", params.start_time ? new Date(params.start_time).toISOString() : undefined],
        ["end_time", params.end_time ? new Date(params.end_time).toISOString() : undefined],
        ["location", params.location],
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

      if (rows.length === 0) {
        return { content: [{ type: "text" as const, text: `Event \`${params.event_id}\` not found, or it's a synced event (only ControlledChaos-created events can be updated).` }] };
      }

      return { content: [{ type: "text" as const, text: `✅ Event updated!\n\n${formatEvent(rows[0], tz)}` }] };
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

Returns: Confirmation of deletion.`,
      inputSchema: {
        event_id: z.string().uuid().describe("Event ID to delete"),
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
      description: `Read the chronological timeline for a single day — completed tasks, calendar events, brain dumps, journal entries, moments, and medication logs, merged and sorted in reverse-chronological order. Day boundaries are computed in the user's timezone.

Args:
  - date (required): YYYY-MM-DD for the local day to render.
  - kinds: Optional array filter — subset of ["task","event","dump","journal","moment","med"]. Omit for all kinds.

Returns: Markdown timeline with times in the user's timezone.`,
      inputSchema: {
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Local date YYYY-MM-DD"),
        kinds: z.array(z.enum(["task", "event", "dump", "journal", "moment", "med"])).optional(),
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
      type MirrorKind = "task" | "event" | "dump" | "journal" | "moment" | "med";
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

      const [tasksRows, eventRows, dumpRows, journalRows, momentRows, medRows] = await Promise.all([
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
        want("med")
          ? sql(
              `SELECT ml.id, ml.medication_id, ml.taken_at AS at, m.name AS medication_name, m.dosage
               FROM medication_logs ml
               JOIN medications m ON m.id = ml.medication_id
               WHERE ml.user_id = $1 AND ml.scheduled_date = $2`,
              [userId, params.date]
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
      for (const r of medRows) {
        entries.push({ kind: "med", id: r.id, at: toIso(r.at), medicationName: r.medication_name, dosage: r.dosage });
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
  // cc_list_medications — list the user's active medications
  // ----------------------------------------------------------
  server.registerTool(
    "cc_list_medications",
    {
      title: "List Medications",
      description: `List the user's medications (definitions, not dose logs). You'll typically need a medication_id from this list before calling cc_log_med or cc_list_meds. Medications themselves are created in the ControlledChaos app UI — this tool is read-only.

Args:
  - active_only: If true (default), only return active medications.

Returns: Markdown-formatted list with IDs, name, dosage, reminder times, and active status.`,
      inputSchema: {
        active_only: z.boolean().default(true).describe("Only return active medications"),
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
      const conditions: string[] = ["user_id = $1"];
      const values: unknown[] = [userId];
      if (params.active_only !== false) {
        conditions.push("is_active = true");
      }
      const rows = await sql(
        `SELECT id, name, dosage, reminder_times, is_active
         FROM medications
         WHERE ${conditions.join(" AND ")}
         ORDER BY name ASC`,
        values
      );

      if (rows.length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: "No medications found. Add medications in the ControlledChaos app under Settings → Medications.",
          }],
        };
      }

      const lines = rows.map((r) => {
        const times = Array.isArray(r.reminder_times)
          ? (r.reminder_times as string[]).join(", ")
          : "";
        const activeTag = r.is_active ? "" : " (inactive)";
        return `- **${r.name}** (${r.dosage})${activeTag}\n  ID: \`${r.id}\`\n  Reminder times: ${times || "—"}`;
      });

      return {
        content: [{
          type: "text" as const,
          text: `## Medications (${rows.length})\n\n${lines.join("\n\n")}`,
        }],
      };
    }
  );

  // ----------------------------------------------------------
  // cc_log_med — record a dose taken
  // Rows are tied to (medication_id, scheduled_date, scheduled_time) via a
  // unique index, matching the adherence-tracking model. For retroactive
  // logging, pass an explicit scheduled_date/scheduled_time from the
  // medication's reminder_times.
  // ----------------------------------------------------------
  server.registerTool(
    "cc_log_med",
    {
      title: "Log Medication Dose",
      description: `Log that a medication dose was taken. Schema ties each log to a scheduled slot (medication + date + time), so pass scheduled_date and scheduled_time matching one of the medication's reminder_times.

Args:
  - medication_id (required): UUID of the medication (get from cc_list_medications).
  - scheduled_date (required): Slot date as "YYYY-MM-DD" in the user's timezone.
  - scheduled_time (required): Slot time as "HH:MM" (24h, matches one of the medication's reminder_times).
  - taken_at: Actual time taken (ISO 8601 UTC). Defaults to now. Use this for retro-logging.

Returns: Confirmation with the log entry ID, or a note that the slot was already logged (idempotent).`,
      inputSchema: {
        medication_id: z.string().uuid().describe("Medication UUID"),
        scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Scheduled date YYYY-MM-DD"),
        scheduled_time: z.string().regex(/^\d{2}:\d{2}$/).describe("Scheduled time HH:MM (24h)"),
        taken_at: z.string().datetime().optional().describe("Actual time taken (ISO 8601 UTC)"),
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

      // Verify the medication exists and belongs to this user
      const medRows = await sql(
        `SELECT id, name, dosage FROM medications WHERE id = $1 AND user_id = $2`,
        [params.medication_id, userId]
      );
      if (medRows.length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: `Medication \`${params.medication_id}\` not found. Use cc_list_medications to find the right ID.`,
          }],
        };
      }

      const insertValues: unknown[] = [
        userId,
        params.medication_id,
        params.scheduled_date,
        params.scheduled_time,
      ];
      const takenAtClause = params.taken_at ? ", taken_at" : "";
      const takenAtPlaceholder = params.taken_at ? ", $5" : "";
      if (params.taken_at) insertValues.push(params.taken_at);

      const rows = await sql(
        `INSERT INTO medication_logs (user_id, medication_id, scheduled_date, scheduled_time${takenAtClause})
         VALUES ($1, $2, $3, $4${takenAtPlaceholder})
         ON CONFLICT (medication_id, scheduled_date, scheduled_time) DO NOTHING
         RETURNING id, taken_at`,
        insertValues
      );

      if (rows.length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: `💊 Already logged: ${medRows[0].name} (${medRows[0].dosage}) for ${params.scheduled_date} at ${params.scheduled_time}.`,
          }],
        };
      }

      return {
        content: [{
          type: "text" as const,
          text: `💊 Logged: ${medRows[0].name} (${medRows[0].dosage}) for ${params.scheduled_date} at ${params.scheduled_time}.\nLog ID: \`${rows[0].id}\``,
        }],
      };
    }
  );

  // ----------------------------------------------------------
  // cc_list_meds — list medication log entries (adherence history)
  // ----------------------------------------------------------
  server.registerTool(
    "cc_list_meds",
    {
      title: "List Medication Log Entries",
      description: `List medication dose log entries (adherence history). Filter by date range or specific medication.

Args:
  - medication_id: Filter to a single medication. Optional.
  - start_date: Start of slot-date range (YYYY-MM-DD). Optional.
  - end_date: End of slot-date range (YYYY-MM-DD). Optional.
  - limit: Max results (1-200, default 50).

Returns: Markdown-formatted list of dose logs with med name, dosage, scheduled slot, and actual taken_at time.`,
      inputSchema: {
        medication_id: z.string().uuid().optional().describe("Filter by medication ID"),
        start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Start date YYYY-MM-DD"),
        end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("End date YYYY-MM-DD"),
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
      const conditions: string[] = ["ml.user_id = $1"];
      const values: unknown[] = [userId];
      let paramIdx = 2;

      if (params.medication_id) {
        conditions.push(`ml.medication_id = $${paramIdx}`);
        values.push(params.medication_id);
        paramIdx++;
      }
      if (params.start_date) {
        conditions.push(`ml.scheduled_date >= $${paramIdx}`);
        values.push(params.start_date);
        paramIdx++;
      }
      if (params.end_date) {
        conditions.push(`ml.scheduled_date <= $${paramIdx}`);
        values.push(params.end_date);
        paramIdx++;
      }

      const query = `
        SELECT ml.id, ml.scheduled_date, ml.scheduled_time, ml.taken_at,
               m.name AS medication_name, m.dosage
        FROM medication_logs ml
        JOIN medications m ON m.id = ml.medication_id
        WHERE ${conditions.join(" AND ")}
        ORDER BY ml.scheduled_date DESC, ml.scheduled_time DESC
        LIMIT $${paramIdx}`;
      values.push(params.limit);

      const rows = await sql(query, values);

      if (rows.length === 0) {
        return { content: [{ type: "text" as const, text: "No medication logs found matching those filters." }] };
      }

      const lines = rows.map((r) => {
        return `- \`${r.id}\` · **${r.medication_name}** (${r.dosage}) — ${r.scheduled_date} ${r.scheduled_time} (taken ${fmtTimeLocal(r.taken_at, tz)})`;
      });

      return {
        content: [{
          type: "text" as const,
          text: `## Medication Logs (${rows.length})\n\n${lines.join("\n")}`,
        }],
      };
    }
  );

  // ----------------------------------------------------------
  // cc_delete_med — remove a medication log entry
  // Hard delete — medication_logs has no deleted_at column. The unique
  // slot index is released, so a new log for the same slot can be created.
  // ----------------------------------------------------------
  server.registerTool(
    "cc_delete_med",
    {
      title: "Delete Medication Log Entry",
      description: `Remove a medication dose log entry. Hard delete (irreversible). Use this to correct mis-logged doses — the slot frees up so you can re-log cleanly.

Args:
  - id (required): UUID of the medication log entry (from cc_list_meds).`,
      inputSchema: {
        id: z.string().uuid().describe("Medication log entry ID"),
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
        `DELETE FROM medication_logs
         WHERE id = $1 AND user_id = $2
         RETURNING id`,
        [params.id, userId]
      );

      if (rows.length === 0) {
        return { content: [{ type: "text" as const, text: `Medication log \`${params.id}\` not found.` }] };
      }

      return { content: [{ type: "text" as const, text: `🗑 Medication log deleted.` }] };
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
}
