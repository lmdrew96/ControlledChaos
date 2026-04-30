"use client";

import { useEffect, useState } from "react";
import { Flame, Sparkles, Coffee, Zap, BarChart3 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";

interface Stats {
  completedToday: number;
  completedThisWeek: number;
  completedAllTime: number;
  daily: Array<{ date: string; count: number }>;
  weekStartDate: string;
}

const MOTIVATIONAL_TIERS = [
  { min: 0, message: "Fresh start — what's first?", icon: Coffee, accent: "text-muted-foreground", bg: "bg-muted", ring: "" },
  { min: 1, message: "Rolling!", icon: Sparkles, accent: "text-adhd-sage", bg: "bg-adhd-sage/10", ring: "ring-1 ring-adhd-sage/20" },
  { min: 3, message: "On fire!", icon: Flame, accent: "text-adhd-amber", bg: "bg-adhd-amber/10", ring: "ring-1 ring-adhd-amber/20" },
  { min: 6, message: "Unstoppable!", icon: Zap, accent: "text-adhd-clay", bg: "bg-adhd-clay/10", ring: "ring-1 ring-adhd-clay/20" },
] as const;

const DAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function getMotivationalTier(count: number) {
  for (let i = MOTIVATIONAL_TIERS.length - 1; i >= 0; i--) {
    if (count >= MOTIVATIONAL_TIERS[i].min) return MOTIVATIONAL_TIERS[i];
  }
  return MOTIVATIONAL_TIERS[0];
}

function getNeutralDisplay(count: number) {
  const message = count === 0
    ? "No tasks yet today"
    : `${count} done today`;
  return {
    message,
    icon: BarChart3,
    accent: "text-muted-foreground",
    bg: "bg-muted",
    ring: "",
  };
}

export function DailyMomentum() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [momentumStyle, setMomentumStyle] = useState<"motivational" | "neutral">("neutral");

  useEffect(() => {
    fetch("/api/stats/momentum")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data) setStats(data); })
      .catch(() => {});

    // Read user preference from localStorage
    const stored = localStorage.getItem("cc-momentum-style") as "motivational" | "neutral" | null;
    if (stored) setMomentumStyle(stored);
  }, []);

  if (!stats) {
    return (
      <Card className="h-full border-border/40 bg-card/80">
        <CardContent className="flex h-full flex-col justify-between gap-4 p-5">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-muted" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-2/3 rounded bg-muted" />
              <div className="h-3 w-1/2 rounded bg-muted/70" />
            </div>
          </div>
          <div className="flex items-end gap-1" style={{ height: 36 }}>
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-3 w-3 rounded-sm bg-muted" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const display = momentumStyle === "motivational"
    ? getMotivationalTier(stats.completedToday)
    : getNeutralDisplay(stats.completedToday);
  const Icon = display.icon;

  // Current week bars (Mon-Sun), padded to 7 days
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

  // Today is always the last entry in the daily array (server computes in user TZ)
  const todayDate = stats.daily[stats.daily.length - 1]?.date;

  return (
    <Link href="/momentum" className="block h-full">
      <Card className="group h-full border-border/40 bg-card/80 transition-colors hover:border-border/60">
        <CardContent className="flex h-full flex-col justify-between gap-4 p-5">
          <div className="flex items-start gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${display.bg} ${display.ring} ${display.accent} transition-all`}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold leading-snug">{display.message}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
                {stats.completedToday} today &middot; {stats.completedThisWeek} this week
              </p>
            </div>
          </div>

          {/* Mini 7-day bar chart */}
          <div className="flex items-end justify-between gap-1">
            {currentWeek.map((d, i) => {
              const isToday = d.date === todayDate;
              const barHeight =
                d.count > 0
                  ? Math.max((d.count / maxCount) * 36, 3)
                  : 3;
              return (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-0.5">
                  <div
                    className={`w-full max-w-4 rounded-sm transition-all duration-300 ${
                      d.count > 0 ? "bg-adhd-amber/80" : "bg-muted-foreground/15"
                    }`}
                    style={{
                      height: barHeight,
                      transitionDelay: `${i * 40}ms`,
                    }}
                  />
                  <span
                    className={`text-[10px] leading-tight text-muted-foreground ${
                      isToday ? "font-medium" : ""
                    }`}
                  >
                    {DAY_LABELS[i]}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
