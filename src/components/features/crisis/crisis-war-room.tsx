"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { CrisisPlan } from "@/types";

interface Props {
  plan: CrisisPlan & { currentTaskIndex?: number };
  planId: string;
  taskName: string;
  deadline: string;
  onComplete: () => void;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "0m";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function panicBadgeVariant(
  panicLevel: string
): "destructive" | "secondary" | "default" {
  if (panicLevel === "damage-control") return "destructive";
  if (panicLevel === "tight") return "secondary";
  return "default";
}

async function patchProgress(
  planId: string,
  update: { currentTaskIndex?: number; completed?: boolean }
) {
  await fetch("/api/crisis", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planId, ...update }),
  });
}

export function CrisisWarRoom({
  plan,
  planId,
  taskName,
  deadline,
  onComplete,
}: Props) {
  const [currentTaskIndex, setCurrentTaskIndex] = useState(
    plan.currentTaskIndex ?? 0
  );
  const [isStuck, setIsStuck] = useState(false);
  const [timeLeft, setTimeLeft] = useState(
    new Date(deadline).getTime() - Date.now()
  );

  // Live countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(new Date(deadline).getTime() - Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  const currentTask = plan.tasks[currentTaskIndex];
  const nextTask = plan.tasks[currentTaskIndex + 1] ?? null;
  const progressPct = (currentTaskIndex / plan.tasks.length) * 100;

  const handleNextTask = useCallback(async () => {
    const isLast = currentTaskIndex === plan.tasks.length - 1;

    if (isLast) {
      await patchProgress(planId, { completed: true });
      onComplete();
    } else {
      const next = currentTaskIndex + 1;
      setCurrentTaskIndex(next);
      setIsStuck(false);
      await patchProgress(planId, { currentTaskIndex: next });
    }
  }, [currentTaskIndex, plan.tasks.length, planId, onComplete]);

  if (!currentTask) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-xl font-semibold leading-tight">{taskName}</h1>
        <Badge
          variant={panicBadgeVariant(plan.panicLevel)}
          className="shrink-0"
        >
          {plan.panicLabel}
        </Badge>
      </div>

      {/* Summary */}
      <p className="text-sm text-muted-foreground">{plan.summary}</p>

      {/* Countdown + Progress */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Time left</p>
            <p
              className={cn(
                "text-2xl font-bold tabular-nums",
                timeLeft < 30 * 60 * 1000 && "text-destructive"
              )}
            >
              {formatCountdown(timeLeft)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">
              {currentTaskIndex} of {plan.tasks.length} tasks done
            </p>
            <Progress value={progressPct} className="mt-2 h-2" />
          </CardContent>
        </Card>
      </div>

      {/* Breadcrumb dots */}
      <div className="flex items-center gap-1.5">
        {plan.tasks.map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-2.5 w-2.5 rounded-full transition-colors",
              i < currentTaskIndex
                ? "bg-primary"
                : i === currentTaskIndex
                  ? "bg-primary/60 ring-2 ring-primary ring-offset-1 ring-offset-background"
                  : "border border-border bg-transparent"
            )}
          />
        ))}
      </div>

      {/* Do this now card */}
      <div className="rounded-lg border-l-4 border-l-blue-500 bg-card p-4 shadow-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-blue-500">
          Do this now
        </p>
        <p className="mb-1 text-lg font-semibold">{currentTask.title}</p>
        <p className="mb-3 text-sm text-muted-foreground">
          {currentTask.instruction}
        </p>
        <Badge variant="outline">~{currentTask.estimatedMinutes} min</Badge>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <Button className="flex-1" onClick={handleNextTask}>
          {currentTaskIndex === plan.tasks.length - 1
            ? "Done — finish session"
            : "Done, next task"}
        </Button>
        <Button
          variant="outline"
          onClick={() => setIsStuck((s) => !s)}
          className={isStuck ? "border-amber-500 text-amber-500" : ""}
        >
          {isStuck ? "Hide hint" : "Stuck — help me"}
        </Button>
      </div>

      {/* Stuck hint */}
      {isStuck && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4">
            <p className="mb-3 text-sm">{currentTask.stuckHint}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsStuck(false)}
            >
              Got it, back to work
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Next up preview */}
      {nextTask && (
        <Card className="opacity-50">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Next up</p>
            <p className="text-sm font-medium">{nextTask.title}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
