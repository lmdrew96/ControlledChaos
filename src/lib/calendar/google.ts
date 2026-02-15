/**
 * Google Calendar REST API client — uses fetch, no npm packages needed.
 * Clerk manages OAuth tokens; we just pass the access token in.
 */

const GCAL_BASE = "https://www.googleapis.com/calendar/v3";

export interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  status: string;
}

interface GoogleEventsResponse {
  items: GoogleCalendarEvent[];
  nextPageToken?: string;
}

interface GoogleCalendarListEntry {
  id: string;
  summary?: string;
  primary?: boolean;
  selected?: boolean;
  accessRole: string;
}

interface GoogleCalendarListResponse {
  items: GoogleCalendarListEntry[];
}

export function createGoogleCalendarClient(accessToken: string) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  return {
    /**
     * List events from ALL visible calendars within a time range.
     * Fetches the user's calendar list first, then queries each one.
     * This picks up subscribed calendars (e.g. school calendar added to personal account).
     */
    async listEvents(params: {
      timeMin: string;
      timeMax: string;
      maxResults?: number;
    }): Promise<GoogleCalendarEvent[]> {
      // 1. Get all calendars the user can see
      const calListRes = await fetch(
        `${GCAL_BASE}/users/me/calendarList?minAccessRole=reader`,
        { headers }
      );
      if (!calListRes.ok) {
        // Fall back to just primary if calendarList fails
        return this.listEventsFromCalendar("primary", params);
      }
      const calList: GoogleCalendarListResponse = await calListRes.json();
      const calendars = calList.items ?? [];

      if (calendars.length === 0) {
        return this.listEventsFromCalendar("primary", params);
      }

      // 2. Fetch events from each calendar in parallel
      const perCalendar = Math.max(
        50,
        Math.floor((params.maxResults ?? 250) / calendars.length)
      );
      const results = await Promise.allSettled(
        calendars.map((cal) =>
          this.listEventsFromCalendar(cal.id, {
            ...params,
            maxResults: perCalendar,
          })
        )
      );

      const allEvents: GoogleCalendarEvent[] = [];
      for (const result of results) {
        if (result.status === "fulfilled") {
          allEvents.push(...result.value);
        }
      }

      return allEvents;
    },

    /** List events from a single calendar by ID */
    async listEventsFromCalendar(
      calendarId: string,
      params: { timeMin: string; timeMax: string; maxResults?: number }
    ): Promise<GoogleCalendarEvent[]> {
      const url = new URL(
        `${GCAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events`
      );
      url.searchParams.set("timeMin", params.timeMin);
      url.searchParams.set("timeMax", params.timeMax);
      url.searchParams.set("singleEvents", "true");
      url.searchParams.set("orderBy", "startTime");
      url.searchParams.set("maxResults", String(params.maxResults ?? 250));

      const res = await fetch(url.toString(), { headers });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Google Calendar API error ${res.status}: ${body}`);
      }
      const data: GoogleEventsResponse = await res.json();
      return data.items ?? [];
    },

    /** Create an event on the primary calendar */
    async createEvent(event: {
      summary: string;
      description?: string;
      start: { dateTime: string; timeZone: string };
      end: { dateTime: string; timeZone: string };
    }): Promise<GoogleCalendarEvent> {
      const res = await fetch(`${GCAL_BASE}/calendars/primary/events`, {
        method: "POST",
        headers,
        body: JSON.stringify(event),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Google Calendar create error ${res.status}: ${body}`);
      }
      return res.json();
    },

    /** Delete an event from the primary calendar */
    async deleteEvent(eventId: string): Promise<void> {
      const res = await fetch(
        `${GCAL_BASE}/calendars/primary/events/${encodeURIComponent(eventId)}`,
        { method: "DELETE", headers }
      );
      if (!res.ok && res.status !== 404) {
        throw new Error(`Google Calendar delete error ${res.status}`);
      }
    },
  };
}
