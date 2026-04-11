const DEFAULT_TZ = "America/New_York";

/**
 * Convert any DB value to a Date object.
 *
 * Postgres `timestamp without time zone` columns: the Neon driver returns
 * Date objects pinned to UTC (the naive value treated as if it were UTC).
 * Since the app stores wall-clock times (user's local time), we need to
 * "undo" the UTC interpretation and re-anchor the value in the user's tz.
 */
function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  return new Date(value as string);
}

/**
 * Format a timestamp into a human-readable string in the user's timezone.
 *
 * Because the DB uses `timestamp without time zone`, values are stored as
 * local wall-clock time. The Neon driver interprets them as UTC. So we use
 * Intl.DateTimeFormat with timeZone: "UTC" to display the raw value as-is
 * (which IS the user's local time), then append the user's tz abbreviation.
 */
export function fmtLocal(value: unknown, tz = DEFAULT_TZ): string {
  if (!value) return "";
  const d = toDate(value);
  if (isNaN(d.getTime())) return String(value);

  // Format the raw UTC value as-is (it's actually local time stored naively)
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  // Get the user's timezone abbreviation (e.g. "EDT", "EST")
  const tzAbbr = getTzAbbreviation(tz);

  return `${formatter.format(d)} ${tzAbbr}`;
}

/**
 * Format a timestamp into just time in the user's timezone.
 */
export function fmtTimeLocal(value: unknown, tz = DEFAULT_TZ): string {
  if (!value) return "";
  const d = toDate(value);
  if (isNaN(d.getTime())) return String(value);

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
  });

  const tzAbbr = getTzAbbreviation(tz);

  return `${formatter.format(d)} ${tzAbbr}`;
}

/**
 * Get the current timezone abbreviation for a given IANA timezone.
 * e.g. "America/New_York" → "EDT" or "EST" depending on DST.
 */
function getTzAbbreviation(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "short",
    }).formatToParts(new Date());
    const tzPart = parts.find(p => p.type === "timeZoneName");
    return tzPart?.value ?? tz;
  } catch {
    return tz;
  }
}


/**
 * Format a task row into a readable markdown string.
 */
export function formatTask(task: Record<string, unknown>, tz?: string): string {
  const parts: string[] = [
    `**${task.title}**`,
    `ID: \`${task.id}\``,
    `Status: ${task.status} | Priority: ${task.priority} | Energy: ${task.energy_level}`,
  ];
  if (task.description) parts.push(`Description: ${task.description}`);
  if (task.category) parts.push(`Category: ${task.category}`);
  if (task.estimated_minutes) parts.push(`Estimated: ${task.estimated_minutes} min`);
  if (task.deadline) parts.push(`Deadline: ${fmtLocal(task.deadline, tz)}`);
  if (task.scheduled_for) parts.push(`Scheduled: ${fmtLocal(task.scheduled_for, tz)}`);
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
  if (task.completed_at) parts.push(`Completed: ${fmtLocal(task.completed_at, tz)}`);
  return parts.join("\n");
}

/**
 * Format a calendar event into a readable markdown string.
 */
export function formatEvent(event: Record<string, unknown>, tz?: string): string {
  const parts: string[] = [
    `**${event.title}**`,
    `ID: \`${event.id}\``,
    `Source: ${event.source}`,
    `Start: ${fmtLocal(event.start_time, tz)}`,
    `End: ${fmtLocal(event.end_time, tz)}`,
  ];
  if (event.description) parts.push(`Description: ${event.description}`);
  if (event.location) parts.push(`Location: ${event.location}`);
  if (event.is_all_day) parts.push(`All day event`);
  return parts.join("\n");
}

/**
 * Format a goal into a readable markdown string.
 */
export function formatGoal(goal: Record<string, unknown>, tz?: string): string {
  const parts: string[] = [
    `**${goal.title}**`,
    `ID: \`${goal.id}\``,
    `Status: ${goal.status}`,
  ];
  if (goal.description) parts.push(`Description: ${goal.description}`);
  if (goal.target_date) parts.push(`Target: ${fmtLocal(goal.target_date, tz)}`);
  return parts.join("\n");
}
