"use client";

import { useState, useCallback } from "react";
import type { CalendarEvent, CalendarSyncResult } from "@/types";

export function useCalendarEvents() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async (start: Date, end: Date) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        start: start.toISOString(),
        end: end.toISOString(),
      });
      const res = await fetch(`/api/calendar/events?${params}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch events");
      }
      const data = await res.json();
      setEvents(data.events);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load events");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const syncCalendar = useCallback(async (): Promise<CalendarSyncResult> => {
    const res = await fetch("/api/calendar/sync", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Sync failed");
    return data;
  }, []);

  return { events, isLoading, error, fetchEvents, syncCalendar };
}
