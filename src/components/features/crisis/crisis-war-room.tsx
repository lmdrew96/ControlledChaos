"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { fireTaskConfetti, fireStepConfetti } from "@/lib/utils/confetti";
import { RotateCw, Loader2, SkipForward } from "lucide-react";
import { CrisisChatPanel } from "./crisis-chat-panel";
import type { CrisisPlan } from "@/types";

interface Props {
  plan: CrisisPlan & { currentTaskIndex?: number };
  planId: string;
  taskName: string;
  /**
   * The HARD deadline, or null when there isn't one. crisis_plans.deadline is
   * nullable by design, and this used to be typed as a plain string — a plan
   * with no deadline arrived as `new Date(null)`, i.e. the epoch, and rendered
   * as a red "0m" countdown. The app was inventing an emergency out of a
   * self-imposed target.
   */
  deadline: string | null;
  /** The SOFT self-imposed target, shown when there is no hard deadline. */
  targetDate?: string | null;
  onComplete: () => void;
  onReassess?: (newPlan: CrisisPlan & { currentTaskIndex: number }) => void;
}

/** Below this, seconds are shown and the clock ticks every second. */
const SECONDS_VISIBLE_MS = 5 * 60 * 1000;

function formatCountdown(ms: number): string {
  if (ms <= 0) return "0m";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  // Seconds only appear at the very end. A digit flickering once a second for
  // an hour is pressure, not information, and this screen is already being
  // read by someone under stress.
  if (ms >= SECONDS_VISIBLE_MS) return `${minutes}m`;
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
  targetDate,
  onComplete,
  onReassess,
}: Props) {
  const [currentPlan, setCurrentPlan] = useState(plan);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(
    plan.currentTaskIndex ?? 0
  );
  const [isStuck, setIsStuck] = useState(false);
  const [isReassessing, setIsReassessing] = useState(false);
  const [reassessError, setReassessError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(() =>
    deadline ? new Date(deadline).getTime() - Date.now() : null
  );

  const isFinalStretch = timeLeft !== null && timeLeft < SECONDS_VISIBLE_MS;

  // Live countdown — only when there is an actual hard deadline to count to.
  useEffect(() => {
    if (!deadline) {
      setTimeLeft(null);
      return;
    }
    const tick = () => setTimeLeft(new Date(deadline).getTime() - Date.now());
    tick();
    // Once a second only in the last few minutes; once every 30s before that.
    const interval = setInterval(tick, isFinalStretch ? 1000 : 30_000);
    return () => clearInterval(interval);
  }, [deadline, isFinalStretch]);

  const handleReassess = useCallback(async () => {
    setIsReassessing(true);
    setReassessError(null);
    try {
      const res = await fetch("/api/crisis", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const newPlan = { ...data.plan, currentTaskIndex: data.plan.currentTaskIndex ?? 0 };
      setCurrentPlan(newPlan);
      setCurrentTaskIndex(newPlan.currentTaskIndex);
      setIsStuck(false);
      onReassess?.(newPlan);
    } catch {
      // A button that does nothing, with no explanation, is the worst thing to
      // hand someone mid-crisis. Say what happened and that nothing was lost.
      setReassessError("Couldn't re-check the plan just now. Your current plan is still here.");
    } finally {
      setIsReassessing(false);
    }
  }, [planId, onReassess]);

  const currentTask = currentPlan.tasks[currentTaskIndex];
  const nextTask = currentPlan.tasks[currentTaskIndex + 1] ?? null;
  const progressPct =
    currentPlan.tasks.length === 0
      ? 0
      : (currentTaskIndex / currentPlan.tasks.length) * 100;

  const handleNextTask = useCallback(async () => {
    const isLast = currentTaskIndex === currentPlan.tasks.length - 1;

    if (isLast) {
      // Full storm — the big moment
      fireTaskConfetti();
      await patchProgress(planId, { completed: true });
      onComplete();
    } else {
      // Mini-burst per step — just enough dopamine. Goes through the shared
      // helper so it respects the celebration level and reduced-motion; the
      // raw call this replaces ignored both.
      fireStepConfetti();
      const next = currentTaskIndex + 1;
      setCurrentTaskIndex(next);
      setIsStuck(false);
      await patchProgress(planId, { currentTaskIndex: next });
    }
  }, [currentTaskIndex, currentPlan.tasks.length, planId, onComplete]);

  const handleSkipTask = useCallback(async () => {
    // No confetti, no "completed" flag — this is not an achievement, and
    // dressing it up as one would be the app misreading the moment.
    const next = currentTaskIndex + 1;
    setCurrentTaskIndex(next);
    setIsStuck(false);
    await patchProgress(planId, { currentTaskIndex: next });
  }, [currentTaskIndex, planId]);

  if (!currentTask) {
    // AI returned zero actionable tasks (e.g. a genuinely zero-time-left
    // scenario). Surface the summary instead of rendering a blank screen.
    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-semibold leading-tight">{taskName}</h1>
          <Badge variant={panicBadgeVariant(currentPlan.panicLevel)}>
            {currentPlan.panicLabel}
          </Badge>
        </div>
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-sm text-muted-foreground">{currentPlan.summary}</p>
            <Button
              onClick={async () => {
                await patchProgress(planId, { completed: true });
                onComplete();
              }}
            >
              Done — finish session
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-xl font-semibold leading-tight">{taskName}</h1>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-primary"
            onClick={handleReassess}
            disabled={isReassessing}
            aria-label="Refresh assessment"
          >
            {isReassessing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCw className="h-4 w-4" />
            )}
          </Button>
          <Badge
            variant={panicBadgeVariant(currentPlan.panicLevel)}
          >
            {currentPlan.panicLabel}
          </Badge>
        </div>
      </div>

      {/* Summary */}
      <p className="text-sm text-muted-foreground">{currentPlan.summary}</p>

      {reassessError && (
        <p className="text-sm text-amber-600 dark:text-amber-500" role="status">
          {reassessError}
        </p>
      )}

      {/* Countdown + Progress */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-3">
            {timeLeft !== null ? (
              <>
                <p className="text-xs text-muted-foreground">Time left</p>
                <p
                  className={cn(
                    "text-2xl font-bold tabular-nums",
                    timeLeft < 30 * 60 * 1000 && "text-destructive"
                  )}
                >
                  {formatCountdown(timeLeft)}
                </p>
              </>
            ) : targetDate ? (
              <>
                <p className="text-xs text-muted-foreground">Your own target</p>
                <p className="text-base font-semibold leading-tight">
                  {new Date(targetDate).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Yours to move
                </p>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">No hard deadline</p>
                <p className="text-base font-semibold leading-tight">
                  Work at your pace
                </p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">
              {currentTaskIndex} of {currentPlan.tasks.length} tasks done
            </p>
            <Progress value={progressPct} className="mt-2 h-2" />
          </CardContent>
        </Card>
      </div>

      {/* Breadcrumb dots */}
      <div className="flex items-center gap-1.5">
        {currentPlan.tasks.map((_, i) => (
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
          {currentTaskIndex === currentPlan.tasks.length - 1
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

      {/* Move on without having done it. The only way past a step used to be
          "Done", so a user who skipped one had to tell the app they'd finished
          work they hadn't — the app was asking them to lie to keep going. */}
      {nextTask && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={handleSkipTask}
        >
          <SkipForward className="h-3.5 w-3.5" />
          Skip this one — I&apos;m not doing it right now
        </Button>
      )}

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

      {/* Crisis Chat Panel */}
      <CrisisChatPanel
        planId={planId}
        questions={currentPlan.questions}
      />

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
