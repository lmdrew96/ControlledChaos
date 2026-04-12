"use client";

import { useState } from "react";
import {
  Target,
  Calendar,
  Pencil,
  Trash2,
  CheckCircle2,
  RotateCcw,
  Pause,
  ListTodo,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Goal } from "@/types";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  active: { label: "Active", variant: "default" },
  completed: { label: "Completed", variant: "secondary" },
  paused: { label: "Paused", variant: "outline" },
};

interface GoalCardProps {
  goal: Goal;
  onUpdate: () => void;
  onEdit: (goal: Goal) => void;
}

export function GoalCard({ goal, onUpdate, onEdit }: GoalCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const taskCount = goal.taskCount ?? 0;
  const completedTaskCount = goal.completedTaskCount ?? 0;
  const progress = taskCount > 0 ? Math.round((completedTaskCount / taskCount) * 100) : 0;
  const statusInfo = statusConfig[goal.status] ?? statusConfig.active;

  const targetDate = goal.targetDate ? new Date(goal.targetDate) : null;
  const isOverdue = targetDate && goal.status === "active" && targetDate < new Date();

  async function handleStatusChange(status: string) {
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/goals/${goal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      toast.success(
        status === "completed"
          ? "Goal completed!"
          : status === "paused"
            ? "Goal paused"
            : "Goal reactivated"
      );
      onUpdate();
    } catch {
      toast.error("Failed to update goal");
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleDelete() {
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/goals/${goal.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Goal deleted");
      onUpdate();
    } catch {
      toast.error("Failed to delete goal");
    } finally {
      setIsUpdating(false);
      setConfirmDelete(false);
    }
  }

  return (
    <>
      <Card
        className={cn(
          "p-4 transition-colors",
          goal.status === "completed" && "opacity-60",
          goal.status === "paused" && "opacity-75"
        )}
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            <Target className={cn(
              "h-5 w-5",
              goal.status === "active" ? "text-primary" : "text-muted-foreground"
            )} />
          </div>

          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className={cn(
                  "font-medium leading-snug",
                  goal.status === "completed" && "line-through"
                )}>
                  {goal.title}
                </h3>
                {goal.description && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {goal.description}
                  </p>
                )}
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 shrink-0"
                    disabled={isUpdating}
                  >
                    <span className="sr-only">Actions</span>
                    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="h-4 w-4">
                      <path d="M3.625 7.5C3.625 8.12132 3.12132 8.625 2.5 8.625C1.87868 8.625 1.375 8.12132 1.375 7.5C1.375 6.87868 1.87868 6.375 2.5 6.375C3.12132 6.375 3.625 6.87868 3.625 7.5ZM8.625 7.5C8.625 8.12132 8.12132 8.625 7.5 8.625C6.87868 8.625 6.375 8.12132 6.375 7.5C6.375 6.87868 6.87868 6.375 7.5 6.375C8.12132 6.375 8.625 6.87868 8.625 7.5ZM13.625 7.5C13.625 8.12132 13.1213 8.625 12.5 8.625C11.8787 8.625 11.375 8.12132 11.375 7.5C11.375 6.87868 11.8787 6.375 12.5 6.375C13.1213 6.375 13.625 6.87868 13.625 7.5Z" fill="currentColor"/>
                    </svg>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(goal)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                  {goal.status === "active" && (
                    <>
                      <DropdownMenuItem onClick={() => handleStatusChange("completed")}>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Mark Complete
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleStatusChange("paused")}>
                        <Pause className="mr-2 h-4 w-4" />
                        Pause
                      </DropdownMenuItem>
                    </>
                  )}
                  {goal.status === "paused" && (
                    <DropdownMenuItem onClick={() => handleStatusChange("active")}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Reactivate
                    </DropdownMenuItem>
                  )}
                  {goal.status === "completed" && (
                    <DropdownMenuItem onClick={() => handleStatusChange("active")}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Reopen
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setConfirmDelete(true)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant={statusInfo.variant} className="text-xs">
                {statusInfo.label}
              </Badge>
              {targetDate && (
                <span className={cn("flex items-center gap-1", isOverdue && "text-destructive")}>
                  <Calendar className="h-3 w-3" />
                  {targetDate.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: targetDate.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
                  })}
                  {isOverdue && " (overdue)"}
                </span>
              )}
              {taskCount > 0 && (
                <span className="flex items-center gap-1">
                  <ListTodo className="h-3 w-3" />
                  {completedTaskCount}/{taskCount} tasks
                </span>
              )}
            </div>

            {/* Progress bar */}
            {taskCount > 0 && (
              <div className="flex items-center gap-2">
                <Progress value={progress} className="h-1.5 flex-1" />
                <span className="text-xs text-muted-foreground tabular-nums">{progress}%</span>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Delete confirmation */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete goal?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &ldquo;{goal.title}&rdquo;. Tasks linked to this goal
              won&apos;t be deleted — they&apos;ll just be unlinked.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
