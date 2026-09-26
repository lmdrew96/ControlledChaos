"use client";

import { Calendar, Sparkles } from "lucide-react";
import { dateOnlyKey, formatDateOnly, formatForDisplay, todayInTimezone } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import type { Goal } from "@/types";

/** Short date for a goal's calendar-day fields, with the year only when it isn't this one. */
export function formatGoalDay(date: Date): string {
  return formatDateOnly(date, {
    month: "short",
    day: "numeric",
    year: date.getUTCFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}

/** completedAt is a real instant (unlike targetDate), so it's read in the user's timezone. */
export function formatFinishedDay(completedAt: string, timezone: string): string {
  const d = new Date(completedAt);
  return formatForDisplay(d, timezone, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}

/**
 * Target day, stated neutrally. A passed target is information, not a failure —
 * it reads "target passed", in the normal muted color.
 */
export function GoalTargetDate({ goal, timezone }: { goal: Goal; timezone: string }) {
  if (!goal.targetDate) return null;
  const target = new Date(goal.targetDate);
  // Calendar days: a target of today isn't past until tomorrow.
  const passed = goal.status === "active" && dateOnlyKey(target) < todayInTimezone(timezone);
  return (
    <span className="flex items-center gap-1">
      <Calendar className="h-3 w-3" />
      {passed ? `Target passed · ${formatGoalDay(target)}` : `Target ${formatGoalDay(target)}`}
    </span>
  );
}

/** "4 steps done · 2 this week" — counts up as you go, never drops when you add a step. */
export function GoalMomentum({ goal, className }: { goal: Goal; className?: string }) {
  const done = goal.completedTaskCount ?? 0;
  const thisWeek = goal.completedThisWeek ?? 0;
  const total = goal.taskCount ?? 0;
  if (total === 0) return null;
  return (
    <span className={cn("flex items-center gap-1", className)}>
      <Sparkles className="h-3 w-3" />
      {done} of {total} step{total === 1 ? "" : "s"} done
      {thisWeek > 0 && <span className="text-primary"> · {thisWeek} this week</span>}
    </span>
  );
}

/** Open (not done, not cancelled) steps left on a goal. */
export function openStepCount(goal: Goal): number {
  return Math.max(0, (goal.taskCount ?? 0) - (goal.completedTaskCount ?? 0));
}

/** Every linked step is done and the goal is still active — time to offer "call it done". */
export function isReadyToFinish(goal: Goal): boolean {
  return goal.status === "active" && (goal.taskCount ?? 0) > 0 && openStepCount(goal) === 0;
}
