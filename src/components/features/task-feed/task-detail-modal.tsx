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
import { Loader2, Check, Trash2, Undo2, Layers, AlertCircle, Pencil } from "lucide-react";
import { toast } from "sonner";
import { SessionOutcomePicker } from "@/components/features/task-feed/session-outcome-picker";
import type { SessionOutcome } from "@/lib/calendar/session-minutes";
import type { Task, ProgressStep } from "@/types";
import { toUserLocal, toUTC } from "@/lib/timezone";
import { useTimezone } from "@/hooks/use-timezone";
import { SourceBackBadge } from "@/components/shared/source-back-badge";
import { Markdown } from "@/components/ui/markdown";
import {
  priorityConfig,
  energyConfig,
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
  /** How it went, once logged. */
  status?: SessionOutcome | null;
  actualMinutes?: number | null;
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
  // A tap is usually "what was this again?", not "change it". The modal opens
  // on a read view; Edit swaps the same modal into the form.
  const [mode, setMode] = useState<"view" | "edit">("view");

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

  // Keyed on the id, not the object: the list refetches after every write and
  // hands us a fresh object, which must not kick the user out of the form.
  const taskId = task?.id;
  useEffect(() => {
    setMode("view");
    setConfirmDelete(false);
  }, [taskId]);

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
      toast.success("Session added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add that session");
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
        toast.success("Session moved");
      } catch {
        toast.error("Couldn't move that session");
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
        toast.error("Couldn't change that session's length");
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
        toast.success("Session removed");
      } catch {
        toast.error("Couldn't remove that session");
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

  function cancelEdit() {
    if (!task) return;
    setForm(formFromTask(task, timezone));
    setTitleError(null);
    setMode("view");
  }

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
          {mode === "view" ? (
            <>
              <DialogTitle className="pr-6 leading-snug">{task.title}</DialogTitle>
              <DialogDescription className="sr-only">Task details</DialogDescription>
            </>
          ) : (
            <>
              <DialogTitle>Edit Task</DialogTitle>
              <DialogDescription>
                Make changes and hit save.
              </DialogDescription>
            </>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 space-y-4">
          {(task.sourceDumpId || task.sourceEventId) && (
            <SourceBackBadge
              sourceDumpId={task.sourceDumpId}
              sourceEventId={task.sourceEventId}
            />
          )}

          {mode === "view" ? (
            <TaskReadView
              task={task}
              timezone={timezone}
              sittings={plannedSittings}
              goalTitle={goals.find((g) => g.id === task.goalId)?.title ?? null}
              onOutcomeChanged={() => {
                void loadSessions(task.id);
                onUpdate?.();
              }}
            />
          ) : (
            <>
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
                <Label className="text-sm">Planned sessions</Label>
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
                      key={`${session.id}:${session.startsAt}:${session.minutes ?? "auto"}:${session.resolvedMinutes ?? ""}:${session.status ?? ""}`}
                      index={i}
                      session={session}
                      timezone={timezone}
                      isBusy={busySessionId === session.id}
                      onMove={(value) => handleMoveSession(session.id, value)}
                      onSetLength={(minutes) => handleSetSessionLength(session, minutes)}
                      taskId={task.id}
                      onOutcomeChanged={() => {
                        void loadSessions(task.id);
                        onUpdate?.();
                      }}
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
                  aria-label="Start of another session"
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
                    "Add session"
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
            </>
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
            {mode === "view" && canChunk && (
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
            {mode === "view" ? (
              <Button size="sm" onClick={() => setMode("edit")}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Edit
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={cancelEdit}>
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
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const statusLabel: Record<string, string> = {
  in_progress: "In progress",
  completed: "Completed",
  snoozed: "Snoozed",
  cancelled: "Cancelled",
};

function sittingOutcome(session: TaskSessionView): string | null {
  if (session.status === "done") return `Done · ${session.actualMinutes ?? 0} min`;
  if (session.status === "partial") return `Partly · ${session.actualMinutes ?? 0} min`;
  if (session.status === "skipped") return "Skipped";
  return null;
}

interface TaskReadViewProps {
  task: Task;
  timezone: string;
  sittings: TaskSessionView[];
  goalTitle: string | null;
  onOutcomeChanged: () => void;
}

/**
 * Everything about a task at a glance, nothing to accidentally change. Logging
 * how a past sitting went is the one action here: it's a "doing" step, and
 * hiding it behind Edit would bury the prompt the sitting exists for.
 */
function TaskReadView({ task, timezone, sittings, goalTitle, onOutcomeChanged }: TaskReadViewProps) {
  // Read once per open: "next sitting" doesn't need to tick while you look.
  const [now] = useState(() => Date.now());
  const sorted = [...sittings].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
  );
  const sittingEnd = (s: TaskSessionView) =>
    new Date(s.startsAt).getTime() + (s.resolvedMinutes ?? 30) * 60_000;
  const next = sorted.find((s) => sittingEnd(s) > now) ?? null;
  const priority = priorityConfig[task.priority as keyof typeof priorityConfig];
  const energy = energyConfig[task.energyLevel as keyof typeof energyConfig];

  const details: Array<{ label: string; value: string }> = [];
  if (task.deadline) details.push({ label: "Due", value: formatSessionLabel(task.deadline, timezone) });
  if (task.targetDate) details.push({ label: "Target", value: formatSessionLabel(task.targetDate, timezone) });
  if (next) details.push({ label: "Next sitting", value: formatSessionLabel(next.startsAt, timezone) });
  if (goalTitle) details.push({ label: "Goal", value: goalTitle });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {priority && (
          <Badge variant="outline" className={priority.className}>
            {priority.label}
          </Badge>
        )}
        {energy && <Badge variant="outline">{energy.label}</Badge>}
        {task.estimatedMinutes != null && (
          <Badge variant="outline">~{task.estimatedMinutes} min</Badge>
        )}
        {task.category && (
          <Badge variant="outline" className="capitalize">
            {task.category}
          </Badge>
        )}
        {(task.locationTags ?? []).map((loc) => (
          <Badge key={loc} variant="outline">
            {loc}
          </Badge>
        ))}
        {statusLabel[task.status] && (
          <Badge variant="secondary">{statusLabel[task.status]}</Badge>
        )}
      </div>

      {task.description?.trim() ? (
        <Markdown className="text-sm">{task.description}</Markdown>
      ) : (
        <p className="text-sm text-muted-foreground">No description.</p>
      )}

      {details.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {details.map((d) => (
            <div key={d.label} className="contents">
              <dt className="text-muted-foreground">{d.label}</dt>
              <dd className="min-w-0 break-words">{d.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {sorted.length > 0 && (
        <div className="space-y-1.5">
          <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Layers className="h-3.5 w-3.5" />
            Planned sessions
          </p>
          <ul className="space-y-1">
            {sorted.map((s) => {
              const ended = sittingEnd(s) <= now;
              const outcome = sittingOutcome(s);
              return (
                <li key={s.id} className="space-y-1 rounded-md bg-muted/50 px-2.5 py-1.5 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className={cn(ended && "text-muted-foreground")}>
                      {formatSessionLabel(s.startsAt, timezone)}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {outcome ?? (s.resolvedMinutes != null ? `${s.resolvedMinutes} min` : "")}
                    </span>
                  </div>
                  {ended && !outcome && s.id !== LEGACY_SESSION_ID && (
                    <SessionOutcomePicker
                      taskId={task.id}
                      sessionId={s.id}
                      plannedMinutes={s.resolvedMinutes}
                      onLogged={onOutcomeChanged}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

interface SittingRowProps {
  index: number;
  session: TaskSessionView;
  timezone: string;
  isBusy: boolean;
  onMove: (localValue: string) => void;
  onSetLength: (minutes: number | null) => void;
  taskId: string;
  onOutcomeChanged: () => void;
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
  taskId,
  onOutcomeChanged,
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
  const hasEnded =
    new Date(session.startsAt).getTime() + (session.resolvedMinutes ?? 30) * 60_000 <= Date.now();

  async function clearOutcome() {
    try {
      const res = await fetch(`/api/tasks/${taskId}/sessions/${session.id}/outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: null }),
      });
      if (!res.ok) throw new Error();
      onOutcomeChanged();
    } catch {
      toast.error("Couldn't change that session");
    }
  }

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
    <li className="space-y-1.5 rounded-md bg-muted/50 px-2.5 py-1.5">
      <div className="flex items-center gap-2">
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
        aria-label={`Start of the session on ${label}`}
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
            aria-label={`Length of the session on ${label}, in minutes. Leave empty to split the estimate evenly.`}
            title="Leave empty to split the task's estimate evenly across sessions"
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
        aria-label={`Remove the session on ${label}`}
      >
        {isBusy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
      </Button>
      </div>
      {!isLegacy && hasEnded && (
        session.status ? (
          <p className="flex items-center gap-2 pl-6 text-xs text-muted-foreground">
            {session.status === "done"
              ? `Done · ${session.actualMinutes ?? 0} min`
              : session.status === "partial"
                ? `Partly · ${session.actualMinutes ?? 0} min`
                : "Skipped"}
            <button
              type="button"
              onClick={() => void clearOutcome()}
              className="underline underline-offset-2 hover:text-foreground"
            >
              change
            </button>
          </p>
        ) : (
          <div className="pl-6">
            <SessionOutcomePicker
              taskId={taskId}
              sessionId={session.id}
              plannedMinutes={session.resolvedMinutes}
              onLogged={onOutcomeChanged}
            />
          </div>
        )
      )}
    </li>
  );
}
