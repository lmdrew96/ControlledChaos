"use client";

import { useAnnounceGoalFinished } from "@/hooks/use-announce-goal-finished";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  Check,
  Trash2,
  Clock,
  Calendar,
  CalendarClock,
  Target,
  Layers,
  Loader2,
  ChevronDown,
  MoreHorizontal,
  PlayCircle,
  PauseCircle,
  Ban,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { SessionOutcomePicker } from "@/components/features/task-feed/session-outcome-picker";
import { fireTaskConfetti } from "@/lib/utils/confetti";
import {
  formatForDisplay,
  toDateKeyInTimezone,
  DISPLAY_DATETIME,
  DISPLAY_DATE,
  DISPLAY_TIME,
} from "@/lib/timezone";
import { useTimezone } from "@/hooks/use-timezone";
import { useCalendarSettings } from "@/hooks/use-calendar-settings";
import { taskBadgeColor, categoryLabel } from "@/lib/calendar/colors";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/ui/markdown";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import type { Task, ProgressStep } from "@/types";
import { priorityConfig } from "./task-config";

export function TaskCard({
  task,
  onUpdate,
  onClick,
}: {
  task: Task;
  onUpdate: () => void;
  onClick?: () => void;
}) {
  const announceGoalFinished = useAnnounceGoalFinished();
  const timezone = useTimezone();
  // Category colours are the user's configured calendar colours, so a task
  // reads as the same colour here as its events do on the calendar. Shares
  // the settings cache with useTimezone above — no extra fetch per card.
  const { settings: calendarSettings } = useCalendarSettings();
  const taskCategoryLabel = categoryLabel(task.category);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [isChunking, setIsChunking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showSwipeDeleteDialog, setShowSwipeDeleteDialog] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [localStepIndex, setLocalStepIndex] = useState(task.currentStepIndex ?? 0);
  const [isAdvancingStep, setIsAdvancingStep] = useState(false);

  useEffect(() => {
    setLocalStepIndex(task.currentStepIndex ?? 0);
  }, [task.currentStepIndex, task.id]);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const isSwiping = useRef(false);
  const swipeDirection = useRef<"x" | "y" | null>(null);

  const SWIPE_THRESHOLD = 80;

  function handleTouchStart(e: React.TouchEvent) {
    if (isExpanded) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isSwiping.current = false;
    swipeDirection.current = null;
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (isExpanded) return;
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;

    if (!swipeDirection.current) {
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      if (absX < 8 && absY < 8) return;
      swipeDirection.current = absX > absY ? "x" : "y";
    }

    if (swipeDirection.current !== "x") {
      if (swipeOffset !== 0) setSwipeOffset(0);
      return;
    }

    isSwiping.current = true;
    const capped = Math.max(-120, Math.min(120, dx));
    setSwipeOffset(capped);
  }

  function handleTouchEnd() {
    if (swipeDirection.current === "x" && swipeOffset <= -SWIPE_THRESHOLD) {
      setShowSwipeDeleteDialog(true);
    } else if (
      swipeDirection.current === "x" &&
      swipeOffset >= SWIPE_THRESHOLD &&
      !isClosed
    ) {
      void handleFindTimeAction();
    }
    setSwipeOffset(0);
    touchStartX.current = null;
    touchStartY.current = null;
    isSwiping.current = false;
    swipeDirection.current = null;
  }

  function handleTouchCancel() {
    setSwipeOffset(0);
    touchStartX.current = null;
    touchStartY.current = null;
    isSwiping.current = false;
    swipeDirection.current = null;
  }
  const isCompleted = task.status === "completed";
  // Cancelled reads like done on the card (faded, struck through, no menu):
  // it's work you decided not to do. The circle restores it instead.
  const isCancelled = task.status === "cancelled";
  const isClosed = isCompleted || isCancelled;
  const isInProgress = task.status === "in_progress";
  const hasSteps = !!task.progressSteps && task.progressSteps.length > 0;
  const priority =
    priorityConfig[task.priority as keyof typeof priorityConfig] ??
    priorityConfig.normal;

  async function handleAction(action: "complete" | "undo" | "cancel" | "delete") {
    setIsUpdating(true);
    setConfirmDelete(false);
    try {
      if (action === "delete") {
        const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Delete failed");
        toast.success(`'${task.title}' deleted`);
      } else {
        const status =
          action === "complete" ? "completed" : action === "cancel" ? "cancelled" : "pending";
        const previousStatus = task.status;
        const res = await fetch(`/api/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        if (!res.ok) throw new Error("Update failed");
        if (action === "complete") {
          toast.success(`'${task.title}' marked complete`);
          fireTaskConfetti();
          void announceGoalFinished(res);
        } else if (action === "cancel") {
          toast.success(`'${task.title}' cancelled`, {
            description: "It's under the Cancelled tab if you change your mind.",
            action: {
              label: "Undo",
              onClick: async () => {
                try {
                  const undo = await fetch(`/api/tasks/${task.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status: previousStatus }),
                  });
                  if (!undo.ok) throw new Error("Undo failed");
                  onUpdate();
                } catch {
                  toast.error("Couldn't undo — restore it from the Cancelled tab.");
                }
              },
            },
          });
        } else if (isCancelled) {
          toast.success(`'${task.title}' restored`);
        }
      }
      onUpdate();
    } catch (error) {
      console.error("Task action failed:", error);
      toast.error(
        action === "delete"
          ? "Couldn't delete task. Try again."
          : action === "complete"
            ? "Couldn't complete task. Try again."
            : action === "cancel"
              ? "Couldn't cancel task. Try again."
              : "Couldn't update task. Try again."
      );
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleToggleInProgress() {
    const nextStatus = isInProgress ? "pending" : "in_progress";
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) throw new Error("Update failed");
      toast.success(
        nextStatus === "in_progress"
          ? `'${task.title}' marked in progress`
          : `'${task.title}' moved back to not started`
      );
      onUpdate();
    } catch (error) {
      console.error("Task status toggle failed:", error);
      toast.error("Couldn't update task status. Try again.");
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleFindTimeAction() {
    setIsScheduling(true);
    // Same as chunking: the menu's spinner disappears with the menu, so the
    // pending state moves to a toast that survives it.
    const toastId = toast.loading("Looking for a free slot…");
    try {
      const res = await fetch(`/api/tasks/${task.id}/schedule`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scheduling failed");
      if (!data.block) {
        toast.info(data.message ?? "No free time found in the next 3 days.", {
          id: toastId,
        });
      } else {
        const scheduledDate = new Date(data.scheduledFor);
        const timeStr = formatForDisplay(scheduledDate, timezone, DISPLAY_DATETIME);
        const reasoning = data.block.reasoning ?? "";

        if (data.moved && data.previousScheduledFor) {
          // A planned start the user set by hand is a real decision. Say what
          // was replaced and offer it back, rather than quietly overwriting it.
          const previous = data.previousScheduledFor as string;
          const fromStr = formatForDisplay(new Date(previous), timezone, DISPLAY_DATETIME);
          toast.success(`Moved from ${fromStr} to ${timeStr}`, {
            id: toastId,
            action: {
              label: "Undo",
              onClick: async () => {
                try {
                  const undo = await fetch(`/api/tasks/${task.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ scheduledFor: previous }),
                  });
                  if (!undo.ok) throw new Error("Undo failed");
                  toast.success(`Back to ${fromStr}`);
                  onUpdate();
                } catch {
                  toast.error("Couldn't undo — set it by hand in the task.");
                }
              },
            },
          });
        } else {
          toast.success(
            `Scheduled for ${timeStr}${reasoning ? ` — ${reasoning}` : ""}`,
            { id: toastId }
          );
        }
        onUpdate();
      }
    } catch (error) {
      console.error("Find time failed:", error);
      toast.error("Couldn't find a time. Try again.", { id: toastId });
    } finally {
      setIsScheduling(false);
    }
  }

  async function handleChunkAction() {
    setIsChunking(true);
    // The menu closes on select, and its spinner goes with it — so the
    // "working on it" signal has to live somewhere that outlives the menu.
    const toastId = toast.loading("Chunking this into steps…");
    try {
      const res = await fetch(`/api/tasks/${task.id}/chunk`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Chunk failed");
      toast.success(`Chunked into ${data.steps.length} steps`, { id: toastId });
      onUpdate();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't chunk this. Try again.",
        { id: toastId }
      );
    } finally {
      setIsChunking(false);
    }
  }

  const steps = (task.progressSteps as ProgressStep[] | null) ?? null;

  const handleStepDone = useCallback(async () => {
    if (!steps) return;
    const nextIndex = localStepIndex + 1;
    const isLast = nextIndex >= steps.length;

    if (isLast) {
      fireTaskConfetti();
    }

    setLocalStepIndex(nextIndex);
    setIsAdvancingStep(true);

    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentStepIndex: nextIndex }),
      });
      if (isLast) {
        toast.success("All steps done — task completed!");
        void announceGoalFinished(res);
      }
      onUpdate();
    } catch {
      toast.error("Couldn't update step. Try again.");
    } finally {
      setIsAdvancingStep(false);
    }
  }, [steps, localStepIndex, task.id, onUpdate, announceGoalFinished]);

  const isSwipingLeft = swipeOffset < -20;
  const isSwipingRight = swipeOffset > 20;

  // Hard due date, soft target, and planned time are three different facts and
  // can coexist. This used to pick exactly ONE (scheduledFor > deadline), so
  // planning a task silently hid its real due date — the one that matters most.
  // Steps progress is its own affordance (expand/collapse), shown separately.
  const temporalChips: Array<{
    key: string;
    Icon: typeof Calendar;
    label: string;
    tone: string;
  }> = [];

  if (task.deadline) {
    temporalChips.push({
      key: "deadline",
      Icon: Calendar,
      label: `Due ${formatForDisplay(new Date(task.deadline), timezone, DISPLAY_DATE)}`,
      tone: "text-muted-foreground",
    });
  }

  if (task.targetDate) {
    temporalChips.push({
      key: "target",
      Icon: Target,
      label: `Target ${formatForDisplay(new Date(task.targetDate), timezone, DISPLAY_DATE)}`,
      tone: "text-adhd-purple dark:text-adhd-lavender",
    });
  }

  // The sitting to show is derived from the clock by the API: the stored
  // scheduledFor is the EARLIEST sitting, which goes stale as soon as it ends.
  // Callers that didn't get the derived fields fall back to it.
  const nextSession =
    task.nextSessionAt !== undefined ? task.nextSessionAt : task.scheduledFor;
  const passedSession = task.passedSessionAt ?? null;
  const passedToday =
    passedSession !== null &&
    toDateKeyInTimezone(new Date(passedSession), timezone) ===
      toDateKeyInTimezone(new Date(), timezone);

  // Only for a sitting that ended TODAY, never a backlog of old ones: the
  // prompt is a moment's convenience, and unanswered is fine.
  const canLogPassedSitting =
    !isClosed &&
    passedToday &&
    Boolean(task.passedSessionId) &&
    !task.passedSessionStatus;

  if (nextSession) {
    const next = formatForDisplay(new Date(nextSession), timezone, DISPLAY_DATETIME);
    temporalChips.push({
      key: "scheduled",
      Icon: CalendarClock,
      label: passedToday
        ? `Earlier ${formatForDisplay(new Date(passedSession), timezone, DISPLAY_TIME)} · next ${next}`
        : next,
      tone: "text-primary/80 font-medium",
    });
  } else if (passedSession) {
    // Every sitting is behind us. Say so plainly, without dressing it up as
    // a failure: it was a plan, and plans move.
    temporalChips.push({
      key: "scheduled",
      Icon: CalendarClock,
      label: `Was planned ${formatForDisplay(new Date(passedSession), timezone, DISPLAY_DATETIME)}`,
      tone: "text-muted-foreground",
    });
  }

  return (
    <div className="relative overflow-hidden rounded-lg">
      {/* Swipe backgrounds */}
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-end pr-5 bg-destructive/90 transition-opacity",
          isSwipingLeft ? "opacity-100" : "opacity-0"
        )}
        aria-hidden
      >
        <Trash2 className="h-5 w-5 text-white" />
      </div>
      {!isClosed && (
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-start pl-5 bg-primary/80 transition-opacity",
            isSwipingRight ? "opacity-100" : "opacity-0"
          )}
          aria-hidden
        >
          <CalendarClock className="h-5 w-5 text-white" />
        </div>
      )}

      <Card
        className={cn(
          "ticket-row relative p-4 transition-colors cursor-pointer hover:bg-accent/30",
          isClosed && "opacity-60"
        )}
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: swipeOffset === 0 ? "transform 0.2s ease" : "none",
        }}
        onClick={isSwiping.current ? undefined : onClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      >
        <div className="flex items-start gap-3">
          {/* Complete/undo button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              void handleAction(isClosed ? "undo" : "complete");
            }}
            disabled={isUpdating}
            aria-label={
              isCancelled
                ? `Restore "${task.title}"`
                : isCompleted
                  ? `Mark "${task.title}" incomplete`
                  : `Complete "${task.title}"`
            }
            title={isCancelled ? "Restore" : undefined}
            className={cn(
              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
              isCompleted
                ? "border-primary bg-primary text-primary-foreground"
                : isCancelled
                  ? "border-muted-foreground/40 text-muted-foreground hover:border-primary hover:text-primary"
                  : "border-muted-foreground/30 hover:border-primary"
            )}
          >
            {isUpdating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : isCompleted ? (
              <Check className="h-3 w-3" />
            ) : isCancelled ? (
              <Undo2 className="h-3 w-3" />
            ) : null}
          </button>

          {/* Task content */}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h3
                className={cn(
                  "font-medium leading-snug",
                  isClosed && "line-through"
                )}
              >
                {task.title}
              </h3>

              {!isClosed && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Actions for "${task.title}"`}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenuItem
                      onSelect={() => void handleToggleInProgress()}
                      disabled={isUpdating}
                    >
                      {isUpdating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : isInProgress ? (
                        <PauseCircle className="h-4 w-4" />
                      ) : (
                        <PlayCircle className="h-4 w-4" />
                      )}
                      {isInProgress ? "Not started" : "In progress"}
                    </DropdownMenuItem>
                    {!hasSteps && (
                      <DropdownMenuItem
                        onSelect={() => void handleChunkAction()}
                        disabled={isChunking || isUpdating}
                      >
                        {isChunking ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Layers className="h-4 w-4" />
                        )}
                        Chunk it
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onSelect={() => void handleFindTimeAction()}
                      disabled={isScheduling || isUpdating}
                    >
                      {isScheduling ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CalendarClock className="h-4 w-4" />
                      )}
                      Find a time
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => void handleAction("cancel")}
                      disabled={isUpdating}
                    >
                      <Ban className="h-4 w-4" />
                      Cancel task
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => setConfirmDelete(true)}
                      disabled={isUpdating}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {task.description && (
              // Often an AI-written auto-note, so it may carry markdown.
              <Markdown className="text-sm text-muted-foreground">{task.description}</Markdown>
            )}

            {/* Metadata row — priority + time estimate, then the temporal group.
                The temporal chips (due / target / planned) can all be present at
                once, so they live in their own wrapper and drop to a full-width
                line as soon as there's more than one, instead of breaking apart
                mid-group against the badges.
                Steps button shows separately when steps exist (it's an expand affordance).
                In-progress badge only appears when a task has actually been started. */}
            <div className="flex flex-wrap items-center gap-2">
              {isInProgress && (
                <Badge
                  variant="outline"
                  className="bg-adhd-lavender/20 text-adhd-lavender border-adhd-lavender/40"
                >
                  <PlayCircle className="h-3 w-3" />
                  In Progress
                </Badge>
              )}

              {/* Category chip. Filled, where priority is outlined, so the two
                  read as different kinds of thing at a glance rather than
                  competing as two same-weight badges. The colour comes from the
                  user's configured calendar colours, so a school task is the
                  same colour here as its events are on the calendar.

                  The label is always present alongside the colour — colour is
                  not a signal every user receives, and a tooltip is not a
                  substitute for visible text. Uncategorized tasks get no chip
                  at all: a chip that says nothing is pure noise on a screen
                  this busy. */}
              {taskCategoryLabel && (
                <Badge
                  variant="outline"
                  className={cn(
                    "border-transparent",
                    taskBadgeColor(task.category, calendarSettings.calendarColors)
                  )}
                >
                  {taskCategoryLabel}
                </Badge>
              )}

              <Badge variant="outline" className={priority.className}>
                {priority.label}
              </Badge>

              {task.estimatedMinutes && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {task.estimatedMinutes}m
                </span>
              )}

              {temporalChips.length > 0 && (
                <div
                  className={cn(
                    // Own wrapper so the group wraps as a unit. gap-x-3 spaces
                    // chips from each other a little wider than the parent's
                    // gap-2 spaces the group from the badges, which keeps the
                    // dates reading as one cluster.
                    "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1",
                    // One chip is narrow enough to sit inline with the badges.
                    // Two or three need their own line or they crowd the row.
                    temporalChips.length > 1 && "basis-full"
                  )}
                >
                  {temporalChips.map(({ key, Icon, label, tone }) => (
                    <span
                      key={key}
                      className={cn(
                        "flex min-w-0 items-center gap-1 text-xs",
                        tone
                      )}
                    >
                      <Icon className="h-3 w-3 shrink-0" />
                      <span className="truncate">{label}</span>
                    </span>
                  ))}
                </div>
              )}

              {canLogPassedSitting && (
                <div className="basis-full space-y-1.5 pt-1">
                  <p className="text-xs text-muted-foreground">
                    How did the{" "}
                    {formatForDisplay(new Date(task.passedSessionAt!), timezone, DISPLAY_TIME)}{" "}
                    sitting go?
                  </p>
                  <SessionOutcomePicker
                    taskId={task.id}
                    sessionId={task.passedSessionId!}
                    plannedMinutes={task.passedSessionMinutes}
                    onLogged={onUpdate}
                  />
                </div>
              )}

              {steps && steps.length > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded((v) => !v);
                  }}
                  aria-expanded={isExpanded}
                  aria-label={isExpanded ? "Collapse steps" : "Expand steps"}
                  className="flex items-center gap-1.5 rounded-md px-1 py-0.5 text-xs font-medium text-adhd-teal hover:bg-adhd-teal/10 transition-colors dark:text-adhd-sage dark:hover:bg-adhd-sage/10"
                >
                  <span className="inline-flex gap-0.5">
                    {steps.map((_, i) => (
                      <span
                        key={i}
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          i < localStepIndex
                            ? "bg-adhd-teal dark:bg-adhd-sage"
                            : "bg-adhd-teal/25 dark:bg-adhd-sage/30"
                        )}
                      />
                    ))}
                  </span>
                  {localStepIndex}/{steps.length}
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 transition-transform",
                      isExpanded && "rotate-180"
                    )}
                  />
                </button>
              )}
            </div>
          </div>
        </div>

        {steps && steps.length > 0 && isExpanded && (
          <div
            className="mt-3 space-y-2 rounded-md border border-adhd-teal/20 bg-adhd-teal/5 p-3 dark:border-adhd-sage/30 dark:bg-adhd-sage/5"
            onClick={(e) => e.stopPropagation()}
          >
            <ul className="space-y-1.5">
              {steps.map((step, i) => {
                const isDone = i < localStepIndex;
                const isCurrent = i === localStepIndex;
                return (
                  <li
                    key={i}
                    className={cn(
                      "flex items-start gap-2 rounded-md px-2 py-1.5 text-sm",
                      isCurrent && "bg-background border-l-4 border-l-adhd-teal shadow-sm dark:border-l-adhd-sage"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                        isDone
                          ? "border-adhd-teal bg-adhd-teal text-white dark:border-adhd-sage dark:bg-adhd-sage dark:text-adhd-dark"
                          : isCurrent
                            ? "border-adhd-teal bg-adhd-teal/20 dark:border-adhd-sage dark:bg-adhd-sage/30"
                            : "border-muted-foreground/30"
                      )}
                    >
                      {isDone ? <Check className="h-2.5 w-2.5" /> : null}
                    </span>
                    <span
                      className={cn(
                        "flex-1",
                        isDone && "text-muted-foreground line-through",
                        isCurrent && "font-medium"
                      )}
                    >
                      {step.title}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {step.estimatedMinutes}m
                    </span>
                  </li>
                );
              })}
            </ul>
            {!isClosed && localStepIndex < steps.length && (
              <Button
                size="sm"
                className="w-full"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleStepDone();
                }}
                disabled={isAdvancingStep}
              >
                {isAdvancingStep ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                {localStepIndex === steps.length - 1
                  ? "Done — finish task!"
                  : "Done, next step"}
              </Button>
            )}
            {localStepIndex >= steps.length && (
              <div className="flex items-center gap-2 rounded-md bg-success/10 px-3 py-2 text-sm text-success">
                <Check className="h-4 w-4" />
                All {steps.length} steps completed
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Delete confirmation — used by both menu Delete and swipe-left. */}
      <AlertDialog
        open={confirmDelete || showSwipeDeleteDialog}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmDelete(false);
            setShowSwipeDeleteDialog(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete task?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{task.title}&rdquo; will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => handleAction("delete")}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
