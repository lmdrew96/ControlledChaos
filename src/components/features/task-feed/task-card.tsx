"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Check,
  Trash2,
  Clock,
  Calendar,
  CalendarClock,
  Layers,
  Loader2,
  ChevronDown,
  MoreHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { fireTaskConfetti } from "@/lib/utils/confetti";
import { formatForDisplay, DISPLAY_DATETIME, DISPLAY_DATE } from "@/lib/timezone";
import { useTimezone } from "@/hooks/use-timezone";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { useParallelPlaySync } from "@/hooks/use-parallel-play-sync";
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
  const timezone = useTimezone();
  const [isUpdating, setIsUpdating] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [isChunking, setIsChunking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showSwipeDeleteDialog, setShowSwipeDeleteDialog] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [localStepIndex, setLocalStepIndex] = useState(task.currentStepIndex ?? 0);
  const [isAdvancingStep, setIsAdvancingStep] = useState(false);
  const { syncTaskComplete } = useParallelPlaySync();

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
      !isCompleted
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
  const hasSteps = !!task.progressSteps && task.progressSteps.length > 0;
  const priority =
    priorityConfig[task.priority as keyof typeof priorityConfig] ??
    priorityConfig.normal;

  async function handleAction(action: "complete" | "undo" | "delete") {
    setIsUpdating(true);
    setConfirmDelete(false);
    try {
      if (action === "delete") {
        const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Delete failed");
        toast.success(`'${task.title}' deleted`);
      } else {
        const status = action === "complete" ? "completed" : "pending";
        const res = await fetch(`/api/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        if (!res.ok) throw new Error("Update failed");
        if (action === "complete") {
          toast.success(`'${task.title}' marked complete`);
          fireTaskConfetti();
          void syncTaskComplete();
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
            : "Couldn't update task. Try again."
      );
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleFindTimeAction() {
    setIsScheduling(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/schedule`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scheduling failed");
      if (!data.block) {
        toast.info(data.message ?? "No free time found in the next 3 days.");
      } else {
        const scheduledDate = new Date(data.scheduledFor);
        const timeStr = formatForDisplay(scheduledDate, timezone, DISPLAY_DATETIME);
        const reasoning = data.block.reasoning ?? "";
        toast.success(`Scheduled for ${timeStr}${reasoning ? ` — ${reasoning}` : ""}`);
        onUpdate();
      }
    } catch (error) {
      console.error("Find time failed:", error);
      toast.error("Couldn't find a time. Try again.");
    } finally {
      setIsScheduling(false);
    }
  }

  async function handleChunkAction() {
    setIsChunking(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/chunk`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Chunk failed");
      toast.success(`Chunked into ${data.steps.length} steps`);
      onUpdate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't chunk this. Try again.");
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
      await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentStepIndex: nextIndex }),
      });
      if (isLast) {
        toast.success("All steps done — task completed!");
        void syncTaskComplete();
      }
      onUpdate();
    } catch {
      toast.error("Couldn't update step. Try again.");
    } finally {
      setIsAdvancingStep(false);
    }
  }, [steps, localStepIndex, task.id, onUpdate, syncTaskComplete]);

  const isSwipingLeft = swipeOffset < -20;
  const isSwipingRight = swipeOffset > 20;

  // Pick ONE temporal hint: scheduled-for > deadline > none.
  // Steps progress is its own affordance (expand/collapse), shown separately.
  const temporalHint: "scheduled" | "deadline" | null = task.scheduledFor
    ? "scheduled"
    : task.deadline
      ? "deadline"
      : null;

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
      {!isCompleted && (
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
          "relative p-4 transition-colors cursor-pointer hover:bg-accent/30",
          isCompleted && "opacity-60"
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
              handleAction(isCompleted ? "undo" : "complete");
            }}
            disabled={isUpdating}
            aria-label={isCompleted ? `Mark "${task.title}" incomplete` : `Complete "${task.title}"`}
            className={cn(
              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
              isCompleted
                ? "border-primary bg-primary text-primary-foreground"
                : "border-muted-foreground/30 hover:border-primary"
            )}
          >
            {isUpdating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : isCompleted ? (
              <Check className="h-3 w-3" />
            ) : null}
          </button>

          {/* Task content */}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h3
                className={cn(
                  "font-medium leading-snug",
                  isCompleted && "line-through"
                )}
              >
                {task.title}
              </h3>

              {!isCompleted && (
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
                    {!hasSteps && (
                      <DropdownMenuItem
                        onSelect={(e) => {
                          e.preventDefault();
                          void handleChunkAction();
                        }}
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
                      onSelect={(e) => {
                        e.preventDefault();
                        void handleFindTimeAction();
                      }}
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
                      variant="destructive"
                      onSelect={(e) => {
                        e.preventDefault();
                        setConfirmDelete(true);
                      }}
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
              <p className="text-sm text-muted-foreground">{task.description}</p>
            )}

            {/* Metadata row — capped at 3 visible: priority + time + one temporal hint.
                Steps button shows separately when steps exist (it's an expand affordance). */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={priority.className}>
                {priority.label}
              </Badge>

              {task.estimatedMinutes && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {task.estimatedMinutes}m
                </span>
              )}

              {temporalHint === "scheduled" && task.scheduledFor && (
                <span className="flex items-center gap-1 text-xs text-primary/80 font-medium">
                  <CalendarClock className="h-3 w-3" />
                  {formatForDisplay(new Date(task.scheduledFor), timezone, DISPLAY_DATETIME)}
                </span>
              )}

              {temporalHint === "deadline" && task.deadline && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {formatForDisplay(new Date(task.deadline), timezone, DISPLAY_DATE)}
                </span>
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
            {!isCompleted && localStepIndex < steps.length && (
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
