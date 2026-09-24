"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { fireTaskConfetti } from "@/lib/utils/confetti";
import confetti from "canvas-confetti";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Loader2, Check, Trash2, Undo2, Layers, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import type { Task, ProgressStep } from "@/types";
import { toUserLocal, toUTC } from "@/lib/timezone";
import { useTimezone } from "@/hooks/use-timezone";
import { SourceBackBadge } from "@/components/shared/source-back-badge";
import {
  priorityOptions,
  energyOptions,
  categoryOptions,
  statusOptions,
} from "./task-config";
import { OptionalDateTimeField } from "./optional-datetime-field";

interface TaskSessionView {
  id: string;
  startsAt: string;
  /** Explicit length; null = an even share of the estimate. */
  minutes: number | null;
  /** What the sitting actually runs, with the share worked out. */
  resolvedMinutes?: number | null;
}

/**
 * Stand-in id for a plan that lives only in `tasks.scheduled_for`.
 *
 * The MCP server writes that column directly and deploys separately, so a task
 * Coru planned has a block on the calendar but no session row yet. Listing it
 * as a sitting keeps this modal honest about what the calendar is drawing; its
 * edits route through the task PATCH, which turns it into a real session.
 */
const LEGACY_SESSION_ID = "legacy";

interface TaskDetailModalProps {
  task: Task | null;
  onClose: () => void;
  onUpdate: () => void;
}

interface FormState {
  title: string;
  description: string;
  priority: string;
  energyLevel: string;
  category: string;
  locationTags: string[];
  estimatedMinutes: string;
  deadline: string;
  targetDate: string;
  status: string;
  goalId: string;
}

/** "Thu, Sep 11 at 2:00 PM" — enough to place a sitting without a calendar. */
function formatSessionLabel(isoString: string, timezone: string): string {
  return new Date(isoString).toLocaleString("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function toDatetimeLocal(isoString: string, timezone: string): string {
  const local = toUserLocal(new Date(isoString), timezone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${local.year}-${pad(local.month)}-${pad(local.day)}T${pad(local.hour)}:${pad(local.minute)}`;
}

function formFromTask(task: Task, timezone: string): FormState {
  return {
    title: task.title,
    description: task.description ?? "",
    priority: task.priority,
    energyLevel: task.energyLevel,
    category: task.category ?? "",
    locationTags: task.locationTags ?? [],
    estimatedMinutes: task.estimatedMinutes?.toString() ?? "",
    deadline: task.deadline ? toDatetimeLocal(task.deadline, timezone) : "",
    targetDate: task.targetDate
      ? toDatetimeLocal(task.targetDate, timezone)
      : "",
    status: task.status,
    goalId: task.goalId ?? "",
  };
}

export function TaskDetailModal({
  task,
  onClose,
  onUpdate,
}: TaskDetailModalProps) {
  const timezone = useTimezone();
  const [form, setForm] = useState<FormState>({
    title: "",
    description: "",
    priority: "normal",
    energyLevel: "medium",
    category: "",
    locationTags: [],
    estimatedMinutes: "",
    deadline: "",
    targetDate: "",
    status: "pending",
    goalId: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isChunking, setIsChunking] = useState(false);
  const [localStepIndex, setLocalStepIndex] = useState(0);
  const [savedLocations, setSavedLocations] = useState<{ id: string; name: string }[]>([]);
  const [goals, setGoals] = useState<{ id: string; title: string }[]>([]);
  // Every planned sitting for this task. All of them are editable in place —
  // the plan is a list, so no single one of them is privileged.
  const [sessions, setSessions] = useState<TaskSessionView[]>([]);
  const [newSessionAt, setNewSessionAt] = useState("");
  const [isAddingSession, setIsAddingSession] = useState(false);
  // Which row is mid-write, so it can't be edited twice at once.
  const [busySessionId, setBusySessionId] = useState<string | null>(null);

  // Fetch user's saved locations and goals
  useEffect(() => {
    fetch("/api/locations")
      .then((r) => r.json())
      .then((data) => setSavedLocations(data.locations ?? []))
      .catch(() => {});
    fetch("/api/goals?status=active")
      .then((r) => r.json())
      .then((data) => setGoals(data.goals ?? []))
      .catch(() => {});
  }, []);

  const loadSessions = useCallback(async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/sessions`);
      if (!res.ok) return;
      const data = await res.json();
      setSessions(data.sessions ?? []);
    } catch {
      // A failed load just means no extra sittings are listed; the primary
      // "Planned for" field still works off the task itself.
    }
  }, []);

  // Reset form and step index when task changes
  useEffect(() => {
    if (task) {
      setForm(formFromTask(task, timezone));
      setLocalStepIndex(task.currentStepIndex ?? 0);
      setNewSessionAt("");
      void loadSessions(task.id);
    }
    // timezone is a dep: useTimezone starts on the browser zone and re-renders
    // with the stored one, and the datetime-local strings are built from it.
  }, [task, timezone, loadSessions]);

  // Every sitting gets a row. A task planned only through `tasks.scheduled_for`
  // has no session row yet, so it is shown as one — see LEGACY_SESSION_ID.
  const plannedSittings = useMemo<TaskSessionView[]>(() => {
    if (sessions.length > 0) return sessions;
    if (task?.scheduledFor) {
      return [
        { id: LEGACY_SESSION_ID, startsAt: task.scheduledFor, minutes: null },
      ];
    }
    return [];
  }, [sessions, task?.scheduledFor]);

  const handleAddSession = useCallback(async () => {
    if (!task || !newSessionAt) return;
    setIsAddingSession(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startsAt: toUTC(newSessionAt, timezone) }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Couldn't add that session");
      }
      setNewSessionAt("");
      await loadSessions(task.id);
      onUpdate?.();
      toast.success("Sitting added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add that sitting");
    } finally {
      setIsAddingSession(false);
    }
  }, [task, newSessionAt, timezone, loadSessions, onUpdate]);

  /**
   * Move one sitting. Every row uses this, not just the earliest — a plan whose
   * later sittings can only be deleted and retyped isn't really editable.
   */
  const handleMoveSession = useCallback(
    async (sessionId: string, localValue: string) => {
      if (!task || !localValue) return;
      setBusySessionId(sessionId);
      try {
        const startsAt = toUTC(localValue, timezone);
        const res =
          sessionId === LEGACY_SESSION_ID
            ? await fetch(`/api/tasks/${task.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ scheduledFor: startsAt }),
              })
            : await fetch(`/api/tasks/${task.id}/sessions/${sessionId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ startsAt }),
              });
        if (!res.ok) throw new Error();
        onUpdate?.();
        toast.success("Sitting moved");
      } catch {
        toast.error("Couldn't move that sitting");
      } finally {
        // Reload either way: on failure this snaps the row back to the time the
        // server actually has, rather than leaving a lie in the input.
        await loadSessions(task.id);
        setBusySessionId(null);
      }
    },
    [task, timezone, loadSessions, onUpdate]
  );

  /**
   * Pin one sitting's length, or pass null to hand it back to the even split.
   * The other auto-length sittings re-divide whatever is left.
   */
  const handleSetSessionLength = useCallback(
    async (session: TaskSessionView, minutes: number | null) => {
      if (!task) return;
      setBusySessionId(session.id);
      try {
        const res = await fetch(`/api/tasks/${task.id}/sessions/${session.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startsAt: session.startsAt, minutes }),
        });
        if (!res.ok) throw new Error();
        onUpdate?.();
      } catch {
        toast.error("Couldn't change that sitting's length");
      } finally {
        await loadSessions(task.id);
        setBusySessionId(null);
      }
    },
    [task, loadSessions, onUpdate]
  );

  const handleRemoveSession = useCallback(
    async (sessionId: string) => {
      if (!task) return;
      setBusySessionId(sessionId);
      try {
        const res =
          sessionId === LEGACY_SESSION_ID
            ? await fetch(`/api/tasks/${task.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ scheduledFor: null }),
              })
            : await fetch(`/api/tasks/${task.id}/sessions/${sessionId}`, {
                method: "DELETE",
              });
        if (!res.ok) throw new Error();
        onUpdate?.();
        toast.success("Sitting removed");
      } catch {
        toast.error("Couldn't remove that sitting");
      } finally {
        await loadSessions(task.id);
        setBusySessionId(null);
      }
    },
    [task, loadSessions, onUpdate]
  );

  const handleStepDone = useCallback(async () => {
    if (!task?.progressSteps) return;
    const nextIndex = localStepIndex + 1;
    const isLast = nextIndex >= task.progressSteps.length;

    if (isLast) {
      fireTaskConfetti();
    } else {
      void confetti({
        particleCount: 60,
        spread: 80,
        startVelocity: 45,
        origin: { x: 0.5, y: 0.6 },
        colors: ["#6bcb77", "#4d96ff", "#ffd93d", "#c77dff"],
        zIndex: 9999,
      });
    }

    setLocalStepIndex(nextIndex);

    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentStepIndex: nextIndex }),
    });

    if (isLast) {
      toast.success("All steps done — task completed!");
      onUpdate();
      onClose();
    }
  }, [task, localStepIndex, onUpdate, onClose]);

  if (!task) return null;

  const isCompleted = task.status === "completed";

  // Dirty check — has form changed from original task?
  const original = formFromTask(task, timezone);
  const hasChanges = (Object.keys(original) as (keyof FormState)[]).some(
    (key) => {
      if (key === "locationTags") {
        return JSON.stringify(form.locationTags) !== JSON.stringify(original.locationTags);
      }
      return form[key] !== original[key];
    }
  );

  // Advisory only — a target after the due date still saves. We warn instead of
  // clamping: a date that silently moves itself is worse than one that's wrong
  // and visible. Both values are datetime-local strings in the same frame.
  const targetAfterDeadline =
    Boolean(form.targetDate) &&
    Boolean(form.deadline) &&
    new Date(form.targetDate) > new Date(form.deadline);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === "title" && titleError) setTitleError(null);
  }

  async function handleSave() {
    if (!task || !form.title.trim()) {
      setTitleError("Title is required");
      return;
    }

    setIsSaving(true);
    try {
      const payload: Record<string, unknown> = {};

      if (form.title !== original.title) payload.title = form.title.trim();
      if (form.description !== original.description)
        payload.description = form.description || null;
      if (form.priority !== original.priority) payload.priority = form.priority;
      if (form.energyLevel !== original.energyLevel)
        payload.energyLevel = form.energyLevel;
      if (form.category !== original.category)
        payload.category = form.category || null;
      if (JSON.stringify(form.locationTags) !== JSON.stringify(original.locationTags))
        payload.locationTags = form.locationTags.length ? form.locationTags : null;
      if (form.estimatedMinutes !== original.estimatedMinutes)
        payload.estimatedMinutes = form.estimatedMinutes
          ? parseInt(form.estimatedMinutes)
          : null;
      if (form.deadline !== original.deadline)
        payload.deadline = form.deadline
          ? toUTC(form.deadline, timezone)
          : null;
      if (form.targetDate !== original.targetDate)
        payload.targetDate = form.targetDate
          ? toUTC(form.targetDate, timezone)
          : null;
      if (form.status !== original.status) payload.status = form.status;
      if (form.goalId !== original.goalId)
        payload.goalId = form.goalId || null;

      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Failed to save");

      toast.success(`'${form.title.trim()}' updated`);
      onUpdate();
      onClose();
    } catch {
      toast.error("Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleComplete() {
    if (!task) return;
    const newStatus = isCompleted ? "pending" : "completed";
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error();
      toast.success(isCompleted ? `'${task.title}' reopened` : `'${task.title}' marked complete`);
      if (!isCompleted) {
        fireTaskConfetti();
      }
      onUpdate();
      onClose();
    } catch {
      toast.error("Failed to update task");
    }
  }

  async function handleDelete() {
    if (!task) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    setIsDeleting(true);
    setConfirmDelete(false);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success(`'${task.title}' deleted`);
      onUpdate();
      onClose();
    } catch {
      toast.error("Failed to delete task");
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleChunk() {
    if (!task) return;
    setIsChunking(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/chunk`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to chunk task");
      toast.success(`Chunked into ${data.steps.length} steps!`);
      setLocalStepIndex(0);
      onUpdate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't chunk task");
    } finally {
      setIsChunking(false);
    }
  }

  // Derived step data
  const steps = (task?.progressSteps as ProgressStep[] | null) ?? null;
  const currentStep = steps?.[localStepIndex] ?? null;
  const nextStep = steps?.[localStepIndex + 1] ?? null;
  const hasSteps = steps !== null && steps.length > 0;
  const allStepsDone = hasSteps && localStepIndex >= steps.length;
  const canChunk = !hasSteps && !isCompleted;

  return (
    <Dialog open={!!task} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Task</DialogTitle>
          <DialogDescription>
            Make changes and hit save.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 space-y-4">
          {(task.sourceDumpId || task.sourceEventId) && (
            <SourceBackBadge
              sourceDumpId={task.sourceDumpId}
              sourceEventId={task.sourceEventId}
            />
          )}

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={form.title}
              onChange={(e) => updateField("title", e.target.value)}
              placeholder="Task title"
              aria-invalid={!!titleError}
              className={titleError ? "border-destructive" : ""}
            />
            {titleError && (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-3 w-3 shrink-0" />
                {titleError}
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="task-description">Description</Label>
            <Textarea
              id="task-description"
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              placeholder="Add details..."
              className="min-h-[80px] resize-none"
            />
          </div>

          {/* Priority + Energy */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select
                value={form.priority}
                onValueChange={(v) => updateField("priority", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {priorityOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Energy Level</Label>
              <Select
                value={form.energyLevel}
                onValueChange={(v) => updateField("energyLevel", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {energyOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Category + Location */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={form.category || "none"}
                onValueChange={(v) =>
                  updateField("category", v === "none" ? "" : v)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {categoryOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Location</Label>
              {savedLocations.length === 0 ? (
                <p className="text-xs text-muted-foreground pt-1">
                  No saved locations. Add them in Settings.
                </p>
              ) : (
                <div className="flex flex-wrap gap-3 pt-1">
                  {savedLocations.map((loc) => {
                    const checked = form.locationTags.includes(loc.name);
                    return (
                      <label
                        key={loc.id}
                        className="flex items-center gap-1.5 text-sm cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const next = checked
                              ? form.locationTags.filter((t) => t !== loc.name)
                              : [...form.locationTags, loc.name];
                            updateField("locationTags", next);
                          }}
                          className="accent-primary h-4 w-4 rounded"
                        />
                        {loc.name}
                      </label>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                None checked = can be done anywhere
              </p>
            </div>
          </div>

          {/* Time Estimate + Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="task-time">Time Estimate (min)</Label>
              <Input
                id="task-time"
                type="number"
                min={1}
                value={form.estimatedMinutes}
                onChange={(e) => updateField("estimatedMinutes", e.target.value)}
                placeholder="e.g. 30"
              />
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => updateField("status", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Deadline — hard, externally imposed */}
          <OptionalDateTimeField
            id="task-deadline"
            label="Due"
            value={form.deadline}
            onChange={(v) => updateField("deadline", v)}
            hint="When it's actually due — a date something outside you set."
          />

          {/* Target — soft, self-imposed */}
          <OptionalDateTimeField
            id="task-target"
            label="Target"
            value={form.targetDate}
            onChange={(v) => updateField("targetDate", v)}
            hint="When you want it done. Reminders about a target stay gentle."
          >
            {targetAfterDeadline && (
              <p className="flex items-center gap-1 text-xs text-adhd-amber">
                <AlertCircle className="h-3 w-3 shrink-0" />
                Your target is after the due date. That still saves — just
                double-check it&apos;s what you meant.
              </p>
            )}
          </OptionalDateTimeField>

          {/* Planned sittings — the "when", not the "by when". Big tasks rarely
              happen in one go, so the plan is a LIST: every row here is a real
              block on the calendar, and every one of them can be moved or
              dropped. This section used to be gated on the first sitting, which
              made clearing that one hide the rest of a plan that still existed. */}
          <div className="space-y-2 rounded-lg border border-border/70 p-3">
            <div className="flex items-center gap-2">
              <Layers className="h-3.5 w-3.5 text-muted-foreground" />
              <Label className="text-sm">Planned sittings</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              When you plan to work on this. Each sitting is its own block on
              your calendar, and edits here save as you make them.
            </p>

            {plannedSittings.length > 0 ? (
              <ul className="space-y-1.5">
                {plannedSittings.map((session, i) => (
                  <SittingRow
                    // The stored time is part of the key on purpose: a row
                    // holds a draft, and remounting is how it picks up a time
                    // that changed under it (a move, a calendar drag, a failed
                    // write snapping back).
                    key={`${session.id}:${session.startsAt}:${session.minutes ?? "auto"}:${session.resolvedMinutes ?? ""}`}
                    index={i}
                    session={session}
                    timezone={timezone}
                    isBusy={busySessionId === session.id}
                    onMove={(value) => handleMoveSession(session.id, value)}
                    onSetLength={(minutes) => handleSetSessionLength(session, minutes)}
                    onRemove={() => handleRemoveSession(session.id)}
                  />
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                Nothing planned yet. Add a sitting to put this on your calendar.
              </p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                type="datetime-local"
                value={newSessionAt}
                onChange={(e) => setNewSessionAt(e.target.value)}
                className="flex-1"
                aria-label="Start of another sitting"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleAddSession}
                disabled={!newSessionAt || isAddingSession}
                className="shrink-0"
              >
                {isAddingSession ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Add sitting"
                )}
              </Button>
            </div>
          </div>

          {/* Goal */}
          {goals.length > 0 && (
            <div className="space-y-2">
              <Label>Goal</Label>
              <Select
                value={form.goalId || "none"}
                onValueChange={(v) => updateField("goalId", v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {goals.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Progress Steps — step-through UI */}
          {hasSteps && !allStepsDone && currentStep && (
            <div className="space-y-3 rounded-lg border border-adhd-teal/20 bg-adhd-teal/5 p-4 dark:border-adhd-sage/30 dark:bg-adhd-sage/5">
              {/* Breadcrumb dots */}
              <div className="flex items-center gap-1.5">
                {steps.map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "h-2.5 w-2.5 rounded-full transition-colors",
                      i < localStepIndex
                        ? "bg-adhd-teal dark:bg-adhd-sage"
                        : i === localStepIndex
                          ? "bg-adhd-teal/60 ring-2 ring-adhd-teal ring-offset-1 ring-offset-background dark:bg-adhd-sage/60 dark:ring-adhd-sage"
                          : "border border-border bg-transparent"
                    )}
                  />
                ))}
                <span className="ml-2 text-xs text-muted-foreground">
                  {localStepIndex}/{steps.length}
                </span>
              </div>

              {/* Current step card */}
              <div className="rounded-lg border-l-4 border-l-adhd-teal bg-card p-3 shadow-sm dark:border-l-adhd-sage">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-adhd-teal dark:text-adhd-sage">
                  Do this now
                </p>
                <p className="mb-2 text-base font-semibold">{currentStep.title}</p>
                <Badge variant="outline">~{currentStep.estimatedMinutes} min</Badge>
              </div>

              {/* Action button */}
              <Button className="w-full" onClick={handleStepDone}>
                {localStepIndex === steps.length - 1
                  ? "Done — finish task!"
                  : "Done, next step"}
              </Button>

              {/* Next up preview */}
              {nextStep && (
                <div className="rounded-md bg-muted/50 px-3 py-2 opacity-60">
                  <p className="text-xs text-muted-foreground">Next up</p>
                  <p className="text-sm font-medium">{nextStep.title}</p>
                </div>
              )}
            </div>
          )}

          {/* All steps done indicator */}
          {hasSteps && allStepsDone && (
            <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/5 p-3">
              <Check className="h-4 w-4 text-success" />
              <span className="text-sm font-medium text-success">All {steps.length} steps completed!</span>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="flex flex-wrap gap-2 pt-4 border-t border-border sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleComplete}
            >
              {isCompleted ? (
                <>
                  <Undo2 className="mr-1.5 h-3.5 w-3.5" />
                  Reopen
                </>
              ) : (
                <>
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                  Complete
                </>
              )}
            </Button>
            <Button
              variant={confirmDelete ? "destructive" : "outline"}
              size="sm"
              onClick={handleDelete}
              disabled={isDeleting}
              className={confirmDelete ? undefined : "text-destructive hover:text-destructive"}
            >
              {isDeleting ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              {confirmDelete ? "Confirm delete?" : "Delete"}
            </Button>
          </div>

          <div className="flex gap-2">
            {canChunk && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleChunk}
                disabled={isChunking}
              >
                {isChunking ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Layers className="mr-1.5 h-3.5 w-3.5" />
                )}
                {isChunking ? "Chunking..." : "Chunk it"}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving || !hasChanges}
            >
              {isSaving ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface SittingRowProps {
  index: number;
  session: TaskSessionView;
  timezone: string;
  isBusy: boolean;
  onMove: (localValue: string) => void;
  onSetLength: (minutes: number | null) => void;
  onRemove: () => void;
}

/**
 * One editable sitting.
 *
 * Holds its own draft so nudging a time doesn't fire a write per keystroke —
 * the move commits on blur or Enter. An emptied input reverts to the stored
 * time rather than quietly unscheduling the block: dropping a sitting is the
 * trash button's job, and it should take a deliberate press.
 */
function SittingRow({
  index,
  session,
  timezone,
  isBusy,
  onMove,
  onSetLength,
  onRemove,
}: SittingRowProps) {
  const serverValue = toDatetimeLocal(session.startsAt, timezone);
  // Seeded once per mount. The caller keys this row on the stored time, so a
  // time that changes under us arrives as a fresh row rather than an effect
  // racing the draft the user is typing.
  const [draft, setDraft] = useState(serverValue);
  // Empty = automatic (even share), shown as the placeholder.
  const [lengthDraft, setLengthDraft] = useState(
    session.minutes != null ? String(session.minutes) : ""
  );
  const isLegacy = session.id === LEGACY_SESSION_ID;

  const label = formatSessionLabel(session.startsAt, timezone);

  function commit() {
    if (!draft) {
      setDraft(serverValue);
      return;
    }
    if (draft !== serverValue) onMove(draft);
  }

  function commitLength() {
    const trimmed = lengthDraft.trim();
    const next = trimmed === "" ? null : Math.round(Number(trimmed));
    if (next !== null && (!Number.isFinite(next) || next <= 0)) {
      setLengthDraft(session.minutes != null ? String(session.minutes) : "");
      return;
    }
    if (next !== session.minutes) onSetLength(next);
  }

  return (
    <li className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5">
      <span className="w-4 shrink-0 text-xs tabular-nums text-muted-foreground">
        {index + 1}.
      </span>
      <Input
        type="datetime-local"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        disabled={isBusy}
        className="h-8 flex-1 bg-background"
        aria-label={`Start of the sitting on ${label}`}
      />
      {!isLegacy && (
        <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            value={lengthDraft}
            placeholder={session.resolvedMinutes != null ? String(session.resolvedMinutes) : "auto"}
            onChange={(e) => setLengthDraft(e.target.value)}
            onBlur={commitLength}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            disabled={isBusy}
            className="h-8 w-16 bg-background px-2 tabular-nums"
            aria-label={`Length of the sitting on ${label}, in minutes. Leave empty to split the estimate evenly.`}
            title="Leave empty to split the task's estimate evenly across sittings"
          />
          min
        </label>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
        disabled={isBusy}
        aria-label={`Remove the sitting on ${label}`}
      >
        {isBusy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
      </Button>
    </li>
  );
}
