import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sql, getUserId } from "./db.js";
import { formatTask, formatEvent, formatGoal } from "./helpers.js";

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
      const conditions: string[] = ["user_id = $1"];
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
        rows.map((r, i) => `### ${i + 1}. ${formatTask(r)}`).join("\n\n---\n\n");
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
  - deadline: ISO 8601 date/datetime string.
  - location_tags: Array of location tags like ["home", "campus"].

Returns: The created task with its ID.`,
      inputSchema: {
        title: z.string().min(1).max(500).describe("Task title"),
        description: z.string().max(2000).optional().describe("Task description"),
        priority: z.enum(["urgent", "important", "normal", "someday"]).default("normal").describe("Priority level"),
        energy_level: z.enum(["low", "medium", "high"]).default("medium").describe("Energy required"),
        estimated_minutes: z.number().int().min(1).max(480).optional().describe("Estimated minutes"),
        category: z.enum(["school", "work", "personal", "errands", "health"]).optional().describe("Category"),
        deadline: z.string().optional().describe("Deadline as ISO 8601 string"),
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
        content: [{ type: "text" as const, text: `✅ Task created!\n\n${formatTask(rows[0])}` }],
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
        deadline: z.string().optional().describe("New deadline (ISO 8601)"),
        scheduled_for: z.string().optional().describe("Scheduled datetime (ISO 8601)"),
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

      return { content: [{ type: "text" as const, text: `✅ Task updated!\n\n${formatTask(rows[0])}` }] };
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
      const rows = await sql(
        `UPDATE tasks SET status = 'completed', completed_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND user_id = $2 RETURNING *`,
        [params.task_id, userId]
      );

      if (rows.length === 0) {
        return { content: [{ type: "text" as const, text: `Task \`${params.task_id}\` not found.` }] };
      }

      return { content: [{ type: "text" as const, text: `🎉 Task completed!\n\n${formatTask(rows[0])}` }] };
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
      // Delete activity log first (FK constraint)
      await sql(`DELETE FROM task_activity WHERE task_id = $1`, [params.task_id]);
      const rows = await sql(
        `DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING title`,
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

Returns: Confirmation with the dump ID.`,
      inputSchema: {
        content: z.string().min(1).max(10000).describe("Raw brain dump text"),
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
        `INSERT INTO brain_dumps (user_id, input_type, raw_content, parsed)
         VALUES ($1, 'text', $2, false)
         RETURNING id, created_at`,
        [userId, params.content]
      );

      return {
        content: [{
          type: "text" as const,
          text: `🧠 Brain dump saved!\nID: \`${rows[0].id}\`\nCreated: ${rows[0].created_at}\n\nThis will be available for AI parsing in the ControlledChaos app.`,
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
  - start_date (required): Start of range (ISO 8601, e.g. "2026-03-21").
  - end_date (required): End of range (ISO 8601, e.g. "2026-03-28").
  - source: Filter by source (canvas, google, controlledchaos).

Returns: Markdown-formatted list of events.`,
      inputSchema: {
        start_date: z.string().describe("Start date (ISO 8601)"),
        end_date: z.string().describe("End date (ISO 8601)"),
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
        rows.map((r, i) => `### ${i + 1}. ${formatEvent(r)}`).join("\n\n---\n\n");
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
  - start_time (required): Start datetime (ISO 8601).
  - end_time (required): End datetime (ISO 8601).
  - description: Optional description.
  - location: Optional location string.
  - is_all_day: Whether it's an all-day event (default false).

Returns: The created event with its ID.`,
      inputSchema: {
        title: z.string().min(1).max(500).describe("Event title"),
        start_time: z.string().describe("Start datetime (ISO 8601)"),
        end_time: z.string().describe("End datetime (ISO 8601)"),
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

      return { content: [{ type: "text" as const, text: `📅 Event created!\n\n${formatEvent(rows[0])}` }] };
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
      const rows = await sql(
        `SELECT * FROM goals WHERE user_id = $1 AND status = 'active' ORDER BY created_at`,
        [userId]
      );

      if (rows.length === 0) {
        return { content: [{ type: "text" as const, text: "No active goals found." }] };
      }

      const text = `## Active Goals (${rows.length})\n\n` +
        rows.map((r, i) => `### ${i + 1}. ${formatGoal(r)}`).join("\n\n---\n\n");
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

      // Completed today
      const completedToday = await sql(
        `SELECT COUNT(*) as count FROM tasks
         WHERE user_id = $1 AND status = 'completed'
         AND completed_at >= (NOW() AT TIME ZONE 'America/New_York')::date`,
        [userId]
      );

      // Total pending
      const pending = await sql(
        `SELECT COUNT(*) as count FROM tasks
         WHERE user_id = $1 AND status IN ('pending', 'in_progress')`,
        [userId]
      );

      // Overdue
      const overdue = await sql(
        `SELECT COUNT(*) as count FROM tasks
         WHERE user_id = $1 AND status IN ('pending', 'in_progress')
         AND deadline IS NOT NULL AND deadline < NOW()`,
        [userId]
      );

      // Urgent tasks
      const urgent = await sql(
        `SELECT COUNT(*) as count FROM tasks
         WHERE user_id = $1 AND status IN ('pending', 'in_progress')
         AND priority = 'urgent'`,
        [userId]
      );

      // Today's events
      const todaysEvents = await sql(
        `SELECT title, start_time, end_time FROM calendar_events
         WHERE user_id = $1
         AND start_time >= (NOW() AT TIME ZONE 'America/New_York')::date
         AND start_time < (NOW() AT TIME ZONE 'America/New_York')::date + INTERVAL '1 day'
         ORDER BY start_time`,
        [userId]
      );

      const eventsText = todaysEvents.length > 0
        ? todaysEvents.map(e => {
            const start = new Date(e.start_time as string).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
            const end = new Date(e.end_time as string).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
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
}
