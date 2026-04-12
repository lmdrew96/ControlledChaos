import { NextRequest, NextResponse } from "next/server";
import { getUserIdByCalendarToken, getCalendarEventsByDateRange } from "@/lib/db/queries";

interface RouteContext {
  params: Promise<{ token: string }>;
}

function formatIcalDate(isoString: string, isAllDay: boolean): string {
  const d = new Date(isoString);
  if (isAllDay) {
    // DATE format: YYYYMMDD
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}${m}${day}`;
  }
  // DATETIME format: YYYYMMDDTHHmmssZ
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
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

    // Rolling window: 60 days back, 180 days forward
    const start = new Date();
    start.setDate(start.getDate() - 60);
    const end = new Date();
    end.setDate(end.getDate() + 180);

    const events = await getCalendarEventsByDateRange(userId, start, end);

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
      const dtStart = formatIcalDate(event.startTime.toISOString(), isAllDay);

      // For all-day events, DTEND must be exclusive (day after the last day)
      let dtEnd: string;
      if (isAllDay) {
        const endDate = new Date(event.endTime);
        // If start and end are the same day, push end to next day
        if (dtStart === formatIcalDate(event.endTime.toISOString(), true)) {
          endDate.setUTCDate(endDate.getUTCDate() + 1);
        }
        dtEnd = formatIcalDate(endDate.toISOString(), true);
      } else {
        dtEnd = formatIcalDate(event.endTime.toISOString(), false);
      }

      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${event.id}@controlledchaos`);
      lines.push(`DTSTAMP:${formatIcalDate(new Date().toISOString(), false)}`);

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
