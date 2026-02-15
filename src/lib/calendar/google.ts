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

interface GoogleCalendarListResponse {
  items: GoogleCalendarEvent[];
  nextPageToken?: string;
}

export function createGoogleCalendarClient(accessToken: string) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  return {
    /** List events from primary calendar within a time range */
    async listEvents(params: {
      timeMin: string;
      timeMax: string;
      maxResults?: number;
    }): Promise<GoogleCalendarEvent[]> {
      const url = new URL(`${GCAL_BASE}/calendars/primary/events`);
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
      const data: GoogleCalendarListResponse = await res.json();
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
