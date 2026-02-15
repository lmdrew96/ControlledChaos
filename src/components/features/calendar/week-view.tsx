"use client";

import { useState, useEffect, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Loader2,
  MapPin,
  Clock,
  Calendar,
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
import { cn } from "@/lib/utils";
import { useCalendarEvents } from "@/hooks/use-calendar-events";
import type { CalendarEvent, CalendarSource } from "@/types";

// ============================================================
// Constants
// ============================================================
const START_HOUR = 7;
const END_HOUR = 22; // 10pm
const ROW_HEIGHT = 48; // px per 30-min slot
const TOTAL_SLOTS = (END_HOUR - START_HOUR) * 2;
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ============================================================
// Helpers
// ============================================================

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
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

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDateRange(start: Date, end: Date, isAllDay: boolean): string {
  if (isAllDay) return "All day";
  return `${formatTime(start)} – ${formatTime(end)}`;
}

function sourceColor(source: CalendarSource) {
  switch (source) {
    case "canvas":
      return "bg-blue-500/15 border-blue-500/50 text-blue-300";
    case "google":
      return "bg-green-500/15 border-green-500/50 text-green-300";
    case "controlledchaos":
      return "bg-purple-500/15 border-purple-500/50 text-purple-300";
    default:
      return "bg-muted border-border text-foreground";
  }
}

function sourceLabel(source: CalendarSource): string {
  switch (source) {
    case "canvas":
      return "Canvas";
    case "google":
      return "Google";
    case "controlledchaos":
      return "Scheduled";
    default:
      return source;
  }
}

function eventPosition(event: CalendarEvent) {
  const start = new Date(event.startTime);
  const end = new Date(event.endTime);

  const startSlot =
    (start.getHours() - START_HOUR) * 2 + start.getMinutes() / 30;
  const endSlot = (end.getHours() - START_HOUR) * 2 + end.getMinutes() / 30;

  const top = Math.max(0, startSlot) * ROW_HEIGHT;
  const height = Math.max(1, endSlot - Math.max(0, startSlot)) * ROW_HEIGHT;

  return { top, height: Math.max(height, ROW_HEIGHT / 2) };
}

// ============================================================
// Component
// ============================================================

export function WeekView() {
  const { events, isLoading, error, fetchEvents, syncCalendar } =
    useCalendarEvents();

  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null
  );
  const [isSyncing, setIsSyncing] = useState(false);

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

  // Group events by day
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const day of weekDays) {
      map.set(day.toDateString(), []);
    }
    for (const event of events) {
      const startDate = new Date(event.startTime);
      const key = startDate.toDateString();
      if (map.has(key)) {
        map.get(key)!.push(event);
      }
    }
    return map;
  }, [events, weekDays]);

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
      map.set(day.toDateString(), []);
    }
    for (const event of timedEvents) {
      const key = new Date(event.startTime).toDateString();
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
    const monday = getMonday(new Date());
    setWeekStart(monday);
    setSelectedDay(new Date());
  }

  async function handleSync() {
    setIsSyncing(true);
    try {
      const result = await syncCalendar();
      toast.success(`Synced ${result.total} events from Canvas!`);
      await fetchEvents(weekStart, weekEnd);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setIsSyncing(false);
    }
  }

  // Time labels for the grid
  const timeLabels = useMemo(() => {
    const labels: string[] = [];
    for (let h = START_HOUR; h < END_HOUR; h++) {
      const hour = h % 12 === 0 ? 12 : h % 12;
      const ampm = h < 12 ? "am" : "pm";
      labels.push(`${hour}${ampm}`);
    }
    return labels;
  }, []);

  // Current time indicator position
  const currentTimeTop = useMemo(() => {
    const now = new Date();
    const slot = (now.getHours() - START_HOUR) * 2 + now.getMinutes() / 30;
    if (slot < 0 || slot > TOTAL_SLOTS) return null;
    return slot * ROW_HEIGHT;
  }, []);

  // Is this week the current week?
  const isCurrentWeek = isSameDay(weekStart, getMonday(today));

  // Events for the selected day (mobile)
  const selectedDayEvents = eventsByDay.get(selectedDay.toDateString()) ?? [];

  return (
    <div className="space-y-4">
      {/* Header: nav + sync */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigateWeek(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant={isCurrentWeek ? "default" : "outline"}
            size="sm"
            onClick={goToToday}
          >
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={() => navigateWeek(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="ml-2 text-sm font-medium text-muted-foreground">
            {weekDays[0].toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}{" "}
            –{" "}
            {weekDays[6].toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleSync}
          disabled={isSyncing}
        >
          {isSyncing ? (
            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-3 w-3" />
          )}
          Sync
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Mobile day selector (shown < md) */}
      <div className="flex gap-1 overflow-x-auto md:hidden">
        {weekDays.map((day) => (
          <button
            key={day.toISOString()}
            onClick={() => setSelectedDay(day)}
            className={cn(
              "flex min-w-[3rem] flex-col items-center rounded-lg px-2 py-1.5 text-xs transition-colors",
              isSameDay(day, selectedDay)
                ? "bg-primary text-primary-foreground"
                : isSameDay(day, today)
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent"
            )}
          >
            <span className="font-medium">{DAY_LABELS[weekDays.indexOf(day)]}</span>
            <span className="text-lg font-bold">{day.getDate()}</span>
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
            {selectedDay.toLocaleDateString("en-US", {
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
                  sourceColor(event.source as CalendarSource)
                )}
              >
                <p className="text-sm font-medium">{event.title}</p>
                <p className="text-xs opacity-70">
                  {formatDateRange(
                    new Date(event.startTime),
                    new Date(event.endTime),
                    event.isAllDay
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
          <div className="rounded-lg border border-dashed border-border py-12 text-center">
            <Calendar className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No events this week.
            </p>
            <p className="text-xs text-muted-foreground">
              Sync your Canvas calendar in Settings to see your schedule.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            {/* Day headers */}
            <div className="grid grid-cols-[4rem_repeat(7,1fr)] border-b border-border bg-card">
              <div /> {/* Time column spacer */}
              {weekDays.map((day, i) => (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "border-l border-border px-2 py-2 text-center",
                    isSameDay(day, today) && "bg-primary/5"
                  )}
                >
                  <p className="text-xs text-muted-foreground">
                    {DAY_LABELS[i]}
                  </p>
                  <p
                    className={cn(
                      "text-lg font-bold",
                      isSameDay(day, today)
                        ? "text-primary"
                        : "text-foreground"
                    )}
                  >
                    {day.getDate()}
                  </p>
                </div>
              ))}
            </div>

            {/* All-day events banner */}
            {allDayEvents.length > 0 && (
              <div className="grid grid-cols-[4rem_repeat(7,1fr)] border-b border-border">
                <div className="px-1 py-1 text-right text-[10px] text-muted-foreground">
                  all day
                </div>
                {weekDays.map((day) => {
                  const dayAllDay = allDayEvents.filter((e) =>
                    isSameDay(new Date(e.startTime), day)
                  );
                  return (
                    <div
                      key={day.toISOString()}
                      className="border-l border-border px-1 py-1"
                    >
                      {dayAllDay.map((event) => (
                        <button
                          key={event.id}
                          onClick={() => setSelectedEvent(event)}
                          className={cn(
                            "mb-0.5 w-full rounded px-1.5 py-0.5 text-left text-[11px] font-medium",
                            sourceColor(event.source as CalendarSource)
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
            <div className="relative grid grid-cols-[4rem_repeat(7,1fr)]">
              {/* Time labels */}
              <div className="relative">
                {timeLabels.map((label, i) => (
                  <div
                    key={label}
                    className="flex items-start justify-end border-b border-border/50 pr-2 text-[10px] text-muted-foreground"
                    style={{ height: ROW_HEIGHT * 2 }}
                  >
                    {label}
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {weekDays.map((day) => {
                const dayEvents =
                  timedByDay.get(day.toDateString()) ?? [];
                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "relative border-l border-border",
                      isSameDay(day, today) && "bg-primary/[0.02]"
                    )}
                    style={{ height: TOTAL_SLOTS * ROW_HEIGHT }}
                  >
                    {/* Half-hour grid lines */}
                    {Array.from({ length: TOTAL_SLOTS }, (_, i) => (
                      <div
                        key={i}
                        className={cn(
                          "absolute w-full border-b",
                          i % 2 === 1
                            ? "border-border/50"
                            : "border-border/30"
                        )}
                        style={{ top: (i + 1) * ROW_HEIGHT }}
                      />
                    ))}

                    {/* Event blocks */}
                    {dayEvents.map((event) => {
                      const pos = eventPosition(event);
                      return (
                        <button
                          key={event.id}
                          onClick={() => setSelectedEvent(event)}
                          className={cn(
                            "absolute inset-x-1 z-10 overflow-hidden rounded border-l-2 px-1.5 py-0.5 text-left transition-opacity hover:opacity-80",
                            sourceColor(event.source as CalendarSource)
                          )}
                          style={{ top: pos.top, height: pos.height }}
                        >
                          <p className="truncate text-[11px] font-medium leading-tight">
                            {event.title}
                          </p>
                          {pos.height > ROW_HEIGHT && (
                            <p className="truncate text-[10px] opacity-70">
                              {formatTime(new Date(event.startTime))}
                            </p>
                          )}
                        </button>
                      );
                    })}

                    {/* Current time indicator */}
                    {isSameDay(day, today) &&
                      isCurrentWeek &&
                      currentTimeTop !== null && (
                        <div
                          className="absolute inset-x-0 z-20 flex items-center"
                          style={{ top: currentTimeTop }}
                        >
                          <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
                          <div className="h-[2px] flex-1 bg-red-500" />
                        </div>
                      )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Event detail dialog */}
      <Dialog
        open={!!selectedEvent}
        onOpenChange={(open) => !open && setSelectedEvent(null)}
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
                      sourceColor(selectedEvent.source as CalendarSource)
                    )}
                  >
                    {sourceLabel(selectedEvent.source as CalendarSource)}
                  </span>
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
                        selectedEvent.isAllDay
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(selectedEvent.startTime).toLocaleDateString(
                        "en-US",
                        {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        }
                      )}
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
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
