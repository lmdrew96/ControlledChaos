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
    /** Fetch the user's visible calendar list. */
    async listCalendars(): Promise<GoogleCalendarListEntry[]> {
      const res = await fetch(
        `${GCAL_BASE}/users/me/calendarList?minAccessRole=reader`,
        { headers, cache: "no-store" }
      );
      if (!res.ok) return [];
      const data: GoogleCalendarListResponse = await res.json();
      return data.items ?? [];
    },

    /**
     * List events from visible calendars within a time range.
     * If calendarIds is provided, only fetches from those calendars.
     * Otherwise fetches from ALL visible calendars.
     */
    async listEvents(params: {
      timeMin: string;
      timeMax: string;
      maxResults?: number;
      calendarIds?: string[];
    }): Promise<GoogleCalendarEvent[]> {
      let calendars: { id: string }[];

      if (params.calendarIds && params.calendarIds.length > 0) {
        // Use only selected calendars
        calendars = params.calendarIds.map((id) => ({ id }));
      } else {
        // Fetch all visible calendars
        const calListRes = await fetch(
          `${GCAL_BASE}/users/me/calendarList?minAccessRole=reader`,
          { headers, cache: "no-store" }
        );
        if (!calListRes.ok) {
          return this.listEventsFromCalendar("primary", params);
        }
        const calList: GoogleCalendarListResponse = await calListRes.json();
        calendars = calList.items ?? [];
      }

      if (calendars.length === 0) {
        return this.listEventsFromCalendar("primary", params);
      }

      // Fetch events from each calendar in parallel
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

      const res = await fetch(url.toString(), { headers, cache: "no-store" });
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

    /** Update an event on the primary calendar (partial update) */
    async patchEvent(
      eventId: string,
      updates: Partial<{
        summary: string;
        description: string;
        start: { dateTime: string; timeZone: string };
        end: { dateTime: string; timeZone: string };
      }>
    ): Promise<GoogleCalendarEvent> {
      const res = await fetch(
        `${GCAL_BASE}/calendars/primary/events/${encodeURIComponent(eventId)}`,
        { method: "PATCH", headers, body: JSON.stringify(updates) }
      );
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Google Calendar patch error ${res.status}: ${body}`);
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
