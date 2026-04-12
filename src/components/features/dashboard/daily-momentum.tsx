"use client";

import { useEffect, useState } from "react";
import { Flame, Sparkles, Coffee } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface Stats {
  completedToday: number;
  completedThisWeek: number;
  completedAllTime: number;
}

const MOMENTUM_TIERS = [
  { min: 0, message: "Fresh start — what's first?", icon: Coffee, color: "text-muted-foreground" },
  { min: 1, message: "Rolling!", icon: Sparkles, color: "text-primary" },
  { min: 3, message: "On fire!", icon: Flame, color: "text-orange-500" },
  { min: 6, message: "Unstoppable!", icon: Flame, color: "text-red-500" },
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

  // Momentum dots — show up to 8, filled for completed
  const dotCount = Math.max(stats.completedToday, 5);
  const dots = Array.from({ length: Math.min(dotCount, 8) }, (_, i) => i < stats.completedToday);

  return (
    <Card className="border-border/50">
      <CardContent className="flex items-center gap-4 p-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted ${tier.color}`}>
          <Icon className="h-5 w-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{tier.message}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-3">
            {/* Momentum dots */}
            <div className="flex gap-1">
              {dots.map((filled, i) => (
                <div
                  key={i}
                  className={`h-2 w-2 rounded-full transition-colors ${
                    filled ? "bg-primary" : "bg-muted-foreground/20"
                  }`}
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground">
              {stats.completedToday} today &middot; {stats.completedThisWeek} this week
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
