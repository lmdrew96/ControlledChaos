"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

interface Stats {
  completedToday: number;
  completedThisWeek: number;
  daily: Array<{ date: string; count: number }>;
  weekStartDate: string;
}

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

interface DailyMomentumProps {
  onOpenDetails: () => void;
}

export function DailyMomentum({ onOpenDetails }: DailyMomentumProps) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats/momentum")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setStats(data);
      })
      .catch(() => {});
  }, []);

  if (!stats) {
    return (
      <div className="flex items-end gap-2" aria-label="Momentum loading">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-5 w-2 rounded-sm bg-muted" />
        ))}
        <div className="ml-2 h-3 w-24 rounded bg-muted/70" />
      </div>
    );
  }

  // Build current-week bars (Mon–Sun)
  const weekDays = stats.daily.filter((d) => d.date >= stats.weekStartDate);
  const weekStart = new Date(stats.weekStartDate + "T12:00:00");
  const currentWeek: Array<{ date: string; count: number }> = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const existing = weekDays.find((wd) => wd.date === dateStr);
    currentWeek.push({ date: dateStr, count: existing?.count ?? 0 });
  }
  const maxCount = Math.max(...currentWeek.map((d) => d.count), 1);
  const todayDate = stats.daily[stats.daily.length - 1]?.date;

  return (
    <button
      type="button"
      onClick={onOpenDetails}
      className="group flex items-center gap-3 rounded-md px-2 py-1.5 -mx-2 -my-1.5 transition-colors hover:bg-accent/40"
      aria-label="View momentum details"
    >
      <div className="flex items-end gap-1" aria-hidden>
        {currentWeek.map((d, i) => {
          const isToday = d.date === todayDate;
          const barHeight = d.count > 0 ? Math.max((d.count / maxCount) * 28, 4) : 4;
          return (
            <div key={d.date} className="flex flex-col items-center gap-0.5">
              <div
                className={`w-2 rounded-sm transition-all duration-300 ${
                  d.count > 0 ? "bg-adhd-amber/80" : "bg-muted-foreground/15"
                }`}
                style={{ height: barHeight, transitionDelay: `${i * 30}ms` }}
              />
              <span
                className={`text-[9px] leading-none text-muted-foreground ${
                  isToday ? "font-semibold text-foreground" : ""
                }`}
              >
                {DAY_LABELS[i]}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        <Badge variant="sticky" className="-rotate-2 tabular-nums">
          {stats.completedToday} today
        </Badge>
        <Badge variant="sticky" className="rotate-1 bg-adhd-lavender tabular-nums">
          {stats.completedThisWeek} this week
        </Badge>
      </div>
    </button>
  );
}
