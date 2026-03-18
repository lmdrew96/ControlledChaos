"use client";

import { useState } from "react";
import { WeekView } from "@/components/features/calendar/week-view";
import { MonthView } from "@/components/features/calendar/month-view";

type CalendarView = "week" | "month";

export default function CalendarPage() {
  const [view, setView] = useState<CalendarView>("week");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  function handleDayClick(date: Date) {
    setSelectedDate(date);
    setView("week");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
          <p className="text-muted-foreground">
            Your schedule — Canvas, AI blocks, and manual events.
          </p>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
          {(["week", "month"] as CalendarView[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
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
        />
      )}
    </div>
  );
}
