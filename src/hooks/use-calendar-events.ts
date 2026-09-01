"use client";

import { useState, useCallback } from "react";
import type { CalendarEvent, PlanBlock } from "@/types";

export function useCalendarEvents() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [planBlocks, setPlanBlocks] = useState<PlanBlock[]>([]);
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
      setPlanBlocks(data.planBlocks ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load events");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const syncCalendar = useCallback(async () => {
    const res = await fetch("/api/calendar/sync", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Sync failed");
    return data as {
      success: boolean;
      canvas: { total: number } | null;
      syncedAt: string;
    };
  }, []);

  /**
   * Clear today's plan. One update nulling scheduledFor — no event rows to
   * hunt down, because plan blocks were never calendar events.
   */
  const clearTodaysPlan = useCallback(async (): Promise<{ cleared: number }> => {
    const res = await fetch("/api/plan", { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to clear today's plan");
    return data;
  }, []);

  const createEvent = useCallback(
    async (input: {
      title: string;
      description?: string;
      location?: string;
      startTime: string;
      endTime: string;
      isAllDay?: boolean;
      recurrence?: {
        type: "daily" | "weekly";
        daysOfWeek?: number[];
        endDate?: string;
      };
    }): Promise<{ count: number; seriesId: string | null }> => {
      const res = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create event");
      return data;
    },
    []
  );

  const deleteEventSeries = useCallback(
    async (eventId: string): Promise<{ deleted: number }> => {
      const res = await fetch(`/api/calendar/events/${eventId}/series`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete series");
      return data;
    },
    []
  );

  return {
    events,
    planBlocks,
    isLoading,
    error,
    fetchEvents,
    syncCalendar,
    clearTodaysPlan,
    createEvent,
    deleteEventSeries,
  };
}
