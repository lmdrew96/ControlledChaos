"use client";

import { useState } from "react";
import { ChevronDown, Link2, Loader2, Plus, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { TaskDetailModal } from "@/components/features/task-feed/task-detail-modal";
import { formatForDisplay } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import type { Goal, SuggestedGoalStep, Task } from "@/types";
import { LinkTasksDialog } from "./link-tasks-dialog";

interface GoalStepsProps {
  goal: Goal;
  /** Every live task (not cancelled); this component picks out the goal's own. */
  tasks: Task[];
  timezone: string;
  /** Re-read the goal and tasks after any change. */
  onChanged: () => void;
}

const SHORT: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };

/** One line of "when" for a step: the next sitting, else the target, else the due date. */
function stepWhen(task: Task, timezone: string): string | null {
  if (task.scheduledFor) return `Planned ${formatForDisplay(new Date(task.scheduledFor), timezone, SHORT)}`;
  if (task.targetDate) return `Aiming for ${formatForDisplay(new Date(task.targetDate), timezone, SHORT)}`;
  if (task.deadline) return `Due ${formatForDisplay(new Date(task.deadline), timezone, SHORT)}`;
  return null;
}

/**
 * Same order as the card's "Next" (getGoalNextSteps): soonest of planned,
 * target and due first; undated steps after, oldest first — so a broken-down
 * goal lists its steps in the order they were suggested.
 */
function byNextStep(a: Task, b: Task): number {
  const soonest = (t: Task) => {
    const times = [t.scheduledFor, t.targetDate, t.deadline]
      .filter((d): d is string => !!d)
      .map((d) => new Date(d).getTime());
    return times.length > 0 ? Math.min(...times) : Number.POSITIVE_INFINITY;
  };
  const diff = soonest(a) - soonest(b);
  if (diff !== 0 && !Number.isNaN(diff)) return diff;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

export function GoalSteps({ goal, tasks, timezone, onChanged }: GoalStepsProps) {
  const [newStep, setNewStep] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [suggestions, setSuggestions] = useState<(SuggestedGoalStep & { keep: boolean })[] | null>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isKeeping, setIsKeeping] = useState(false);

  const steps = tasks.filter((t) => t.goalId === goal.id);
  const openSteps = steps.filter((t) => t.status !== "completed").sort(byNextStep);
  const doneSteps = steps.filter((t) => t.status === "completed");
  const linkable = tasks.filter((t) => !t.goalId && t.status !== "completed");
  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;
  const isActive = goal.status === "active";

  async function addStep() {
    const title = newStep.trim();
    if (!title) return;
    setIsAdding(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, goalId: goal.id }),
      });
      if (!res.ok) throw new Error(`POST /api/tasks ${res.status}`);
      setNewStep("");
      onChanged();
    } catch (error) {
      console.error("Failed to add step:", error);
      toast.error("Couldn't add that step. Try again.");
    } finally {
      setIsAdding(false);
    }
  }

  async function toggleStep(task: Task) {
    setBusyTaskId(task.id);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: task.status === "completed" ? "pending" : "completed" }),
      });
      if (!res.ok) throw new Error(`PATCH /api/tasks/${task.id} ${res.status}`);
      onChanged();
    } catch (error) {
      console.error("Failed to update step:", error);
      toast.error("Couldn't update that step. Try again.");
    } finally {
      setBusyTaskId(null);
    }
  }

  async function unlinkStep(task: Task) {
    setBusyTaskId(task.id);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goalId: null }),
      });
      if (!res.ok) throw new Error(`PATCH /api/tasks/${task.id} ${res.status}`);
      toast.success("Removed from this goal — the task is still on your list.");
      onChanged();
    } catch (error) {
      console.error("Failed to unlink step:", error);
      toast.error("Couldn't remove that step. Try again.");
    } finally {
      setBusyTaskId(null);
    }
  }

  async function suggestSteps() {
    setIsSuggesting(true);
    try {
      const res = await fetch(`/api/goals/${goal.id}/breakdown`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `POST breakdown ${res.status}`);
      setSuggestions((data.steps as SuggestedGoalStep[]).map((s) => ({ ...s, keep: true })));
    } catch (error) {
      console.error("Goal breakdown failed:", error);
      toast.error(error instanceof Error ? error.message : "Couldn't suggest steps right now.");
    } finally {
      setIsSuggesting(false);
    }
  }

  async function keepSuggestions() {
    const kept = (suggestions ?? []).filter((s) => s.keep);
    if (kept.length === 0) return;
    setIsKeeping(true);
    // Each kept suggestion becomes a normal task linked to this goal. Created one
    // at a time so they land in the order they were suggested.
    let created = 0;
    try {
      for (const s of kept) {
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: s.title,
            description: s.description,
            estimatedMinutes: s.estimatedMinutes,
            energyLevel: s.energyLevel,
            goalId: goal.id,
          }),
        });
        if (!res.ok) throw new Error(`POST /api/tasks ${res.status}`);
        created++;
      }
      toast.success(`Added ${created} step${created === 1 ? "" : "s"}.`);
      setSuggestions(null);
    } catch (error) {
      console.error("Failed to keep suggested steps:", error);
      toast.error(
        created > 0
          ? `Added ${created} of ${kept.length} steps — the rest didn't save.`
          : "Couldn't add those steps. Try again."
      );
      // Drop the ones that did save so a retry doesn't duplicate them.
      setSuggestions((prev) => {
        if (!prev) return prev;
        const savedTitles = new Set(kept.slice(0, created).map((s) => s.title));
        return prev.filter((s) => !savedTitles.has(s.title));
      });
    } finally {
      setIsKeeping(false);
      onChanged();
    }
  }

  const renderStep = (task: Task) => {
    const done = task.status === "completed";
    const when = done ? null : stepWhen(task, timezone);
    return (
      <li key={task.id} className="group flex items-start gap-3 rounded-md px-2 py-2 hover:bg-accent/40">
        <Checkbox
          checked={done}
          disabled={busyTaskId === task.id}
          onCheckedChange={() => toggleStep(task)}
          aria-label={done ? `Mark “${task.title}” not done` : `Mark “${task.title}” done`}
          className="mt-0.5"
        />
        <button
          type="button"
          onClick={() => setSelectedTaskId(task.id)}
          className="min-w-0 flex-1 text-left"
        >
          <span className={cn("block text-sm break-words", done && "text-muted-foreground line-through")}>
            {task.title}
          </span>
          {when && <span className="block text-xs text-muted-foreground">{when}</span>}
        </button>
        <button
          type="button"
          onClick={() => unlinkStep(task)}
          disabled={busyTaskId === task.id}
          className="shrink-0 rounded p-1 text-muted-foreground/60 opacity-100 hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100"
          aria-label={`Remove “${task.title}” from this goal`}
          title="Remove from this goal"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </li>
    );
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Steps</h2>
        <div className="flex flex-wrap gap-2">
          {linkable.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setLinkOpen(true)}>
              <Link2 className="mr-1.5 h-3.5 w-3.5" />
              Link tasks
            </Button>
          )}
          {isActive && (
            <Button size="sm" variant="outline" onClick={suggestSteps} disabled={isSuggesting}>
              {isSuggesting ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              )}
              Break it down
            </Button>
          )}
        </div>
      </div>

      {/* Suggestions — nothing is created until you keep them */}
      {suggestions && (
        <div className="space-y-3 rounded-lg border border-dashed border-primary/50 p-3">
          <p className="text-sm text-muted-foreground">
            Some first steps. Untick any you don&apos;t want.
          </p>
          <ul className="space-y-2">
            {suggestions.map((s, i) => (
              <li key={`${s.title}-${i}`} className="flex items-start gap-3">
                <Checkbox
                  id={`suggestion-${i}`}
                  checked={s.keep}
                  onCheckedChange={(v) =>
                    setSuggestions((prev) =>
                      prev ? prev.map((p, j) => (j === i ? { ...p, keep: v === true } : p)) : prev
                    )
                  }
                  className="mt-0.5"
                />
                <label htmlFor={`suggestion-${i}`} className="min-w-0 flex-1 cursor-pointer">
                  <span className="block text-sm">{s.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    ~{s.estimatedMinutes} min · {s.energyLevel} energy
                    {s.description && ` · ${s.description}`}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSuggestions(null)} disabled={isKeeping}>
              Dismiss
            </Button>
            <Button
              size="sm"
              onClick={keepSuggestions}
              disabled={isKeeping || !suggestions.some((s) => s.keep)}
            >
              {isKeeping && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Add {suggestions.filter((s) => s.keep).length} step
              {suggestions.filter((s) => s.keep).length === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      )}

      {/* Quick add */}
      {goal.status !== "completed" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void addStep();
          }}
          className="flex gap-2"
        >
          <Input
            value={newStep}
            onChange={(e) => setNewStep(e.target.value)}
            placeholder="Add a step toward this goal…"
            disabled={isAdding}
            aria-label="New step"
          />
          <Button type="submit" size="sm" disabled={isAdding || !newStep.trim()} className="shrink-0">
            {isAdding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            <span className="sr-only sm:not-sr-only sm:ml-1.5">Add</span>
          </Button>
        </form>
      )}

      {openSteps.length > 0 ? (
        <ul className="space-y-0.5">{openSteps.map(renderStep)}</ul>
      ) : (
        steps.length === 0 &&
        !suggestions && (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            No steps yet. Add the smallest first move above
            {isActive ? ", or let “Break it down” suggest a few." : "."}
          </p>
        )
      )}

      {doneSteps.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            aria-expanded={showDone}
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !showDone && "-rotate-90")} />
            {doneSteps.length} done
          </button>
          {showDone && <ul className="mt-1 space-y-0.5">{doneSteps.map(renderStep)}</ul>}
        </div>
      )}

      <LinkTasksDialog
        open={linkOpen}
        goalId={goal.id}
        tasks={linkable}
        onClose={() => setLinkOpen(false)}
        onLinked={onChanged}
      />

      <TaskDetailModal
        task={selectedTask}
        onClose={() => setSelectedTaskId(null)}
        onUpdate={onChanged}
      />
    </section>
  );
}
