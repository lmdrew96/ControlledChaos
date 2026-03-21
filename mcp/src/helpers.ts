/**
 * Format a task row into a readable markdown string.
 */
export function formatTask(task: Record<string, unknown>): string {
  const parts: string[] = [
    `**${task.title}**`,
    `ID: \`${task.id}\``,
    `Status: ${task.status} | Priority: ${task.priority} | Energy: ${task.energy_level}`,
  ];
  if (task.description) parts.push(`Description: ${task.description}`);
  if (task.category) parts.push(`Category: ${task.category}`);
  if (task.estimated_minutes) parts.push(`Estimated: ${task.estimated_minutes} min`);
  if (task.deadline) parts.push(`Deadline: ${task.deadline}`);
  if (task.scheduled_for) parts.push(`Scheduled: ${task.scheduled_for}`);
  if (task.location_tags) {
    try {
      const tags = Array.isArray(task.location_tags)
        ? task.location_tags
        : JSON.parse(task.location_tags as string);
      if (tags.length > 0) parts.push(`Location: ${tags.join(", ")}`);
    } catch {
      /* ignore parse errors */
    }
  }
  if (task.completed_at) parts.push(`Completed: ${task.completed_at}`);
  return parts.join("\n");
}

/**
 * Format a calendar event into a readable markdown string.
 */
export function formatEvent(event: Record<string, unknown>): string {
  const parts: string[] = [
    `**${event.title}**`,
    `ID: \`${event.id}\``,
    `Source: ${event.source}`,
    `Start: ${event.start_time}`,
    `End: ${event.end_time}`,
  ];
  if (event.description) parts.push(`Description: ${event.description}`);
  if (event.location) parts.push(`Location: ${event.location}`);
  if (event.is_all_day) parts.push(`All day event`);
  return parts.join("\n");
}

/**
 * Format a goal into a readable markdown string.
 */
export function formatGoal(goal: Record<string, unknown>): string {
  const parts: string[] = [
    `**${goal.title}**`,
    `ID: \`${goal.id}\``,
    `Status: ${goal.status}`,
  ];
  if (goal.description) parts.push(`Description: ${goal.description}`);
  if (goal.target_date) parts.push(`Target: ${goal.target_date}`);
  return parts.join("\n");
}
