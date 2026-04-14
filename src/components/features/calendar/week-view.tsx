"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Loader2,
  MapPin,
  Clock,
  Calendar,
  Pencil,
  Trash2,
  AlertTriangle,
  Plus,
  Repeat,
  MoreHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useCalendarEvents } from "@/hooks/use-calendar-events";
import { CreateEventDialog } from "./create-event-dialog";
import { EditEventDialog } from "./edit-event-dialog";
import { categoryColor } from "@/lib/calendar/colors";
import type { CalendarColors, CalendarEvent, CalendarSource, EventCategory } from "@/types";
import { toUserLocal, formatForDisplay, DISPLAY_TIME, DISPLAY_DATE, getCalendarParts } from "@/lib/timezone";
import { useTimezone } from "@/hooks/use-timezone";

// ============================================================
// Constants
// ============================================================
const DEFAULT_START_HOUR = 7;
const DEFAULT_END_HOUR = 22;
const ROW_HEIGHT = 48; // px per 30-min slot
const DAY_LABELS_MONDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_LABELS_SUNDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ============================================================
// Helpers
// ============================================================

/** Get the start of the week containing `date`. startDay: 0=Sunday, 1=Monday */
function getWeekStart(date: Date, startDay: number = 1): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ...
  const diff = (day - startDay + 7) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekDays(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Timezone-aware day key: groups event dates by their calendar day in the user's timezone */
function dayKey(date: Date, tz: string): string {
  const { year, month, day } = getCalendarParts(date, tz);
  return `${year}-${month}-${day}`;
}

/** Check if a UTC date falls on a specific local calendar day */
function isSameDayTz(utcDate: Date, localDay: Date, tz: string): boolean {
  const parts = getCalendarParts(utcDate, tz);
  return (
    parseInt(parts.year) === localDay.getFullYear() &&
    parseInt(parts.month) === localDay.getMonth() + 1 &&
    parseInt(parts.day) === localDay.getDate()
  );
}

function formatTimeTz(date: Date, timezone: string): string {
  return formatForDisplay(date, timezone, DISPLAY_TIME);
}

function formatDateRange(start: Date, end: Date, isAllDay: boolean, timezone: string): string {
  if (isAllDay) return "All day";
  return `${formatTimeTz(start, timezone)} – ${formatTimeTz(end, timezone)}`;
}


function sourceLabel(source: CalendarSource, externalId?: string | null): string {
  switch (source) {
    case "canvas":
      return "Canvas";
    case "google":
      return "Google";
    case "controlledchaos":
      if (externalId?.startsWith("manual-")) return "Manual";
      if (externalId?.startsWith("dump-")) return "Brain Dump";
      return "Scheduled";
    default:
      return source;
  }
}

function eventPosition(event: CalendarEvent, startHour: number, timezone: string) {
  const startLocal = toUserLocal(new Date(event.startTime), timezone);
  const endLocal = toUserLocal(new Date(event.endTime), timezone);

  const startSlot =
    (startLocal.hour - startHour) * 2 + startLocal.minute / 30;
  const endSlot = (endLocal.hour - startHour) * 2 + endLocal.minute / 30;

  const top = Math.max(0, startSlot) * ROW_HEIGHT;
  const height = Math.max(1, endSlot - Math.max(0, startSlot)) * ROW_HEIGHT;

  return { top, height: Math.max(height, ROW_HEIGHT / 2) };
}

/**
 * Calculate horizontal layout for overlapping events in a day column.
 * Returns a map of event ID → { column, totalColumns } so events
 * sit side by side instead of stacking on top of each other.
 */
function layoutOverlappingEvents(
  events: CalendarEvent[]
): Map<string, { column: number; totalColumns: number }> {
  const layout = new Map<string, { column: number; totalColumns: number }>();
  if (events.length === 0) return layout;

  // Sort by start time, then by end time (longer events first)
  const sorted = [...events].sort((a, b) => {
    const diff =
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    if (diff !== 0) return diff;
    return new Date(b.endTime).getTime() - new Date(a.endTime).getTime();
  });

  // Group into overlap clusters
  const clusters: CalendarEvent[][] = [];
  let currentCluster: CalendarEvent[] = [sorted[0]];
  let clusterEnd = new Date(sorted[0].endTime).getTime();

  for (let i = 1; i < sorted.length; i++) {
    const eventStart = new Date(sorted[i].startTime).getTime();
    if (eventStart <= clusterEnd) {
      // Overlaps with current cluster (<=  handles zero-duration events at same time)
      currentCluster.push(sorted[i]);
      clusterEnd = Math.max(clusterEnd, new Date(sorted[i].endTime).getTime());
    } else {
      clusters.push(currentCluster);
      currentCluster = [sorted[i]];
      clusterEnd = new Date(sorted[i].endTime).getTime();
    }
  }
  clusters.push(currentCluster);

  // Assign columns within each cluster
  for (const cluster of clusters) {
    const columns: { end: number }[] = [];

    for (const event of cluster) {
      const start = new Date(event.startTime).getTime();

      // Find the first column where this event fits (no overlap)
      // Use strict < so zero-duration events at the same time get separate columns
      let col = columns.findIndex((c) => c.end < start);
      if (col === -1) {
        col = columns.length;
        columns.push({ end: 0 });
      }
      // Ensure zero-duration events occupy at least 1ms so subsequent events
      // at the same time don't reuse the same column
      const end = new Date(event.endTime).getTime();
      columns[col].end = Math.max(end, start + 1);

      layout.set(event.id, { column: col, totalColumns: 0 });
    }

    // Set totalColumns for all events in this cluster
    const totalCols = columns.length;
    for (const event of cluster) {
      const entry = layout.get(event.id)!;
      entry.totalColumns = totalCols;
    }
  }

  return layout;
}

// ============================================================
// Component
// ============================================================

export function WeekView({ initialDate }: { initialDate?: Date } = {}) {
  const timezone = useTimezone();
  const {
    events,
    isLoading,
    error,
    fetchEvents,
    syncCalendar,
    clearScheduled,
    createEvent,
    deleteEventSeries,
  } = useCalendarEvents();

  // Week start day preference: 0=Sunday, 1=Monday
  const [weekStartDay, setWeekStartDay] = useState(1);
  const [weekStart, setWeekStart] = useState(() => getWeekStart(initialDate ?? new Date(), 1));
  const [selectedDay, setSelectedDay] = useState(() => initialDate ?? new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [isDeletingSeries, setIsDeletingSeries] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Calendar hour boundaries + colors from user settings
  const [startHour, setStartHour] = useState(DEFAULT_START_HOUR);
  const [endHour, setEndHour] = useState(DEFAULT_END_HOUR);
  const [calendarColors, setCalendarColors] = useState<CalendarColors | null>(null);

  // Drag-and-drop state (desktop only, CC events only)
  const gridRef = useRef<HTMLDivElement>(null);
  const [dragEvent, setDragEvent] = useState<CalendarEvent | null>(null);
  const [dragGhost, setDragGhost] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [dragDayIdx, setDragDayIdx] = useState<number | null>(null);
  const [dragTimeSlot, setDragTimeSlot] = useState<number | null>(null);
  const dragOffsetY = useRef(0);
  const isDragging = useRef(false);

  const dayLabels = weekStartDay === 0 ? DAY_LABELS_SUNDAY : DAY_LABELS_MONDAY;

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setStartHour(data.calendarStartHour ?? DEFAULT_START_HOUR);
          setEndHour(data.calendarEndHour ?? DEFAULT_END_HOUR);
          const startDay = data.weekStartDay ?? 1;
          setWeekStartDay(startDay);
          if (data.calendarColors) setCalendarColors(data.calendarColors);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!initialDate) return;
    // Keep week/day anchored to the date selected from month view.
    setSelectedDay(initialDate);
    setWeekStart(getWeekStart(initialDate, weekStartDay));
  }, [initialDate, weekStartDay]);

  useEffect(() => {
    if (initialDate) return;
    setWeekStart(getWeekStart(selectedDay, weekStartDay));
  }, [initialDate, selectedDay, weekStartDay]);

  const totalSlots = (endHour - startHour) * 2;

  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);

  const weekEnd = useMemo(() => {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 7);
    return end;
  }, [weekStart]);

  // Fetch events when week changes
  useEffect(() => {
    fetchEvents(weekStart, weekEnd);
  }, [weekStart, weekEnd, fetchEvents]);

  // Group events by day (using stored timezone for correct day assignment)
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const day of weekDays) {
      map.set(dayKey(day, timezone), []);
    }
    for (const event of events) {
      const key = dayKey(new Date(event.startTime), timezone);
      if (map.has(key)) {
        map.get(key)!.push(event);
      }
    }
    return map;
  }, [events, weekDays, timezone]);

  // All-day events
  const allDayEvents = useMemo(
    () => events.filter((e) => e.isAllDay),
    [events]
  );

  // Timed events
  const timedEvents = useMemo(
    () => events.filter((e) => !e.isAllDay),
    [events]
  );

  const timedByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const day of weekDays) {
      map.set(dayKey(day, timezone), []);
    }
    for (const event of timedEvents) {
      const key = dayKey(new Date(event.startTime), timezone);
      if (map.has(key)) {
        map.get(key)!.push(event);
      }
    }
    return map;
  }, [timedEvents, weekDays]);

  const today = new Date();

  function navigateWeek(delta: number) {
    setWeekStart((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + delta * 7);
      return next;
    });
  }

  function goToToday() {
    setWeekStart(getWeekStart(new Date(), weekStartDay));
    setSelectedDay(new Date());
  }

  async function handleSync() {
    setIsSyncing(true);
    try {
      const result = await syncCalendar();
      const parts: string[] = [];
      if (result.canvas) parts.push(`${result.canvas.total} Canvas`);
      toast.success(
        parts.length > 0
          ? `Synced ${parts.join(" + ")} events!`
          : "Sync complete!"
      );
      await fetchEvents(weekStart, weekEnd);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setIsSyncing(false);
    }
  }

  // Count how many CC events are on the current view
  const scheduledCount = events.filter(
    (e) => e.source === "controlledchaos"
  ).length;

  async function handleClearScheduled() {
    setIsClearing(true);
    try {
      const result = await clearScheduled();
      toast.success(
        `Cleared ${result.deleted} scheduled event${result.deleted !== 1 ? "s" : ""}.`
      );
      setShowClearConfirm(false);
      await fetchEvents(weekStart, weekEnd);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to clear events"
      );
    } finally {
      setIsClearing(false);
    }
  }

  async function handleCreateEvent(input: Parameters<typeof createEvent>[0]) {
    const result = await createEvent(input);
    toast.success(
      result.count === 1
        ? "Event created!"
        : `Created ${result.count} events!`
    );
    await fetchEvents(weekStart, weekEnd);
    // Refetch after a short delay to pick up the AI-generated note
    setTimeout(() => fetchEvents(weekStart, weekEnd), 3000);
    return result;
  }

  async function handleDeleteSeries() {
    if (!selectedEvent?.seriesId) return;
    setIsDeletingSeries(true);
    try {
      const result = await deleteEventSeries(selectedEvent.id);
      toast.success(
        `Deleted ${result.deleted} event${result.deleted !== 1 ? "s" : ""} in series.`
      );
      setSelectedEvent(null);
      await fetchEvents(weekStart, weekEnd);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete series"
      );
    } finally {
      setIsDeletingSeries(false);
    }
  }

  async function handleDeleteEvent() {
    if (!selectedEvent) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/calendar/events/${selectedEvent.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete");
      }
      toast.success("Scheduled event removed.");
      setSelectedEvent(null);
      await fetchEvents(weekStart, weekEnd);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setIsDeleting(false);
    }
  }

  // ---- Drag-and-drop handlers (desktop, CC events only) ----

  const handleDragStart = useCallback(
    (e: React.PointerEvent, event: CalendarEvent) => {
      if (event.source !== "controlledchaos") return;
      e.preventDefault();
      e.stopPropagation();

      const target = e.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      dragOffsetY.current = e.clientY - rect.top;
      isDragging.current = false;

      const pos = eventPosition(event, startHour, timezone);
      const gridRect = gridRef.current?.getBoundingClientRect();
      if (!gridRect) return;

      setDragEvent(event);
      setDragGhost({
        top: rect.top - gridRect.top,
        left: rect.left - gridRect.left,
        width: rect.width,
        height: pos.height,
      });

      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [startHour]
  );

  const handleDragMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragEvent || !gridRef.current) return;

      isDragging.current = true;
      const gridRect = gridRef.current.getBoundingClientRect();

      // Time column is 4rem = 64px
      const timeColWidth = 64;
      const dayAreaWidth = gridRect.width - timeColWidth;
      const colWidth = dayAreaWidth / 7;

      const relX = e.clientX - gridRect.left - timeColWidth;
      const relY = e.clientY - gridRect.top - dragOffsetY.current;

      const dayIdx = Math.max(0, Math.min(6, Math.floor(relX / colWidth)));

      // Snap to 15-minute increments (half a slot = ROW_HEIGHT/2)
      const rawSlot = relY / ROW_HEIGHT;
      const snappedSlot = Math.round(rawSlot * 2) / 2; // Snap to 0.5 (15 min)
      const clampedSlot = Math.max(0, Math.min(snappedSlot, (endHour - startHour) * 2 - 1));

      setDragDayIdx(dayIdx);
      setDragTimeSlot(clampedSlot);

      const pos = eventPosition(dragEvent, startHour, timezone);
      setDragGhost({
        top: clampedSlot * ROW_HEIGHT,
        left: timeColWidth + dayIdx * colWidth + 2,
        width: colWidth - 4,
        height: pos.height,
      });
    },
    [dragEvent, startHour, endHour]
  );

  const handleDragEnd = useCallback(
    async (e: React.PointerEvent) => {
      if (!dragEvent) return;

      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);

      if (!isDragging.current || dragDayIdx === null || dragTimeSlot === null) {
        // No real drag — let the click handler fire
        setDragEvent(null);
        setDragGhost(null);
        setDragDayIdx(null);
        setDragTimeSlot(null);
        return;
      }

      // Calculate new start/end times (dragTimeSlot is in half-hour slots)
      const targetDay = weekDays[dragDayIdx];
      const hours = startHour + Math.floor(dragTimeSlot / 2);
      const minutes = (dragTimeSlot % 2) * 30;

      const originalStart = new Date(dragEvent.startTime);
      const originalEnd = new Date(dragEvent.endTime);
      const durationMs = originalEnd.getTime() - originalStart.getTime();

      const newStart = new Date(targetDay);
      newStart.setHours(hours, minutes, 0, 0);
      const newEnd = new Date(newStart.getTime() + durationMs);

      // Reset drag state
      setDragEvent(null);
      setDragGhost(null);
      setDragDayIdx(null);
      setDragTimeSlot(null);
      isDragging.current = false;

      // Skip if times haven't changed
      if (newStart.getTime() === originalStart.getTime()) return;

      // PATCH the event
      try {
        const res = await fetch(`/api/calendar/events/${dragEvent.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startTime: newStart.toISOString(),
            endTime: newEnd.toISOString(),
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to move event");
        }
        toast.success("Event moved!");
        await fetchEvents(weekStart, weekEnd);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to move event");
      }
    },
    [dragEvent, dragDayIdx, dragTimeSlot, weekDays, startHour, fetchEvents, weekStart, weekEnd]
  );

  // Time labels for the grid
  const timeLabels = useMemo(() => {
    const labels: string[] = [];
    for (let h = startHour; h < endHour; h++) {
      const hour = h % 12 === 0 ? 12 : h % 12;
      const ampm = h < 12 ? "am" : "pm";
      labels.push(`${hour}${ampm}`);
    }
    return labels;
  }, [startHour, endHour]);

  // Current time indicator position
  const currentTimeTop = useMemo(() => {
    const now = new Date();
    const local = toUserLocal(now, timezone);
    const slot = (local.hour - startHour) * 2 + local.minute / 30;
    if (slot < 0 || slot > totalSlots) return null;
    return slot * ROW_HEIGHT;
  }, [startHour, totalSlots, timezone]);

  // Is this week the current week?
  const isCurrentWeek = isSameDay(weekStart, getWeekStart(today, weekStartDay));

  // Events for the selected day (mobile)
  const selectedDayEvents = eventsByDay.get(dayKey(selectedDay, timezone)) ?? [];

  return (
    <div className="space-y-4">
      {/* Header: nav + actions */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {/* Navigation */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <div className="flex items-center rounded-lg border border-border/50 bg-card/50 p-0.5">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigateWeek(-1)} aria-label="Previous week">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={isCurrentWeek ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2.5 text-xs font-medium"
              onClick={goToToday}
            >
              Today
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigateWeek(1)} aria-label="Next week">
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
          <span className="hidden text-sm font-semibold sm:inline">
            {formatForDisplay(weekDays[0], timezone, { month: "long" })}{" "}
            {weekDays[0].getDate()} – {weekDays[6].getDate()}
            <span className="ml-1 font-normal text-muted-foreground">
              {weekDays[0].getFullYear()}
            </span>
          </span>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 border-border/50 px-3 text-xs"
            onClick={() => setShowCreateDialog(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Add Event</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 w-8 border-border/50 p-0" aria-label="More calendar options">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={handleSync}
                disabled={isSyncing}
              >
                {isSyncing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Sync Calendars
              </DropdownMenuItem>
              {scheduledCount > 0 && (
                <DropdownMenuItem
                  onClick={() => setShowClearConfirm(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clear Scheduled
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Mobile day selector (shown < md) */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-border/40 bg-card/50 p-1 md:hidden">
        {weekDays.map((day, i) => (
          <button
            key={day.toISOString()}
            onClick={() => setSelectedDay(day)}
            className={cn(
              "flex min-w-[3rem] flex-1 flex-col items-center rounded-lg px-1 py-2 text-xs transition-all",
              isSameDay(day, selectedDay)
                ? "bg-primary text-primary-foreground shadow-sm"
                : isSameDay(day, today)
                  ? "bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:bg-accent/50"
            )}
          >
            <span className="text-[10px] font-medium uppercase tracking-wider opacity-70">{dayLabels[i]}</span>
            <span className="mt-0.5 text-base font-bold">{day.getDate()}</span>
          </button>
        ))}
      </div>

      {/* Mobile: single day list */}
      <div className="md:hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading events...
          </div>
        ) : selectedDayEvents.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No events on{" "}
            {formatForDisplay(selectedDay, timezone, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </div>
        ) : (
          <div className="space-y-2">
            {selectedDayEvents.map((event) => (
              <button
                key={event.id}
                onClick={() => setSelectedEvent(event)}
                className={cn(
                  "w-full rounded-lg border-l-4 px-3 py-2 text-left transition-colors hover:bg-accent/50",
                  categoryColor(event.category as EventCategory, calendarColors)
                )}
              >
                <p className="text-sm font-medium">{event.title}</p>
                <p className="text-xs opacity-70">
                  {formatDateRange(
                    new Date(event.startTime),
                    new Date(event.endTime),
                    event.isAllDay,
                    timezone
                  )}
                  {event.location && ` · ${event.location}`}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Desktop: full week grid (hidden < md) */}
      <div className="hidden md:block">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading events...
          </div>
        ) : events.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/50 py-16 text-center">
            <Calendar className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium text-muted-foreground">
              No events this week
            </p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Sync your Canvas calendar in Settings to see your schedule.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border/50 bg-card/30">
            {/* Day headers */}
            <div className="grid grid-cols-[4rem_repeat(7,1fr)] border-b border-border/50 bg-card/60">
              <div /> {/* Time column spacer */}
              {weekDays.map((day, i) => (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "border-l border-border/30 px-2 py-2.5 text-center",
                    isSameDay(day, today) && "bg-primary/[0.06]"
                  )}
                >
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {dayLabels[i]}
                  </p>
                  <div className="mt-0.5 flex justify-center">
                    <span
                      className={cn(
                        "inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold",
                        isSameDay(day, today)
                          ? "bg-primary text-primary-foreground"
                          : "text-foreground"
                      )}
                    >
                      {day.getDate()}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* All-day events banner */}
            {allDayEvents.length > 0 && (
              <div className="grid grid-cols-[4rem_repeat(7,1fr)] border-b border-border/40">
                <div className="px-1 py-1 text-right text-[10px] font-medium text-muted-foreground/60">
                  all day
                </div>
                {weekDays.map((day) => {
                  const dayAllDay = allDayEvents.filter((e) =>
                    isSameDayTz(new Date(e.startTime), day, timezone)
                  );
                  return (
                    <div
                      key={day.toISOString()}
                      className="border-l border-border/30 px-1 py-1"
                    >
                      {dayAllDay.map((event) => (
                        <button
                          key={event.id}
                          onClick={() => setSelectedEvent(event)}
                          className={cn(
                            "mb-0.5 w-full rounded px-1.5 py-0.5 text-left text-[11px] font-medium",
                            categoryColor(event.category as EventCategory, calendarColors)
                          )}
                        >
                          {event.title}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Time grid */}
            <div
              ref={gridRef}
              className="relative grid grid-cols-[4rem_repeat(7,1fr)]"
              onPointerMove={handleDragMove}
              onPointerUp={handleDragEnd}
            >
              {/* Time labels */}
              <div className="relative">
                {timeLabels.map((label) => (
                  <div
                    key={label}
                    className="flex items-start justify-end border-b border-border/20 pr-2.5 pt-0.5 text-[10px] font-medium text-muted-foreground/60"
                    style={{ height: ROW_HEIGHT * 2 }}
                  >
                    {label}
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {weekDays.map((day) => {
                const dayEvents =
                  timedByDay.get(dayKey(day, timezone)) ?? [];
                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "relative border-l border-border/30",
                      isSameDay(day, today) && "bg-primary/[0.03]"
                    )}
                    style={{ height: totalSlots * ROW_HEIGHT }}
                  >
                    {/* Half-hour grid lines */}
                    {Array.from({ length: totalSlots }, (_, i) => (
                      <div
                        key={i}
                        className={cn(
                          "absolute w-full border-b",
                          i % 2 === 1
                            ? "border-border/30"
                            : "border-border/15"
                        )}
                        style={{ top: (i + 1) * ROW_HEIGHT }}
                      />
                    ))}

                    {/* Event blocks */}
                    {(() => {
                      const overlapLayout = layoutOverlappingEvents(dayEvents);
                      return dayEvents.map((event) => {
                        const pos = eventPosition(event, startHour, timezone);
                        const overlap = overlapLayout.get(event.id);
                        const col = overlap?.column ?? 0;
                        const totalCols = overlap?.totalColumns ?? 1;

                        // Calculate width and left offset for side-by-side layout
                        const widthPercent = 100 / totalCols;
                        const leftPercent = col * widthPercent;

                        const isCC = event.source === "controlledchaos";
                        const isBeingDragged = dragEvent?.id === event.id;

                        return (
                          <button
                            key={event.id}
                            onClick={() => {
                              if (!isDragging.current) setSelectedEvent(event);
                            }}
                            onPointerDown={isCC ? (e) => handleDragStart(e, event) : undefined}
                            className={cn(
                              "calendar-event-card absolute z-10 overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 text-left transition-all",
                              "hover:brightness-105 hover:shadow-md",
                              isCC && "cursor-grab active:cursor-grabbing",
                              isBeingDragged && "opacity-30",
                              categoryColor(event.category as EventCategory, calendarColors)
                            )}
                            style={{
                              top: pos.top,
                              height: pos.height,
                              left: `calc(${leftPercent}% + 2px)`,
                              width: `calc(${widthPercent}% - 4px)`,
                            }}
                          >
                            <p className="truncate text-[11px] font-semibold leading-tight">
                              {event.title}
                            </p>
                            {pos.height > ROW_HEIGHT && (
                              <p className="mt-0.5 truncate text-[10px] opacity-60">
                                {formatTimeTz(new Date(event.startTime), timezone)}
                              </p>
                            )}
                          </button>
                        );
                      });
                    })()}

                    {/* Current time indicator */}
                    {isSameDay(day, today) &&
                      isCurrentWeek &&
                      currentTimeTop !== null && (
                        <div
                          className="absolute inset-x-0 z-20 flex items-center"
                          style={{ top: currentTimeTop }}
                        >
                          <div className="current-time-dot relative h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]" />
                          <div className="h-[1.5px] flex-1 bg-red-500/80" />
                        </div>
                      )}
                  </div>
                );
              })}

              {/* Drag ghost overlay */}
              {dragEvent && dragGhost && (
                <div
                  className={cn(
                    "pointer-events-none absolute z-30 overflow-hidden rounded border-l-2 px-1 py-0.5 opacity-80 shadow-lg ring-2 ring-primary/50",
                    categoryColor(dragEvent.category as EventCategory, calendarColors)
                  )}
                  style={{
                    top: dragGhost.top,
                    left: dragGhost.left,
                    width: dragGhost.width,
                    height: dragGhost.height,
                  }}
                >
                  <p className="truncate text-[11px] font-medium leading-tight">
                    {dragEvent.title}
                  </p>
                  {dragTimeSlot !== null && (
                    <p className="truncate text-[10px] opacity-70">
                      {(() => {
                        const h = startHour + Math.floor(dragTimeSlot / 2);
                        const m = (dragTimeSlot % 2) * 30;
                        const hr = h % 12 === 0 ? 12 : h % 12;
                        const ampm = h < 12 ? "AM" : "PM";
                        return `${hr}:${String(Math.round(m)).padStart(2, "0")} ${ampm}`;
                      })()}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Event detail dialog */}
      <Dialog
        open={!!selectedEvent}
        onOpenChange={(open) => {
          if (!open) setSelectedEvent(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          {selectedEvent && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedEvent.title}</DialogTitle>
                <DialogDescription>
                  <span
                    className={cn(
                      "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium",
                      categoryColor(selectedEvent.category as EventCategory, calendarColors)
                    )}
                  >
                    {sourceLabel(selectedEvent.source as CalendarSource, selectedEvent.externalId)}
                  </span>
                  {selectedEvent.seriesId && (
                    <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      <Repeat className="mr-1 inline h-2.5 w-2.5" />
                      Series
                    </span>
                  )}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 pt-2">
                  <div className="flex items-start gap-3 text-sm">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div>
                      <p>
                        {formatDateRange(
                          new Date(selectedEvent.startTime),
                          new Date(selectedEvent.endTime),
                          selectedEvent.isAllDay,
                          timezone
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatForDisplay(new Date(selectedEvent.startTime), timezone, {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                  </div>

                  {selectedEvent.location && (
                    <div className="flex items-start gap-3 text-sm">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <p>{selectedEvent.location}</p>
                    </div>
                  )}

                  {selectedEvent.description && (
                    <div className="rounded-lg bg-muted/50 p-3 text-sm">
                      {selectedEvent.description}
                    </div>
                  )}

                  {/* Edit/Delete actions for CC-scheduled events */}
                  {selectedEvent.source === "controlledchaos" && (
                    <div className="flex items-center gap-2 border-t border-border pt-3">
                      <Button
                        onClick={() => {
                          setEditingEvent(selectedEvent);
                          setSelectedEvent(null);
                        }}
                        variant="outline"
                        size="sm"
                      >
                        <Pencil className="mr-2 h-3 w-3" />
                        Edit
                      </Button>
                      <Button
                        onClick={handleDeleteEvent}
                        disabled={isDeleting}
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                      >
                        {isDeleting ? (
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="mr-2 h-3 w-3" />
                        )}
                        Delete
                      </Button>
                      {selectedEvent.seriesId && (
                        <Button
                          onClick={handleDeleteSeries}
                          disabled={isDeletingSeries}
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-destructive"
                        >
                          {isDeletingSeries ? (
                            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          ) : (
                            <Repeat className="mr-2 h-3 w-3" />
                          )}
                          Delete Series
                        </Button>
                      )}
                    </div>
                  )}
                </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Clear all scheduled events confirmation */}
      <Dialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Clear All Scheduled Tasks
            </DialogTitle>
            <DialogDescription>
              This will remove all AI-scheduled events from your calendar. Manual events,
              brain dump events, and Canvas events will not be affected.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowClearConfirm(false)}
              disabled={isClearing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleClearScheduled}
              disabled={isClearing}
            >
              {isClearing ? (
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-3 w-3" />
              )}
              Clear All
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Event dialog */}
      <CreateEventDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSubmit={handleCreateEvent}
        defaultDate={selectedDay}
      />

      {/* Edit Event dialog */}
      <EditEventDialog
        event={editingEvent}
        onClose={() => setEditingEvent(null)}
        onSaved={async () => {
          setEditingEvent(null);
          await fetchEvents(weekStart, weekEnd);
        }}
        onDeleted={async () => {
          setEditingEvent(null);
          await fetchEvents(weekStart, weekEnd);
        }}
      />
    </div>
  );
}
