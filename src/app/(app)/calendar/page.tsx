"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { WeekView } from "@/components/features/calendar/week-view";
import { AgendaView } from "@/components/features/calendar/agenda-view";
import { MonthView } from "@/components/features/calendar/month-view";
import type { CalendarColors } from "@/types";

type CalendarView = "week" | "month";

function parseDateParam(raw: string | null): Date | undefined {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  // Anchor at midday local to avoid DST/off-by-one when views derive a date.
  const d = new Date(`${raw}T12:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default function CalendarPage() {
  const searchParams = useSearchParams();
  const initialFromUrl = parseDateParam(searchParams.get("date"));

  const [view, setView] = useState<CalendarView>("week");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(initialFromUrl);
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
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Calendar</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Your schedule — Canvas, AI blocks, and manual events.
          </p>
        </div>

        {/* View toggle */}
        <div className="flex w-full items-center gap-0.5 rounded-lg border border-border/50 bg-muted/50 p-0.5 sm:w-auto">
          {(["week", "month"] as CalendarView[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`flex-1 rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-all sm:flex-none ${
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
        <>
          <div className="md:hidden">
            <AgendaView initialDate={selectedDate} />
          </div>
          <div className="hidden md:block">
            <WeekView initialDate={selectedDate} />
          </div>
        </>
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
