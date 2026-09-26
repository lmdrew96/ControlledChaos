"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  PartyPopper,
  Pause,
  Pencil,
  RotateCcw,
  Target,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { LoadErrorStrip } from "@/components/ui/load-error-strip";
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
import { useTimezone } from "@/hooks/use-timezone";
import { cn } from "@/lib/utils";
import type { Goal, Task } from "@/types";
import { CreateGoalModal } from "./create-goal-modal";
import { FinishGoalDialog } from "./finish-goal-dialog";
import { GoalSteps } from "./goal-steps";
import {
  GoalMomentum,
  GoalTargetDate,
  formatFinishedDay,
  isReadyToFinish,
  openStepCount,
} from "./goal-meta";

export function GoalDetail({ goalId }: { goalId: string }) {
  const router = useRouter();
  const timezone = useTimezone();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<"missing" | "failed" | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [reflectionDraft, setReflectionDraft] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [goalRes, tasksRes] = await Promise.all([
        fetch(`/api/goals/${goalId}`),
        fetch("/api/tasks"),
      ]);
      if (goalRes.status === 404) {
        setLoadError("missing");
        return;
      }
      if (!goalRes.ok) throw new Error(`GET /api/goals/${goalId} ${goalRes.status}`);
      if (!tasksRes.ok) throw new Error(`GET /api/tasks ${tasksRes.status}`);
      const [goalData, tasksData] = await Promise.all([goalRes.json(), tasksRes.json()]);
      setGoal(goalData.goal);
      setTasks(tasksData.tasks ?? []);
      setLoadError(null);
    } catch (error) {
      console.error("Failed to load goal:", error);
      setLoadError("failed");
    } finally {
      setIsLoading(false);
    }
  }, [goalId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchGoal(body: Record<string, unknown>, success: string) {
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/goals/${goalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`PATCH /api/goals/${goalId} ${res.status}`);
      toast.success(success);
      await load();
      return true;
    } catch (error) {
      console.error("Failed to update goal:", error);
      toast.error("Couldn't update that goal. Try again.");
      return false;
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleDelete() {
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/goals/${goalId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`DELETE /api/goals/${goalId} ${res.status}`);
      toast.success("Goal deleted");
      router.push("/goals");
    } catch (error) {
      console.error("Failed to delete goal:", error);
      toast.error("Couldn't delete that goal. Try again.");
      setIsUpdating(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError === "missing" || (!goal && loadError !== "failed")) {
    return (
      <div className="space-y-4 py-12 text-center">
        <p className="font-medium">This goal isn&apos;t here anymore.</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/goals">Back to Goals</Link>
        </Button>
      </div>
    );
  }

  if (!goal) {
    return <LoadErrorStrip message="Couldn't load this goal." onRetry={load} />;
  }

  const total = goal.taskCount ?? 0;
  const done = goal.completedTaskCount ?? 0;
  const readyToFinish = isReadyToFinish(goal);

  return (
    <div className="space-y-6">
      <Link
        href="/goals"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Goals
      </Link>

      {/* Header */}
      <header className="space-y-3">
        <div className="flex items-start gap-3">
          <Target
            className={cn(
              "mt-1 h-6 w-6 shrink-0",
              goal.status === "active" ? "text-primary" : "text-muted-foreground"
            )}
          />
          <div className="min-w-0 flex-1 space-y-2">
            <h1 className="text-2xl font-bold tracking-tight break-words">{goal.title}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {goal.status !== "active" && (
                <Badge variant={goal.status === "completed" ? "secondary" : "outline"} className="text-xs">
                  {goal.status === "completed" ? "Completed" : "Paused"}
                </Badge>
              )}
              {goal.status === "completed" && goal.completedAt && (
                <span>Finished {formatFinishedDay(goal.completedAt, timezone)}</span>
              )}
              {goal.status !== "completed" && <GoalTargetDate goal={goal} timezone={timezone} />}
              <GoalMomentum goal={goal} />
            </div>
            {total > 0 && <Progress value={Math.round((done / total) * 100)} className="h-1.5" />}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)} disabled={isUpdating}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Edit
          </Button>
          {goal.status === "active" && (
            <>
              <Button size="sm" variant="outline" onClick={() => setFinishOpen(true)} disabled={isUpdating}>
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                Call it done
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => patchGoal({ status: "paused" }, "Goal paused")}
                disabled={isUpdating}
              >
                <Pause className="mr-1.5 h-3.5 w-3.5" />
                Pause
              </Button>
            </>
          )}
          {goal.status !== "active" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                patchGoal(
                  { status: "active" },
                  goal.status === "paused" ? "Goal reactivated" : "Goal reopened"
                )
              }
              disabled={isUpdating}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              {goal.status === "paused" ? "Reactivate" : "Reopen"}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setConfirmDelete(true)}
            disabled={isUpdating}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </header>

      {readyToFinish && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <PartyPopper className="h-4 w-4 text-primary" />
            That&apos;s every step. Call it done?
          </p>
          <Button size="sm" onClick={() => setFinishOpen(true)}>
            Call it done
          </Button>
        </div>
      )}

      {/* Why — the description, in full */}
      <section className="space-y-2">
        <h2 className="font-semibold">Why it matters</h2>
        {goal.description ? (
          <div className="text-sm">
            <Markdown>{goal.description}</Markdown>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Add a line about why this matters or what done looks like.
          </button>
        )}
      </section>

      {/* Reflection — once it's done */}
      {goal.status === "completed" && (
        <section className="space-y-2">
          <h2 className="font-semibold">How it went</h2>
          {reflectionDraft !== null ? (
            <div className="space-y-2">
              <Textarea
                value={reflectionDraft}
                onChange={(e) => setReflectionDraft(e.target.value)}
                placeholder="What worked, what you'd skip next time, how it feels to be done."
                className="min-h-[90px] resize-none"
                maxLength={4000}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setReflectionDraft(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={isUpdating}
                  onClick={async () => {
                    const saved = await patchGoal(
                      { reflection: reflectionDraft.trim() || null },
                      "Reflection saved"
                    );
                    if (saved) setReflectionDraft(null);
                  }}
                >
                  Save
                </Button>
              </div>
            </div>
          ) : goal.reflection ? (
            <div className="space-y-1">
              <div className="text-sm">
                <Markdown>{goal.reflection}</Markdown>
              </div>
              <button
                type="button"
                onClick={() => setReflectionDraft(goal.reflection ?? "")}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Edit
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setReflectionDraft("")}
              className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Jot down how it went.
            </button>
          )}
        </section>
      )}

      <GoalSteps goal={goal} tasks={tasks} timezone={timezone} onChanged={load} />

      <CreateGoalModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={load}
        editGoal={goal}
      />

      <FinishGoalDialog
        goal={finishOpen ? goal : null}
        openSteps={openStepCount(goal)}
        onClose={() => setFinishOpen(false)}
        onFinished={load}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete goal?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &ldquo;{goal.title}&rdquo;. Its steps stay on your task
              list — they&apos;ll just be unlinked.
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
    </div>
  );
}
