export interface RecurrenceInput {
  title: string;
  description?: string | null;
  location?: string | null;
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  isAllDay?: boolean;
  recurrence?: {
    type: "daily" | "weekly";
    daysOfWeek?: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
    endDate?: string; // ISO 8601
  };
}

export interface ExpandedEvent {
  title: string;
  description: string | null;
  location: string | null;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
}

const MAX_INSTANCES = 200;
const DEFAULT_WEEKS = 16; // One semester

/**
 * Expand a possibly-recurring event definition into concrete event instances.
 * Non-recurring events return a single-element array.
 */
export function expandRecurrence(input: RecurrenceInput): ExpandedEvent[] {
  const start = new Date(input.startTime);
  const end = new Date(input.endTime);
  const durationMs = end.getTime() - start.getTime();
  const isAllDay = input.isAllDay ?? false;

  const base: Omit<ExpandedEvent, "startTime" | "endTime"> = {
    title: input.title,
    description: input.description ?? null,
    location: input.location ?? null,
    isAllDay,
  };

  if (!input.recurrence || !input.recurrence.type) {
    return [{ ...base, startTime: start, endTime: end }];
  }

  const { type, daysOfWeek, endDate } = input.recurrence;

  // Calculate recurrence end
  const recurrenceEnd = endDate
    ? new Date(endDate)
    : new Date(start.getTime() + DEFAULT_WEEKS * 7 * 24 * 60 * 60 * 1000);

  const events: ExpandedEvent[] = [];

  if (type === "daily") {
    const cursor = new Date(start);
    while (cursor <= recurrenceEnd && events.length < MAX_INSTANCES) {
      events.push({
        ...base,
        startTime: new Date(cursor),
        endTime: new Date(cursor.getTime() + durationMs),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
  } else if (type === "weekly") {
    const targetDays = daysOfWeek && daysOfWeek.length > 0
      ? daysOfWeek.filter((d) => d >= 0 && d <= 6)
      : [start.getDay()]; // Default to the start day

    // Find the first Monday of the week containing the start date
    const weekCursor = new Date(start);
    weekCursor.setDate(weekCursor.getDate() - ((weekCursor.getDay() + 6) % 7)); // Go to Monday
    weekCursor.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), 0);

    while (weekCursor <= recurrenceEnd && events.length < MAX_INSTANCES) {
      for (const dayOfWeek of targetDays) {
        if (events.length >= MAX_INSTANCES) break;

        // Calculate the date for this day of the week
        const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Convert to Mon=0 offset
        const eventDate = new Date(weekCursor);
        eventDate.setDate(weekCursor.getDate() + daysFromMonday);
        eventDate.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), 0);

        // Skip dates before the start or after the end
        if (eventDate < start || eventDate > recurrenceEnd) continue;

        events.push({
          ...base,
          startTime: new Date(eventDate),
          endTime: new Date(eventDate.getTime() + durationMs),
        });
      }

      // Move to next week
      weekCursor.setDate(weekCursor.getDate() + 7);
    }

    // Sort by date since days within a week may be out of order
    events.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }

  return events;
}
