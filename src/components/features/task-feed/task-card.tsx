"use client";

import { useState, useRef } from "react";
import {
  Check,
  Trash2,
  Clock,
  MapPin,
  Calendar,
  CalendarClock,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import type { Task } from "@/types";
import { priorityConfig, energyConfig } from "./task-config";

export function TaskCard({
  task,
  onUpdate,
  onClick,
}: {
  task: Task;
  onUpdate: () => void;
  onClick?: () => void;
}) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showSwipeDeleteDialog, setShowSwipeDeleteDialog] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const isSwiping = useRef(false);
  const swipeDirection = useRef<"x" | "y" | null>(null);

  const SWIPE_THRESHOLD = 80;

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isSwiping.current = false;
    swipeDirection.current = null;
  }

  function handleTouchMove(e: React.TouchEvent) {
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
    // Cap offset so it doesn't fly too far
    const capped = Math.max(-120, Math.min(120, dx));
    setSwipeOffset(capped);
  }

  function handleTouchEnd() {
    if (swipeDirection.current === "x" && swipeOffset <= -SWIPE_THRESHOLD) {
      // Swiped left → show delete confirmation
      setShowSwipeDeleteDialog(true);
    } else if (
      swipeDirection.current === "x" &&
      swipeOffset >= SWIPE_THRESHOLD &&
      !isCompleted
    ) {
      // Swiped right → schedule
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
  const priority =
    priorityConfig[task.priority as keyof typeof priorityConfig] ??
    priorityConfig.normal;
  const energy =
    energyConfig[task.energyLevel as keyof typeof energyConfig] ??
    energyConfig.medium;

  async function handleAction(action: "complete" | "undo" | "delete") {
    setIsUpdating(true);
    setConfirmDelete(false);
    try {
      if (action === "delete") {
        const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Delete failed");
        toast.success("Task deleted");
      } else {
        const status = action === "complete" ? "completed" : "pending";
        const res = await fetch(`/api/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        if (!res.ok) throw new Error("Update failed");
        if (action === "complete") {
          toast.success("Task completed!");
          confetti({ particleCount: 120, spread: 90, origin: { y: 0.65 }, colors: ["#ff6b6b","#ffd93d","#6bcb77","#4d96ff","#c77dff","#ff9f43"] });
          setTimeout(() => {
            confetti({ particleCount: 80, angle: 60, spread: 70, origin: { x: 0, y: 0.7 }, colors: ["#ff6b6b","#ffd93d","#6bcb77","#4d96ff","#c77dff"] });
            confetti({ particleCount: 80, angle: 120, spread: 70, origin: { x: 1, y: 0.7 }, colors: ["#ff9f43","#c77dff","#4d96ff","#6bcb77","#ffd93d"] });
          }, 150);
          setTimeout(() => {
            confetti({ particleCount: 60, spread: 120, startVelocity: 45, decay: 0.92, origin: { y: 0.5 }, colors: ["#ff6b6b","#ffd93d","#6bcb77","#4d96ff","#c77dff","#ff9f43"] });
          }, 350);
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
        const timeStr = scheduledDate.toLocaleString("en-US", {
          weekday: "short",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });
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

  function handleFindTime(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    void handleFindTimeAction();
  }

  function handleDeleteClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (confirmDelete) {
      handleAction("delete");
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  }

  const isSwipingLeft = swipeOffset < -20;
  const isSwipingRight = swipeOffset > 20;

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
          "group relative p-4 transition-colors cursor-pointer hover:bg-accent/30",
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

            <div className="flex items-center gap-1">
              {!isCompleted && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity hidden sm:flex"
                  onClick={handleFindTime}
                  disabled={isScheduling || isUpdating}
                  aria-label={`Find a time for "${task.title}"`}
                  title="Find a time"
                >
                  {isScheduling ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  ) : (
                    <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </Button>
              )}
              <Button
                variant={confirmDelete ? "destructive" : "ghost"}
                size={confirmDelete ? "sm" : "icon"}
                className={cn(
                  "shrink-0 transition-all hidden sm:flex",
                  confirmDelete
                    ? "h-7 px-2 text-xs opacity-100"
                    : "h-7 w-7 opacity-0 group-hover:opacity-100"
                )}
                onClick={handleDeleteClick}
                disabled={isUpdating}
                aria-label={confirmDelete ? "Confirm delete" : `Delete "${task.title}"`}
              >
                {confirmDelete ? (
                  "Delete?"
                ) : (
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:hidden">
            {!isCompleted && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={handleFindTime}
                disabled={isScheduling || isUpdating}
              >
                {isScheduling ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <CalendarClock className="mr-1 h-3 w-3" />
                )}
                Find Time
              </Button>
            )}
            <Button
              variant={confirmDelete ? "destructive" : "outline"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={handleDeleteClick}
              disabled={isUpdating}
            >
              {confirmDelete ? "Confirm Delete" : "Delete"}
            </Button>
          </div>

          {task.description && (
            <p className="text-sm text-muted-foreground">{task.description}</p>
          )}

          {/* Metadata row */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={priority.className}>
              {priority.label}
            </Badge>

            <span
              className="text-xs text-muted-foreground"
              title={energy.label}
            >
              {energy.icon}
            </span>

            {task.estimatedMinutes && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {task.estimatedMinutes}m
              </span>
            )}

            {task.category && (
              <Badge variant="secondary" className="text-xs">
                {task.category}
              </Badge>
            )}

            {task.locationTags && task.locationTags.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" />
                {task.locationTags.join(", ")}
              </span>
            )}

            {task.deadline && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {new Date(task.deadline).toLocaleDateString()}
              </span>
            )}

            {task.scheduledFor && (
              <span className="flex items-center gap-1 text-xs text-primary/80 font-medium">
                <CalendarClock className="h-3 w-3" />
                {new Date(task.scheduledFor).toLocaleString("en-US", {
                  weekday: "short",
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                })}
              </span>
            )}
          </div>
        </div>
      </div>
      </Card>

      <AlertDialog open={showSwipeDeleteDialog} onOpenChange={setShowSwipeDeleteDialog}>
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
