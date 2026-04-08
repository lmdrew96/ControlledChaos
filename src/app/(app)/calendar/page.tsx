"use client";

import { useState, useEffect } from "react";
import { WeekView } from "@/components/features/calendar/week-view";
import { MonthView } from "@/components/features/calendar/month-view";
import type { CalendarColors } from "@/types";

type CalendarView = "week" | "month";

export default function CalendarPage() {
  const [view, setView] = useState<CalendarView>("week");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [weekStartDay, setWeekStartDay] = useState(1);
  const [calendarColors, setCalendarColors] = useState<CalendarColors | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          if (data.weekStartDay != null) setWeekStartDay(data.weekStartDay);
          if (data.calendarColors) setCalendarColors(data.calendarColors);
        }
      })
      .catch(() => {});
  }, []);

  function handleDayClick(date: Date) {
    setSelectedDate(date);
    setView("week");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
          <p className="text-muted-foreground">
            Your schedule — Canvas, AI blocks, and manual events.
          </p>
        </div>

        {/* View toggle */}
        <div className="flex w-full items-center gap-1 rounded-lg bg-muted p-1 sm:w-auto">
          {(["week", "month"] as CalendarView[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors sm:flex-none ${
                view === v
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {view === "week" ? (
        <WeekView initialDate={selectedDate} />
      ) : (
        <MonthView
          initialDate={selectedDate}
          onDayClick={handleDayClick}
          weekStartDay={weekStartDay}
          calendarColors={calendarColors}
        />
      )}
    </div>
  );
}
