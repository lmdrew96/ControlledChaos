"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { categoryHex } from "@/lib/calendar/colors";
import type { CalendarColors, EventCategory } from "@/types";
import type { MomentumStats } from "@/lib/db/queries";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const TIME_BLOCKS = ["morning", "afternoon", "evening", "night"] as const;
const TIME_LABELS: Record<string, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  night: "Night",
};

// Orange intensity ramp for heatmap: 1/2/3/4+ completions (0 uses CSS class)
const HEATMAP_FILLS = [
  "", // 0: handled by CSS class
  "rgba(249,115,22,0.12)",
  "rgba(249,115,22,0.25)",
  "rgba(249,115,22,0.45)",
  "rgba(249,115,22,0.7)",
];

function heatmapStyle(count: number): { backgroundColor?: string } {
  if (count === 0) return {};
  return { backgroundColor: HEATMAP_FILLS[Math.min(count, 4)] };
}

function formatWeekRange(daily: Array<{ date: string }>): string {
  // Find the start of the current week (last 7 entries)
  const last7 = daily.slice(-7);
  if (last7.length === 0) return "";
  const start = new Date(last7[0].date + "T12:00:00");
  const end = new Date(last7[last7.length - 1].date + "T12:00:00");
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  return `${fmt.format(start)}\u2013${fmt.format(end)}`;
}

function generateInsight(
  heatmap: MomentumStats["heatmap"],
  completedThisWeek: number
): string | null {
  if (completedThisWeek < 5) return null;
  if (heatmap.length === 0) return null;

  const maxCell = heatmap.reduce((best, cell) =>
    cell.count > best.count ? cell : best
  );
  if (maxCell.count === 0) return null;

  // Check if all cells are roughly equal (no clear pattern)
  const total = heatmap.reduce((s, c) => s + c.count, 0);
  const avg = total / heatmap.length;
  const isBalanced = heatmap.every((c) => Math.abs(c.count - avg) <= 1);
  if (isBalanced) {
    return "You've been spreading tasks across the whole week — nice balance.";
  }

  const dayName =
    maxCell.dayOfWeek >= 5 ? "weekend" : "weekday";
  const daySpecific = DAY_LABELS[maxCell.dayOfWeek];
  const timeLabel = TIME_LABELS[maxCell.timeBlock].toLowerCase();

  if (maxCell.dayOfWeek >= 5) {
    return `You've been most productive on **${dayName} ${timeLabel}s** lately.`;
  }
  return `**${daySpecific} ${timeLabel}s** are your power zone this week.`;
}

function formatBiggestDayDate(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00");
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) {
    return date.toLocaleDateString("en-US", { weekday: "long" });
  }
  if (diffDays < 14) {
    return `Last ${date.toLocaleDateString("en-US", { weekday: "long" })}`;
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function todaySubtitle(count: number): string {
  if (count === 0) return "Ready when you are";
  if (count <= 2) return "Getting started";
  if (count <= 5) return "Nice momentum";
  return "On a roll";
}

export default function MomentumPage() {
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
  const last7 = stats.daily.slice(-7);
  const maxDailyCount = Math.max(...last7.map((d) => d.count), 1);
  const insight = generateInsight(stats.heatmap, stats.completedThisWeek);

  // Build heatmap lookup
  const heatmapLookup = new Map<string, number>();
  for (const h of stats.heatmap) {
    heatmapLookup.set(`${h.dayOfWeek}-${h.timeBlock}`, h.count);
  }

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
          This week &middot; {formatWeekRange(stats.daily)}
        </span>
      </div>

      {/* Insight bar */}
      {insight && (
        <div className="rounded-lg bg-muted/50 px-4 py-3 text-[13px] text-muted-foreground">
          <span
            dangerouslySetInnerHTML={{
              __html: insight
                .replace(/\*\*(.*?)\*\*/g, '<strong class="text-foreground">$1</strong>'),
            }}
          />
        </div>
      )}

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
                ? formatBiggestDayDate(stats.biggestDay.date)
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
            {last7.map((d) => {
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
          {/* Heatmap */}
          <Card>
            <CardContent className="p-5">
              <h3 className="mb-3 text-sm font-medium">
                When you get stuff done
              </h3>
              <div className="space-y-1">
                {/* Column headers */}
                <div className="flex gap-1">
                  <div className="w-20" />
                  {DAY_LETTERS.map((letter, i) => (
                    <div
                      key={i}
                      className="flex-1 text-center text-[10px] text-muted-foreground"
                    >
                      {letter}
                    </div>
                  ))}
                </div>
                {/* Rows */}
                {TIME_BLOCKS.map((block) => (
                  <div key={block} className="flex items-center gap-1">
                    <div className="w-20 text-xs text-muted-foreground">
                      {TIME_LABELS[block]}
                    </div>
                    {Array.from({ length: 7 }, (_, dayIdx) => {
                      const count =
                        heatmapLookup.get(`${dayIdx}-${block}`) ?? 0;
                      return (
                        <div
                          key={dayIdx}
                          className={`flex flex-1 items-center justify-center rounded-sm ${
                            count === 0
                              ? "bg-muted/50"
                              : ""
                          }`}
                          style={{
                            ...heatmapStyle(count),
                            aspectRatio: "1",
                          }}
                        >
                          {count >= 4 && (
                            <span className="text-[10px] font-medium text-orange-900 dark:text-orange-100">
                              {count}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Energy chips */}
          <Card>
            <CardContent className="p-5">
              <h3 className="mb-3 text-sm font-medium">Energy spent</h3>
              <div className="flex gap-3">
                <div className="flex-1 rounded-lg bg-green-500/10 p-3 text-center">
                  <p className="text-xl font-bold text-green-600 dark:text-green-400">
                    {stats.byEnergy.low}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Low</p>
                </div>
                <div className="flex-1 rounded-lg bg-orange-500/10 p-3 text-center">
                  <p className="text-xl font-bold text-orange-600 dark:text-orange-400">
                    {stats.byEnergy.medium}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Medium</p>
                </div>
                <div className="flex-1 rounded-lg bg-red-500/10 p-3 text-center">
                  <p className="text-xl font-bold text-red-600 dark:text-red-400">
                    {stats.byEnergy.high}
                  </p>
                  <p className="text-[11px] text-muted-foreground">High</p>
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
    </div>
  );
}
