const DEFAULT_TZ = "America/New_York";

/**
 * Format a timestamp into a human-readable string in the user's timezone.
 *
 * Postgres `timestamp without time zone` values arrive without a Z suffix,
 * so they're already wall-clock time (stored as ET by the app).
 * We force interpretation in the user's timezone by appending the offset
 * only when the raw string has no timezone indicator.
 */
export function fmtLocal(value: unknown, tz = DEFAULT_TZ): string {
  if (!value) return "";
  const raw = String(value);
  // If the DB value has no timezone suffix, interpret it in the user's tz
  const d = hasTimezoneInfo(raw) ? new Date(raw) : interpretInTimezone(raw, tz);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleString("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Format a timestamp into just time in the user's timezone.
 */
export function fmtTimeLocal(value: unknown, tz = DEFAULT_TZ): string {
  if (!value) return "";
  const raw = String(value);
  const d = hasTimezoneInfo(raw) ? new Date(raw) : interpretInTimezone(raw, tz);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleTimeString("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Check if a date string already contains timezone info (Z, +00:00, etc.) */
function hasTimezoneInfo(s: string): boolean {
  return /Z|[+-]\d{2}:\d{2}|[+-]\d{4}$/.test(s.trim());
}

/**
 * Interpret a naive (no-tz) datetime string as if it's in the given timezone.
 * We do this by formatting `now` in that tz to discover the UTC offset,
 * then appending it to the naive string so Date() parses it correctly.
 */
function interpretInTimezone(naive: string, tz: string): Date {
  // Build a reference Date close to the naive value to get the right DST offset
  const approx = new Date(naive + "Z"); // treat as UTC temporarily
  if (isNaN(approx.getTime())) return new Date(NaN);

  // Get the UTC offset for this timezone at approximately this point in time
  const utcStr = approx.toLocaleString("en-US", { timeZone: "UTC" });
  const tzStr = approx.toLocaleString("en-US", { timeZone: tz });
  const diffMs = new Date(utcStr).getTime() - new Date(tzStr).getTime();
  // diffMs is positive when tz is behind UTC (e.g. +4h for America/New_York EDT)
  const sign = diffMs >= 0 ? "+" : "-";
  const absMins = Math.abs(Math.round(diffMs / 60000));
  const hh = String(Math.floor(absMins / 60)).padStart(2, "0");
  const mm = String(absMins % 60).padStart(2, "0");
  const offset = `${sign}${hh}:${mm}`;

  return new Date(naive.replace(" ", "T") + offset);
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
