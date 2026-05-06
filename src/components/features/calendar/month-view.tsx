"use client";

import { useState, useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCalendarEvents } from "@/hooks/use-calendar-events";
import { categoryDotColor, categoryPillColor } from "@/lib/calendar/colors";
import type { CalendarColors, EventCategory } from "@/types";

interface MonthViewProps {
  initialDate?: Date;
  onDayClick: (date: Date) => void;
  weekStartDay?: number; // 0=Sunday, 1=Monday
  calendarColors?: CalendarColors | null;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/** Returns the grid of weeks (array of 7-day arrays) for a given month */
function buildMonthGrid(month: Date, weekStartDay: number): Date[][] {
  const first = startOfMonth(month);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);

  // Find the start of the first week displayed
  const gridStart = new Date(first);
  const firstDow = first.getDay(); // 0=Sun, 1=Mon, ...
  const offset = (firstDow - weekStartDay + 7) % 7;
  gridStart.setDate(gridStart.getDate() - offset);

  const weeks: Date[][] = [];
  const cursor = new Date(gridStart);

  while (cursor <= last || weeks.length < 6) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
    if (weeks.length >= 6) break;
  }

  return weeks;
}


const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_HEADERS_MONDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_HEADERS_SUNDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function MonthView({ initialDate, onDayClick, weekStartDay = 1, calendarColors }: MonthViewProps) {
  const [currentMonth, setCurrentMonth] = useState(() =>
    startOfMonth(initialDate ?? new Date())
  );

  const today = useMemo(() => new Date(), []);

  const weeks = useMemo(
    () => buildMonthGrid(currentMonth, weekStartDay),
    [currentMonth, weekStartDay]
  );

  // Compute the date range we need events for
  const gridStart = weeks[0][0];
  const gridEnd = weeks[weeks.length - 1][6];

  const { events, fetchEvents, isLoading } = useCalendarEvents();

  useEffect(() => {
    // Add a day buffer on each side
    const start = new Date(gridStart);
    start.setDate(start.getDate() - 1);
    const end = new Date(gridEnd);
    end.setDate(end.getDate() + 1);
    fetchEvents(start, end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonth]);

  // Group events by day (keyed by YYYY-MM-DD)
  const eventsByDay = useMemo(() => {
    const map = new Map<string, typeof events>();
    for (const event of events) {
      const d = new Date(event.startTime);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(event);
    }
    return map;
  }, [events]);

  function dayKey(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }

  function navigate(delta: number) {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  const dayHeaders = weekStartDay === 0 ? DAY_HEADERS_SUNDAY : DAY_HEADERS_MONDAY;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-base font-semibold w-44 text-center">
            {MONTH_NAMES[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </h2>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => navigate(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground"
          onClick={() => setCurrentMonth(startOfMonth(new Date()))}
        >
          Today
        </Button>
      </div>

      {/* Grid */}
      <div className="rounded-lg border border-border overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-border bg-muted/40">
          {dayHeaders.map((label) => (
            <div
              key={label}
              className="py-2 text-center text-xs font-medium text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>

        {/* Week rows */}
        {weeks.map((week, wi) => (
          <div
            key={wi}
            className={cn(
              "grid grid-cols-7",
              wi < weeks.length - 1 && "border-b border-border"
            )}
          >
            {week.map((day, di) => {
              const isToday = isSameDay(day, today);
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const dayEvents = eventsByDay.get(dayKey(day)) ?? [];
              const visible = dayEvents.slice(0, 3);
              const overflow = dayEvents.length - visible.length;

              return (
                <button
                  key={di}
                  onClick={() => onDayClick(day)}
                  className={cn(
                    "min-h-[80px] p-1.5 text-left flex flex-col gap-0.5 transition-colors hover:bg-muted/50",
                    di < 6 && "border-r border-border",
                    !isCurrentMonth && "opacity-40"
                  )}
                >
                  {/* Day number */}
                  <span
                    className={cn(
                      "text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-0.5 shrink-0",
                      isToday
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground"
                    )}
                  >
                    {day.getDate()}
                  </span>

                  {/* Event chips */}
                  {isLoading ? null : (
                    <>
                      {visible.map((event) => (
                        <span
                          key={event.id}
                          className={cn(
                            "flex items-center gap-1 text-[10px] rounded px-1 py-0.5 truncate w-full",
                            categoryPillColor(event.category as EventCategory, calendarColors)
                          )}
                        >
                          <span
                            className={cn(
                              "w-1.5 h-1.5 rounded-full shrink-0",
                              categoryDotColor(event.category as EventCategory, calendarColors)
                            )}
                          />
                          <span className="truncate">{event.title.replace(/^\[CC\] /, "")}</span>
                        </span>
                      ))}
                      {overflow > 0 && (
                        <span className="text-[10px] text-muted-foreground px-1">
                          +{overflow} more
                        </span>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
