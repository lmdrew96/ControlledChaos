"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { categoryHex } from "@/lib/calendar/colors";
import { formatForDisplay, DISPLAY_DATE } from "@/lib/timezone";
import { useTimezone } from "@/hooks/use-timezone";
import type { EventCategory } from "@/types";
import type { MomentumStats } from "@/lib/db/queries";
import { CircadianSignature } from "./_components/circadian-signature";
import { TaskMarination } from "./_components/task-marination";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatWeekRange(weekStartDate: string): string {
  const start = new Date(weekStartDate + "T12:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  return `${fmt.format(start)}\u2013${fmt.format(end)}`;
}

function formatBiggestDayDate(dateStr: string, timezone: string): string {
  const date = new Date(dateStr + "T12:00:00");
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) {
    return formatForDisplay(date, timezone, { weekday: "long" });
  }
  if (diffDays < 14) {
    return `Last ${formatForDisplay(date, timezone, { weekday: "long" })}`;
  }
  return formatForDisplay(date, timezone, DISPLAY_DATE);
}

function todaySubtitle(count: number): string {
  if (count === 0) return "Ready when you are";
  if (count <= 2) return "Getting started";
  if (count <= 5) return "Nice momentum";
  return "On a roll";
}

export default function MomentumPage() {
  const timezone = useTimezone();
  const [stats, setStats] = useState<MomentumStats | null>(null);

  useEffect(() => {
    fetch("/api/stats/momentum")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data) setStats(data); })
      .catch(() => {});
  }, []);

  if (!stats) return null;

  // Today is always the last entry in the daily array (server computes in user TZ)
  const todayStr = stats.daily[stats.daily.length - 1]?.date ?? "";

  // Current week bars: filter daily entries from weekStartDate through end of week
  const weekDays = stats.daily.filter((d) => d.date >= stats.weekStartDate);
  // Pad to 7 days if the week just started (fill future days with 0)
  const currentWeek: Array<{ date: string; count: number }> = [];
  const weekStart = new Date(stats.weekStartDate + "T12:00:00");
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const existing = weekDays.find((wd) => wd.date === dateStr);
    currentWeek.push({ date: dateStr, count: existing?.count ?? 0 });
  }
  const maxDailyCount = Math.max(...currentWeek.map((d) => d.count), 1);

  const maxCategoryCount = Math.max(
    ...stats.byCategory.map((c) => c.count),
    1
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Your momentum</h1>
        <span className="text-sm text-muted-foreground">
          This week &middot; {formatWeekRange(stats.weekStartDate)}
        </span>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Today</p>
            <p className="text-2xl font-bold">{stats.completedToday}</p>
            <p className="text-xs text-muted-foreground">
              {todaySubtitle(stats.completedToday)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">This week</p>
            <p className="text-2xl font-bold">{stats.completedThisWeek}</p>
            <p className="text-xs text-muted-foreground">
              {stats.completedAllTime} all time
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Biggest day</p>
            <p className="text-2xl font-bold">
              {stats.biggestDay?.count ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">
              {stats.biggestDay
                ? formatBiggestDayDate(stats.biggestDay.date, timezone)
                : "No data yet"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Avg / day</p>
            <p className="text-2xl font-bold">
              {stats.avgPerActiveDay.toFixed(1)}
            </p>
            <p className="text-xs text-muted-foreground">On active days</p>
          </CardContent>
        </Card>
      </div>

      {/* Daily bar chart */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-end justify-between gap-2" style={{ height: 140 }}>
            {currentWeek.map((d) => {
              const isToday = d.date === todayStr;
              const barHeight =
                d.count > 0
                  ? Math.max((d.count / maxDailyCount) * 120, 4)
                  : 4;
              const dayIndex = new Date(d.date + "T12:00:00").getDay();
              // Convert JS getDay (0=Sun) to Mon-based index
              const monIndex = dayIndex === 0 ? 6 : dayIndex - 1;
              return (
                <div
                  key={d.date}
                  className="flex flex-1 flex-col items-center gap-1"
                >
                  {d.count > 0 && (
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {d.count}
                    </span>
                  )}
                  <div
                    className={`w-full max-w-10 rounded-md transition-all ${
                      d.count > 0
                        ? "bg-orange-400/80"
                        : "bg-secondary"
                    }`}
                    style={{ height: barHeight }}
                  />
                  <span
                    className={`text-xs ${
                      isToday
                        ? "font-medium text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {isToday ? "Today" : DAY_LABELS[monIndex]}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Two-column section */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Left column */}
        <div className="space-y-4">
          {/* Circadian Signature (all-time hour × day heatmap) */}
          <CircadianSignature hourlyHeatmap={stats.hourlyHeatmap} />

          {/* Energy chips */}
          <Card>
            <CardContent className="p-5">
              <h3 className="mb-3 text-sm font-medium">Energy spent</h3>
              <div className="flex gap-3">
                <div className="flex-1 rounded-lg bg-green-500/10 p-3 text-center">
                  <p className="text-xl font-bold text-green-600 dark:text-green-400">
                    {stats.byEnergy.low}
                  </p>
                  <p className="text-xs text-muted-foreground">Low</p>
                </div>
                <div className="flex-1 rounded-lg bg-orange-500/10 p-3 text-center">
                  <p className="text-xl font-bold text-orange-600 dark:text-orange-400">
                    {stats.byEnergy.medium}
                  </p>
                  <p className="text-xs text-muted-foreground">Medium</p>
                </div>
                <div className="flex-1 rounded-lg bg-red-500/10 p-3 text-center">
                  <p className="text-xl font-bold text-red-600 dark:text-red-400">
                    {stats.byEnergy.high}
                  </p>
                  <p className="text-xs text-muted-foreground">High</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Category bars */}
          {stats.byCategory.length > 0 && (
            <Card>
              <CardContent className="p-5">
                <h3 className="mb-3 text-sm font-medium">By category</h3>
                <div className="space-y-2.5">
                  {stats.byCategory.map((cat) => {
                    const hex = categoryHex(
                      cat.category as EventCategory | null,
                      stats.calendarColors
                    );
                    const widthPct = (cat.count / maxCategoryCount) * 100;
                    return (
                      <div key={cat.category ?? "none"} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="capitalize text-muted-foreground">
                            {cat.category ?? "Uncategorized"}
                          </span>
                          <span className="tabular-nums font-medium">
                            {cat.count}
                          </span>
                        </div>
                        <div className="h-2.5 w-full rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${widthPct}%`,
                              backgroundColor: hex.solid,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Wins */}
          {stats.wins.length > 0 && (
            <Card>
              <CardContent className="p-5">
                <h3 className="mb-3 text-sm font-medium">
                  This week&apos;s wins
                </h3>
                <div className="space-y-2">
                  {stats.wins.map((win, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 rounded-lg bg-muted/50 px-3 py-2.5"
                    >
                      <span className="text-lg">{win.icon}</span>
                      <div>
                        <p className="text-sm font-medium">{win.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {win.subtitle}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Task Marination — full width below the two-column section */}
      <TaskMarination marination={stats.marination} />
    </div>
  );
}
