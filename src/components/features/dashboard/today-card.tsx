"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, ChevronDown, ChevronUp, Loader2, PlayCircle, Sun } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LoadErrorStrip } from "@/components/ui/load-error-strip";
import { useTimezone } from "@/hooks/use-timezone";
import { useCalendarSettings } from "@/hooks/use-calendar-settings";
import { useAnnounceGoalFinished } from "@/hooks/use-announce-goal-finished";
import { fireTaskConfetti } from "@/lib/utils/confetti";
import { taskBadgeColor, categoryLabel } from "@/lib/calendar/colors";
import { extractCourseCode } from "@/lib/notifications/cluster";
import { bucketToday, nextDueAfterToday, type TodayBucket } from "@/lib/tasks/today";
import { formatForDisplay, DISPLAY_DATE, DISPLAY_TIME } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import type { Task } from "@/types";

const STORAGE_KEY = "cc-today-card-collapsed";
const MAX_ROWS = 5;
const WEEK_MS = 6 * 24 * 60 * 60 * 1000;

const SECTION_LABELS: Record<TodayBucket, string> = {
  overdue: "Overdue",
  due: "Due today",
  planned: "Planned today",
};

/**
 * "What does today look like?" without a click: overdue, due today, then
 * today's sittings. Open by default; collapse is remembered for the session,
 * like the time anchor's.
 */
export function TodayCard({
  onTaskChanged,
  refreshKey,
}: {
  onTaskChanged?: () => void;
  /** Bumped when a task changes elsewhere on the dashboard; re-reads in place. */
  refreshKey?: number;
}) {
  const timezone = useTimezone();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(sessionStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks");
      if (!res.ok) throw new Error(`GET /api/tasks ${res.status}`);
      const data = await res.json();
      setTasks(data.tasks);
      setLoadError(false);
    } catch (error) {
      console.error("Today card: failed to fetch tasks:", error);
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks, refreshKey]);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    sessionStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  }

  if (loadError && !tasks) {
    return <LoadErrorStrip message="Couldn't load today's tasks." onRetry={fetchTasks} />;
  }
  if (!tasks) {
    return <div className="h-24 animate-pulse rounded-lg border border-border bg-card" />;
  }

  const now = new Date();
  const buckets = bucketToday(tasks, now, timezone);
  const rows = (["overdue", "due", "planned"] as const).flatMap((bucket) =>
    buckets[bucket].map((task) => ({ bucket, task }))
  );
  const shown = rows.slice(0, MAX_ROWS);
  const hiddenCount = rows.length - shown.length;
  const nextDue = rows.length === 0 ? nextDueAfterToday(tasks, now, timezone) : null;

  const handleDone = () => {
    void fetchTasks();
    onTaskChanged?.();
  };

  return (
    <section className="rounded-lg border border-border bg-card" aria-labelledby="today-card-heading">
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-expanded={!collapsed}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm transition-colors hover:bg-accent/40"
      >
        <span className="flex items-center gap-2">
          <Sun className="h-4 w-4 text-muted-foreground" />
          <span id="today-card-heading" className="font-medium">Today</span>
          {rows.length > 0 && (
            <span className="text-muted-foreground">
              {buckets.overdue.length > 0 && (
                <span className="text-destructive">{buckets.overdue.length} overdue · </span>
              )}
              {buckets.due.length} due · {buckets.planned.length} planned
            </span>
          )}
        </span>
        {collapsed ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {!collapsed && (
        <div className="px-4 pb-3">
          {rows.length === 0 ? (
            <div className="space-y-1 py-1 text-sm">
              <p>Nothing due today ✨</p>
              {nextDue && (
                <p className="truncate text-xs text-muted-foreground">
                  Next: {nextDue.title} —{" "}
                  {formatForDisplay(
                    new Date(nextDue.deadline!),
                    timezone,
                    new Date(nextDue.deadline!).getTime() - now.getTime() < WEEK_MS
                      ? { weekday: "short" }
                      : DISPLAY_DATE
                  )}
                </p>
              )}
            </div>
          ) : (
            <ul className="space-y-0.5">
              {shown.map(({ bucket, task }, i) => (
                <li key={task.id}>
                  {(i === 0 || shown[i - 1].bucket !== bucket) && (
                    <p
                      className={cn(
                        "pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide",
                        bucket === "overdue" ? "text-destructive" : "text-muted-foreground"
                      )}
                    >
                      {SECTION_LABELS[bucket]}
                    </p>
                  )}
                  <TodayRow task={task} bucket={bucket} timezone={timezone} onDone={handleDone} />
                </li>
              ))}
            </ul>
          )}
          {hiddenCount > 0 && (
            <Link
              href="/tasks?today=1"
              className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
            >
              +{hiddenCount} more
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

function TodayRow({
  task,
  bucket,
  timezone,
  onDone,
}: {
  task: Task;
  bucket: TodayBucket;
  timezone: string;
  onDone: () => void;
}) {
  const announceGoalFinished = useAnnounceGoalFinished();
  const { settings: calendarSettings } = useCalendarSettings();
  const [isUpdating, setIsUpdating] = useState(false);

  const tag = extractCourseCode(task.title, task.description) ?? categoryLabel(task.category);
  const at = new Date(bucket === "planned" ? task.nextSessionAt! : task.deadline!);
  const timeLabel =
    bucket === "overdue"
      ? `was due ${formatForDisplay(at, timezone, DISPLAY_DATE)}`
      : bucket === "due"
        ? formatForDisplay(at, timezone, DISPLAY_TIME)
        : `${formatForDisplay(at, timezone, DISPLAY_TIME)}${
            task.nextSessionMinutes ? ` (${task.nextSessionMinutes}m)` : ""
          }`;

  // Same completion as the task card: PATCH, toast, confetti, goal check.
  async function complete() {
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      if (!res.ok) throw new Error(`PATCH /api/tasks/${task.id} ${res.status}`);
      toast.success(`'${task.title}' marked complete`);
      fireTaskConfetti();
      void announceGoalFinished(res);
      onDone();
    } catch (error) {
      console.error("Today card: complete failed:", error);
      toast.error("Couldn't complete task. Try again.");
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-md py-1.5">
      <button
        type="button"
        onClick={() => void complete()}
        disabled={isUpdating}
        aria-label={`Complete "${task.title}"`}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/30 transition-colors hover:border-primary"
      >
        {isUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 opacity-0" />}
      </button>
      <div className="min-w-0 flex-1">
        <Link
          href={`/tasks?taskId=${task.id}`}
          className="block truncate text-sm font-medium leading-snug hover:underline"
        >
          {task.title}
        </Link>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {tag && (
            <Badge
              variant="outline"
              className={cn(
                "border-transparent px-1.5 py-0 text-[10px]",
                taskBadgeColor(task.category, calendarSettings.calendarColors)
              )}
            >
              {tag}
            </Badge>
          )}
          {task.status === "in_progress" && (
            <Badge
              variant="outline"
              className="border-lavender/40 bg-lavender/20 px-1.5 py-0 text-[10px] text-lavender"
            >
              <PlayCircle className="h-3 w-3" />
              In Progress
            </Badge>
          )}
        </div>
      </div>
      <span
        className={cn(
          "shrink-0 text-xs tabular-nums",
          bucket === "overdue" ? "text-destructive" : "text-muted-foreground"
        )}
      >
        {timeLabel}
      </span>
    </div>
  );
}
