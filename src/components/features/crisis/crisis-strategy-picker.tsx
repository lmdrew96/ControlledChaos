"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ChevronRight, Clock } from "lucide-react";
import type { CrisisStrategy, PanicLevel } from "@/types";

interface Props {
  strategies: CrisisStrategy[];
  onSelect: (strategy: CrisisStrategy) => void;
}

function panicColor(level: PanicLevel) {
  if (level === "damage-control") return "border-destructive/40 bg-destructive/5";
  if (level === "tight") return "border-amber-500/40 bg-amber-500/5";
  return "border-emerald-500/40 bg-emerald-500/5";
}

function panicBadgeVariant(level: PanicLevel): "destructive" | "secondary" | "default" {
  if (level === "damage-control") return "destructive";
  if (level === "tight") return "secondary";
  return "default";
}

function totalMinutes(strategy: CrisisStrategy): number {
  return strategy.plan.tasks.reduce((sum, t) => sum + t.estimatedMinutes, 0);
}

function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function CrisisStrategyPicker({ strategies, onSelect }: Props) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Pick your approach</h2>
        <p className="text-sm text-muted-foreground">
          You&apos;re juggling multiple crises. How do you want to handle this one?
        </p>
      </div>

      <div className="space-y-3">
        {strategies.map((strategy, i) => {
          const isSelected = selectedIndex === i;
          const time = totalMinutes(strategy);

          return (
            <Card
              key={i}
              className={cn(
                "cursor-pointer transition-all",
                panicColor(strategy.plan.panicLevel),
                isSelected
                  ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                  : "hover:bg-accent/30"
              )}
              onClick={() => setSelectedIndex(i)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{strategy.label}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {strategy.description}
                    </p>
                  </div>
                  <Badge variant={panicBadgeVariant(strategy.plan.panicLevel)}>
                    {strategy.plan.panicLabel}
                  </Badge>
                </div>

                <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatTime(time)}
                  </span>
                  <span>{strategy.plan.tasks.length} steps</span>
                </div>

                {/* Expanded preview when selected */}
                {isSelected && (
                  <div className="mt-3 space-y-1.5 border-t pt-3">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Steps
                    </p>
                    {strategy.plan.tasks.map((task, ti) => (
                      <div
                        key={ti}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                          {ti + 1}
                        </span>
                        <span className="truncate">{task.title}</span>
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                          ~{task.estimatedMinutes}m
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Button
        className="w-full"
        disabled={selectedIndex === null}
        onClick={() => selectedIndex !== null && onSelect(strategies[selectedIndex])}
      >
        Lock in this approach
        <ChevronRight className="ml-1 h-4 w-4" />
      </Button>
    </div>
  );
}
