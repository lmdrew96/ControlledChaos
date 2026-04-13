"use client";

import { useEffect, useState } from "react";
import { Flame, Sparkles, Coffee, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";

interface Stats {
  completedToday: number;
  completedThisWeek: number;
  completedAllTime: number;
  daily: Array<{ date: string; count: number }>;
}

const MOMENTUM_TIERS = [
  { min: 0, message: "Fresh start — what's first?", icon: Coffee, accent: "text-muted-foreground", bg: "bg-muted", ring: "" },
  { min: 1, message: "Rolling!", icon: Sparkles, accent: "text-blue-400", bg: "bg-blue-500/10", ring: "ring-1 ring-blue-500/20" },
  { min: 3, message: "On fire!", icon: Flame, accent: "text-orange-400", bg: "bg-orange-500/10", ring: "ring-1 ring-orange-500/20" },
  { min: 6, message: "Unstoppable!", icon: Zap, accent: "text-red-400", bg: "bg-red-500/10", ring: "ring-1 ring-red-500/20" },
] as const;

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

function getTier(count: number) {
  for (let i = MOMENTUM_TIERS.length - 1; i >= 0; i--) {
    if (count >= MOMENTUM_TIERS[i].min) return MOMENTUM_TIERS[i];
  }
  return MOMENTUM_TIERS[0];
}

export function DailyMomentum() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats/momentum")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data) setStats(data); })
      .catch(() => {});
  }, []);

  if (!stats) return null;

  const tier = getTier(stats.completedToday);
  const Icon = tier.icon;

  // Last 7 days for mini bar chart
  const last7 = stats.daily.slice(-7);
  const maxCount = Math.max(...last7.map((d) => d.count), 1);
  const barColor = tier.accent.replace("text-", "bg-");

  // Detect today's date string
  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <Link href="/momentum" className="block">
      <Card className="group border-border/40 bg-card/80 transition-colors hover:border-border/60">
        <CardContent className="flex items-center gap-4 p-5">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tier.bg} ${tier.ring} ${tier.accent} transition-all`}>
            <Icon className="h-5 w-5" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold">{tier.message}</span>
            </div>

            {/* Mini 7-day bar chart */}
            <div className="mt-2 flex items-center gap-3">
              <div className="flex items-end gap-1" style={{ height: 36 }}>
                {last7.map((d, i) => {
                  const isToday = d.date === todayStr;
                  const barHeight =
                    d.count > 0
                      ? Math.max((d.count / maxCount) * 36, 3)
                      : 3;
                  return (
                    <div key={d.date} className="flex flex-col items-center gap-0.5">
                      <div
                        className={`w-3 rounded-sm transition-all duration-300 ${
                          d.count > 0 ? barColor : "bg-muted-foreground/15"
                        }`}
                        style={{
                          height: barHeight,
                          transitionDelay: `${i * 40}ms`,
                        }}
                      />
                      <span
                        className={`text-[9px] leading-none text-muted-foreground ${
                          isToday ? "font-medium" : ""
                        }`}
                      >
                        {DAY_LABELS[i]}
                      </span>
                    </div>
                  );
                })}
              </div>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {stats.completedToday} today &middot; {stats.completedThisWeek} this week
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
