"use client";

import { useEffect, useState } from "react";
import { Flame, Sparkles, Coffee, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface Stats {
  completedToday: number;
  completedThisWeek: number;
  completedAllTime: number;
}

const MOMENTUM_TIERS = [
  { min: 0, message: "Fresh start — what's first?", icon: Coffee, accent: "text-muted-foreground", bg: "bg-muted", ring: "" },
  { min: 1, message: "Rolling!", icon: Sparkles, accent: "text-blue-400", bg: "bg-blue-500/10", ring: "ring-1 ring-blue-500/20" },
  { min: 3, message: "On fire!", icon: Flame, accent: "text-orange-400", bg: "bg-orange-500/10", ring: "ring-1 ring-orange-500/20" },
  { min: 6, message: "Unstoppable!", icon: Zap, accent: "text-red-400", bg: "bg-red-500/10", ring: "ring-1 ring-red-500/20" },
] as const;

function getTier(count: number) {
  for (let i = MOMENTUM_TIERS.length - 1; i >= 0; i--) {
    if (count >= MOMENTUM_TIERS[i].min) return MOMENTUM_TIERS[i];
  }
  return MOMENTUM_TIERS[0];
}

export function DailyMomentum() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats/daily")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data) setStats(data); })
      .catch(() => {});
  }, []);

  if (!stats) return null;

  const tier = getTier(stats.completedToday);
  const Icon = tier.icon;

  // Show 8 dots, filled up to completedToday
  const maxDots = 8;
  const filledDots = Math.min(stats.completedToday, maxDots);

  return (
    <Card className="group border-border/40 bg-card/80 transition-colors hover:border-border/60">
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tier.bg} ${tier.ring} ${tier.accent} transition-all`}>
          <Icon className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold">{tier.message}</span>
          </div>

          {/* Momentum bar */}
          <div className="mt-2 flex items-center gap-3">
            <div className="flex gap-1">
              {Array.from({ length: maxDots }, (_, i) => (
                <div
                  key={i}
                  className={`h-1.5 w-3 rounded-full transition-all duration-300 ${
                    i < filledDots
                      ? `momentum-dot-filled ${tier.accent.replace("text-", "bg-")}`
                      : "bg-muted-foreground/15"
                  }`}
                  style={{ transitionDelay: `${i * 40}ms` }}
                />
              ))}
            </div>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {stats.completedToday} today &middot; {stats.completedThisWeek} this week
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
