"use client";

import { useState, useEffect } from "react";
import confetti from "canvas-confetti";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
import { Loader2, Check, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import type { Task } from "@/types";
import {
  priorityOptions,
  energyOptions,
  categoryOptions,
  locationOptions,
  statusOptions,
} from "./task-config";

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
  status: string;
}

function toDatetimeLocal(isoString: string): string {
  const date = new Date(isoString);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function formFromTask(task: Task): FormState {
  return {
    title: task.title,
    description: task.description ?? "",
    priority: task.priority,
    energyLevel: task.energyLevel,
    category: task.category ?? "",
    locationTags: task.locationTags ?? [],
    estimatedMinutes: task.estimatedMinutes?.toString() ?? "",
    deadline: task.deadline ? toDatetimeLocal(task.deadline) : "",
    status: task.status,
  };
}

export function TaskDetailModal({
  task,
  onClose,
  onUpdate,
}: TaskDetailModalProps) {
  const [form, setForm] = useState<FormState>({
    title: "",
    description: "",
    priority: "normal",
    energyLevel: "medium",
    category: "",
    locationTags: [],
    estimatedMinutes: "",
    deadline: "",
    status: "pending",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Reset form when task changes
  useEffect(() => {
    if (task) {
      setForm(formFromTask(task));
    }
  }, [task]);

  if (!task) return null;

  const isCompleted = task.status === "completed";

  // Dirty check — has form changed from original task?
  const original = formFromTask(task);
  const hasChanges = (Object.keys(original) as (keyof FormState)[]).some(
    (key) => {
      if (key === "locationTags") {
        return JSON.stringify(form.locationTags) !== JSON.stringify(original.locationTags);
      }
      return form[key] !== original[key];
    }
  );

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!task || !form.title.trim()) {
      toast.error("Title is required");
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
          ? new Date(form.deadline).toISOString()
          : null;
      if (form.status !== original.status) payload.status = form.status;

      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Failed to save");

      toast.success("Task updated");
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
      toast.success(isCompleted ? "Task reopened" : "Task completed!");
      if (!isCompleted) {
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.7 } });
      }
      onUpdate();
      onClose();
    } catch {
      toast.error("Failed to update task");
    }
  }

  async function handleDelete() {
    if (!task) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Task deleted");
      onUpdate();
      onClose();
    } catch {
      toast.error("Failed to delete task");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Dialog open={!!task} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Task</DialogTitle>
          <DialogDescription>
            Make changes and hit save.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={form.title}
              onChange={(e) => updateField("title", e.target.value)}
              placeholder="Task title"
            />
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
          <div className="grid grid-cols-2 gap-4">
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
          <div className="grid grid-cols-2 gap-4">
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
              <div className="flex flex-wrap gap-3 pt-1">
                {locationOptions.map((opt) => {
                  const checked = form.locationTags.includes(opt.value);
                  return (
                    <label
                      key={opt.value}
                      className="flex items-center gap-1.5 text-sm cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked
                            ? form.locationTags.filter((t) => t !== opt.value)
                            : [...form.locationTags, opt.value];
                          updateField("locationTags", next);
                        }}
                        className="accent-primary h-4 w-4 rounded"
                      />
                      {opt.label}
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                None checked = can be done anywhere
              </p>
            </div>
          </div>

          {/* Time Estimate + Status */}
          <div className="grid grid-cols-2 gap-4">
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

          {/* Deadline */}
          <div className="space-y-2">
            <Label htmlFor="task-deadline">Deadline</Label>
            <Input
              id="task-deadline"
              type="datetime-local"
              value={form.deadline}
              onChange={(e) => updateField("deadline", e.target.value)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <div className="flex gap-2">
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
              variant="outline"
              size="sm"
              onClick={handleDelete}
              disabled={isDeleting}
              className="text-destructive hover:text-destructive"
            >
              {isDeleting ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              Delete
            </Button>
          </div>

          <div className="flex gap-2">
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
