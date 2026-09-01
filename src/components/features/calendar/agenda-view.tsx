"use client";

import { useState, useEffect, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Loader2,
  MapPin,
  Clock,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useCalendarEvents } from "@/hooks/use-calendar-events";
import { CreateEventDialog } from "./create-event-dialog";
import { EditEventDialog } from "./edit-event-dialog";
import { categoryColor } from "@/lib/calendar/colors";
import type {
  CalendarEvent,
  CalendarSource,
  EventCategory,
  PlanBlock,
} from "@/types";
import {
  formatForDisplay,
  DISPLAY_TIME,
  getCalendarParts,
  startOfDayInTimezone,
} from "@/lib/timezone";
import {
  useCalendarSettings,
  DEFAULT_WEEK_START_DAY,
} from "@/hooks/use-calendar-settings";

const DAY_LABELS_MONDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_LABELS_SUNDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getWeekStart(date: Date, startDay: number = 1): Date {
  const d = new Date(date);
  const day = d.getDay();
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

function dayKey(date: Date, tz: string): string {
  const { year, month, day } = getCalendarParts(date, tz);
  return `${year}-${month}-${day}`;
}

function formatTimeTz(date: Date, timezone: string): string {
  return formatForDisplay(date, timezone, DISPLAY_TIME);
}

function formatDateRange(
  start: Date,
  end: Date,
  isAllDay: boolean,
  timezone: string
): string {
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

/** Matches week-view, so hovering either surface feels the same. */
const TOOLTIP_DELAY_MS = 350;

export function AgendaView({ initialDate }: { initialDate?: Date } = {}) {
  const {
    events,
    planBlocks,
    isLoading,
    error,
    fetchEvents,
    syncCalendar,
    clearTodaysPlan,
    createEvent,
    deleteEventSeries,
  } = useCalendarEvents();

  const { settings, isLoaded: settingsLoaded } = useCalendarSettings();
  const { weekStartDay, calendarColors, timezone } = settings;
  const [weekStart, setWeekStart] = useState(() =>
    getWeekStart(initialDate ?? new Date(), DEFAULT_WEEK_START_DAY)
  );
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [isDeletingSeries, setIsDeletingSeries] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const dayLabels = weekStartDay === 0 ? DAY_LABELS_SUNDAY : DAY_LABELS_MONDAY;

  useEffect(() => {
    if (!initialDate) return;
    setWeekStart(getWeekStart(initialDate, weekStartDay));
  }, [initialDate, weekStartDay]);

  // Kept for navigation, not for settings: the list is gated on settingsLoaded
  // now, so weekStartDay no longer arrives mid-render and drags the labels out
  // of sync with the dates.
  useEffect(() => {
    if (initialDate) return;
    setWeekStart((prev) => getWeekStart(prev, weekStartDay));
  }, [initialDate, weekStartDay]);

  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);

  const weekEnd = useMemo(() => {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 7);
    return end;
  }, [weekStart]);

  useEffect(() => {
    void fetchEvents(weekStart, weekEnd);
  }, [weekStart, weekEnd, fetchEvents]);

  const planByDay = useMemo(() => {
    const map = new Map<string, PlanBlock[]>();
    for (const day of weekDays) {
      map.set(dayKey(day, timezone), []);
    }
    for (const block of planBlocks) {
      map.get(dayKey(new Date(block.startTime), timezone))?.push(block);
    }
    return map;
  }, [planBlocks, weekDays, timezone]);

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
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.isAllDay && !b.isAllDay) return -1;
        if (!a.isAllDay && b.isAllDay) return 1;
        return (
          new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
        );
      });
    }
    return map;
  }, [events, weekDays, timezone]);

  const today = new Date();
  const isCurrentWeek = isSameDay(weekStart, getWeekStart(today, weekStartDay));

  function navigateWeek(delta: number) {
    setWeekStart((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + delta * 7);
      return next;
    });
  }

  function goToToday() {
    setWeekStart(getWeekStart(new Date(), weekStartDay));
  }

  async function handleSync() {
    setIsSyncing(true);
    try {
      const result = await syncCalendar();
      const parts: string[] = [];
      if (result.canvas) parts.push(`${result.canvas.total} Canvas`);
      toast.success(
        parts.length > 0 ? `Synced ${parts.join(" + ")} events!` : "Sync complete!"
      );
      await fetchEvents(weekStart, weekEnd);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setIsSyncing(false);
    }
  }

  // Plan blocks are tasks with a scheduledFor, not calendar events. Only
  // today's are clearable — a plan is an intention for one specific day.
  const todayStart = startOfDayInTimezone(new Date(), timezone);
  const todayEnd = new Date(todayStart.getTime() + 24 * 3_600_000);
  const scheduledCount = planBlocks.filter((b) => {
    const at = new Date(b.startTime);
    return at >= todayStart && at < todayEnd;
  }).length;

  async function handleClearScheduled() {
    setIsClearing(true);
    try {
      const result = await clearTodaysPlan();
      toast.success(
        result.cleared === 1
          ? "Cleared 1 planned block."
          : `Cleared ${result.cleared} planned blocks.`
      );
      setShowClearConfirm(false);
      await fetchEvents(weekStart, weekEnd);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to clear today's plan"
      );
    } finally {
      setIsClearing(false);
    }
  }

  async function handleCreateEvent(input: Parameters<typeof createEvent>[0]) {
    const result = await createEvent(input);
    toast.success(
      result.count === 1 ? "Event created!" : `Created ${result.count} events!`
    );
    await fetchEvents(weekStart, weekEnd);
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

  return (
    <div className="space-y-4">
      {/* Header: nav + actions */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border border-border/50 bg-card/50 p-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => navigateWeek(-1)}
              aria-label="Previous week"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant={isCurrentWeek ? "default" : "ghost"}
              size="sm"
              className="h-9 px-3 text-xs font-medium"
              onClick={goToToday}
            >
              Today
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => navigateWeek(1)}
              aria-label="Next week"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <span className="text-sm font-semibold">
            {formatForDisplay(weekDays[0], timezone, { month: "short" })}{" "}
            {weekDays[0].getDate()} – {weekDays[6].getDate()}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 border-border/50 px-3 text-xs"
            onClick={() => setShowCreateDialog(true)}
          >
            <Plus className="h-4 w-4" />
            Add Event
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-9 border-border/50 p-0"
                aria-label="More calendar options"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleSync} disabled={isSyncing}>
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
                  Clear today&apos;s plan
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

      {/* Day-by-day agenda */}
      {isLoading || !settingsLoaded ? (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading events...
        </div>
      ) : (
        <div className="space-y-5">
          {weekDays.map((day, i) => {
            const dayEvents = eventsByDay.get(dayKey(day, timezone)) ?? [];
            const dayPlans = planByDay.get(dayKey(day, timezone)) ?? [];
            // Events and plan blocks share one time-ordered list so the day
            // reads chronologically, but they stay visually distinct: a
            // commitment is filled and tappable, an intention is dashed.
            const dayItems = [
              ...dayEvents.map((e) => ({
                kind: "event" as const,
                at: e.isAllDay ? -Infinity : new Date(e.startTime).getTime(),
                event: e,
              })),
              ...dayPlans.map((p) => ({
                kind: "plan" as const,
                at: new Date(p.startTime).getTime(),
                plan: p,
              })),
            ].sort((a, b) => a.at - b.at);
            const isToday = isSameDay(day, today);
            return (
              <section key={day.toISOString()} className="space-y-2">
                <div
                  className={cn(
                    "sticky top-0 z-10 flex items-center gap-3 border-b py-2 backdrop-blur-sm",
                    "bg-background/95",
                    isToday ? "border-primary/40" : "border-border/40"
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex h-9 w-9 items-center justify-center rounded-full text-base font-bold tabular-nums",
                      isToday
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/60 text-foreground"
                    )}
                  >
                    {day.getDate()}
                  </span>
                  <div className="flex flex-col leading-tight">
                    <span
                      className={cn(
                        "text-xs font-semibold uppercase tracking-wider",
                        isToday ? "text-primary" : "text-muted-foreground"
                      )}
                    >
                      {dayLabels[i]}
                      {isToday && " · Today"}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {formatForDisplay(day, timezone, { month: "short" })}
                    </span>
                  </div>
                </div>

                {dayItems.length === 0 ? (
                  <p className="pl-12 text-xs italic text-muted-foreground/50">
                    Free day
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {dayItems.map((item) =>
                      item.kind === "plan" ? (
                        <li key={`plan-${item.plan.taskId}`}>
                          <div
                            className={cn(
                              "w-full rounded-lg border-2 border-dashed px-3 py-2.5 text-left",
                              "border-adhd-purple/55 bg-adhd-purple/[0.07]",
                              "dark:border-adhd-lavender/55 dark:bg-adhd-lavender/[0.10]"
                            )}
                          >
                            <div className="flex items-baseline gap-3">
                              <span className="min-w-[3.5rem] shrink-0 text-xs font-medium tabular-nums text-adhd-purple/80 dark:text-adhd-lavender/80">
                                {formatTimeTz(new Date(item.plan.startTime), timezone)}
                              </span>
                              <Tooltip delayDuration={TOOLTIP_DELAY_MS}>
                                <TooltipTrigger asChild>
                                  {/* Focusable so a truncated title is readable
                                      by keyboard too, not only on hover. */}
                                  <span
                                    tabIndex={0}
                                    className="flex-1 truncate text-sm font-medium text-adhd-purple outline-none focus-visible:ring-2 focus-visible:ring-primary/60 dark:text-adhd-lavender"
                                  >
                                    {item.plan.title}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs">
                                  <p className="text-[10px] font-medium uppercase tracking-wider opacity-60">
                                    Planned
                                  </p>
                                  <p className="font-medium">{item.plan.title}</p>
                                  <p className="opacity-75">{item.plan.minutes} min</p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                            <p className="ml-[3.875rem] mt-0.5 text-[11px] text-adhd-purple/70 dark:text-adhd-lavender/70">
                              Planned · {item.plan.minutes} min
                            </p>
                          </div>
                        </li>
                      ) : (
                        <li key={item.event.id}>
                          <button
                            onClick={() => setSelectedEvent(item.event)}
                            className={cn(
                              "w-full rounded-lg border-l-4 px-3 py-2.5 text-left transition-all hover:brightness-110 active:brightness-95",
                              categoryColor(
                                item.event.category as EventCategory,
                                calendarColors
                              )
                            )}
                          >
                            <div className="flex items-baseline gap-3">
                              <span className="min-w-[3.5rem] shrink-0 text-xs font-medium tabular-nums opacity-80">
                                {item.event.isAllDay
                                  ? "All day"
                                  : formatTimeTz(
                                      new Date(item.event.startTime),
                                      timezone
                                    )}
                              </span>
                              <Tooltip delayDuration={TOOLTIP_DELAY_MS}>
                                <TooltipTrigger asChild>
                                  <span className="flex-1 truncate text-sm font-medium">
                                    {item.event.title}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs">
                                  <p className="font-medium">{item.event.title}</p>
                                  {item.event.location && (
                                    <p className="opacity-75">{item.event.location}</p>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            </div>
                            {item.event.location && (
                              <Tooltip delayDuration={TOOLTIP_DELAY_MS}>
                                <TooltipTrigger asChild>
                                  <p className="ml-[3.875rem] mt-0.5 truncate text-[11px] opacity-60">
                                    {item.event.location}
                                  </p>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs">
                                  {item.event.location}
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </button>
                        </li>
                      )
                    )}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

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
                <DialogDescription className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium",
                      categoryColor(
                        selectedEvent.category as EventCategory,
                        calendarColors
                      )
                    )}
                  >
                    {sourceLabel(
                      selectedEvent.source as CalendarSource,
                      selectedEvent.externalId
                    )}
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
                      {formatForDisplay(
                        new Date(selectedEvent.startTime),
                        timezone,
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

                {selectedEvent.source === "controlledchaos" && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
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

      {/* Clear confirmation */}
      <Dialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Clear today&apos;s plan
            </DialogTitle>
            <DialogDescription>
              Unschedules everything you planned for today. The tasks stay
              exactly where they are — only their planned times are removed.
              Real events are untouched.
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
              Clear plan
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <CreateEventDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSubmit={handleCreateEvent}
        defaultDate={initialDate ?? new Date()}
      />

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
