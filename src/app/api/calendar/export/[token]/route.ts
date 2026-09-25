import { NextRequest, NextResponse } from "next/server";
import {
  getUserIdByCalendarToken,
  getCalendarEventsByDateRange,
  getScheduledSessionsInRange,
  getUser,
} from "@/lib/db/queries";
import { toDateKeyInTimezone } from "@/lib/timezone";
import { planBlockEnd } from "@/lib/calendar/plan-blocks";

interface RouteContext {
  params: Promise<{ token: string }>;
}

/** DATETIME format: YYYYMMDDTHHmmssZ */
function formatIcalDateTime(isoString: string): string {
  return new Date(isoString).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * DATE format: YYYYMMDD, resolved in the USER's timezone.
 *
 * All-day rows are stored as the instant of local midnight, so reading their
 * UTC calendar date gives the wrong day for anyone at a positive UTC offset
 * (local midnight in Tokyo is 15:00 UTC the previous day). Which calendar day
 * an all-day event belongs to is a local-time question, so ask it locally.
 */
function formatIcalDate(isoString: string, timezone: string): string {
  return toDateKeyInTimezone(new Date(isoString), timezone).replace(/-/g, "");
}

function escapeIcalText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function foldLine(line: string): string {
  // Fold at 75 octets per RFC 5545 (includes property name + colon)
  const lines: string[] = [];
  let remaining = line;
  while (remaining.length > 75) {
    lines.push(remaining.slice(0, 75));
    remaining = " " + remaining.slice(75);
  }
  lines.push(remaining);
  return lines.join("\r\n");
}

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;

    const userId = await getUserIdByCalendarToken(token);
    if (!userId) {
      return new NextResponse("Not found", { status: 404 });
    }

    // Needed to resolve which calendar day an all-day event falls on.
    const user = await getUser(userId);
    const timezone = user?.timezone ?? "America/New_York";

    // Rolling window: 60 days back, 180 days forward
    const start = new Date();
    start.setDate(start.getDate() - 60);
    const end = new Date();
    end.setDate(end.getDate() + 180);

    // Planned work is exported alongside real events. It lives as
    // task.scheduledFor, not as a calendar row — the scheduler used to
    // materialize a cc- event and that is how planned work used to reach a
    // subscribed calendar. It no longer does, so without this the feed would
    // silently stop showing anything you'd planned.
    const [events, scheduledTasks] = await Promise.all([
      getCalendarEventsByDateRange(userId, start, end),
      getScheduledSessionsInRange(userId, start, end),
    ]);

    const lines: string[] = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//ControlledChaos//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:ControlledChaos",
    ];

    for (const event of events) {
      const isAllDay = event.isAllDay ?? false;

      // DTEND for VALUE=DATE is exclusive, and all-day rows are now STORED
      // with an exclusive next-local-midnight end — the same convention. So
      // the end date formats directly; this used to have to guess and push the
      // end forward a day whenever start and end landed on the same one.
      const dtStart = isAllDay
        ? formatIcalDate(event.startTime.toISOString(), timezone)
        : formatIcalDateTime(event.startTime.toISOString());
      const dtEnd = isAllDay
        ? formatIcalDate(event.endTime.toISOString(), timezone)
        : formatIcalDateTime(event.endTime.toISOString());

      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${event.id}@controlledchaos`);
      lines.push(`DTSTAMP:${formatIcalDateTime(new Date().toISOString())}`);

      if (isAllDay) {
        lines.push(`DTSTART;VALUE=DATE:${dtStart}`);
        lines.push(`DTEND;VALUE=DATE:${dtEnd}`);
      } else {
        lines.push(`DTSTART:${dtStart}`);
        lines.push(`DTEND:${dtEnd}`);
      }

      lines.push(foldLine(`SUMMARY:${escapeIcalText(event.title)}`));

      if (event.description) {
        lines.push(foldLine(`DESCRIPTION:${escapeIcalText(event.description)}`));
      }
      if (event.location) {
        lines.push(foldLine(`LOCATION:${escapeIcalText(event.location)}`));
      }

      lines.push("END:VEVENT");
    }

    for (const task of scheduledTasks) {
      if (!task.scheduledFor) continue;

      const blockStart = task.scheduledFor;
      // The sitting's own length, same as the in-app calendar — not the task's
      // whole estimate, which a multi-sitting plan splits up.
      const blockEnd = planBlockEnd(blockStart, task.sessionMinutes ?? task.estimatedMinutes);

      lines.push("BEGIN:VEVENT");
      // Keyed on the SITTING: a task planned across several would otherwise
      // share one UID, and subscribers keep only one event per UID. The
      // plan- namespace keeps these from colliding with calendar rows.
      lines.push(`UID:plan-${task.sessionId}@controlledchaos`);
      lines.push(`DTSTAMP:${formatIcalDateTime(new Date().toISOString())}`);
      lines.push(`DTSTART:${formatIcalDateTime(blockStart.toISOString())}`);
      lines.push(`DTEND:${formatIcalDateTime(blockEnd.toISOString())}`);
      lines.push(foldLine(`SUMMARY:${escapeIcalText(task.title)}`));
      if (task.description) {
        lines.push(foldLine(`DESCRIPTION:${escapeIcalText(task.description)}`));
      }
      lines.push("END:VEVENT");
    }

    lines.push("END:VCALENDAR");

    const icsContent = lines.join("\r\n") + "\r\n";

    return new NextResponse(icsContent, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="controlledchaos.ics"',
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("[API] GET /api/calendar/export/[token] error:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
