"use client";

import { useState, useEffect } from "react";
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
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { priorityOptions, energyOptions, categoryOptions } from "./task-config";

interface CreateTaskModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
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
}

const DEFAULT_FORM: FormState = {
  title: "",
  description: "",
  priority: "normal",
  energyLevel: "medium",
  category: "",
  locationTags: [],
  estimatedMinutes: "",
  deadline: "",
};

export function CreateTaskModal({ open, onClose, onCreated }: CreateTaskModalProps) {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [savedLocations, setSavedLocations] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetch("/api/locations")
      .then((r) => r.json())
      .then((data) => setSavedLocations(data.locations ?? []))
      .catch(() => {});
  }, []);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) setForm(DEFAULT_FORM);
  }, [open]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleCreate() {
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description || null,
          priority: form.priority,
          energyLevel: form.energyLevel,
          estimatedMinutes: form.estimatedMinutes || null,
          category: form.category || null,
          locationTags: form.locationTags.length ? form.locationTags : null,
          deadline: form.deadline ? new Date(form.deadline).toISOString() : null,
        }),
      });

      if (!res.ok) throw new Error("Failed to create task");

      toast.success("Task created");
      onCreated();
      onClose();
    } catch {
      toast.error("Failed to create task");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Task</DialogTitle>
          <DialogDescription>Add a task directly to your list.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="create-task-title">Title</Label>
            <Input
              id="create-task-title"
              value={form.title}
              onChange={(e) => updateField("title", e.target.value)}
              placeholder="What needs to get done?"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="create-task-description">Description</Label>
            <Textarea
              id="create-task-description"
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
              <Select value={form.priority} onValueChange={(v) => updateField("priority", v)}>
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
              <Select value={form.energyLevel} onValueChange={(v) => updateField("energyLevel", v)}>
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
                onValueChange={(v) => updateField("category", v === "none" ? "" : v)}
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

          {/* Time Estimate */}
          <div className="space-y-2">
            <Label htmlFor="create-task-time">Time Estimate (min)</Label>
            <Input
              id="create-task-time"
              type="number"
              min={1}
              value={form.estimatedMinutes}
              onChange={(e) => updateField("estimatedMinutes", e.target.value)}
              placeholder="e.g. 30"
            />
          </div>

          {/* Deadline */}
          <div className="space-y-2">
            <Label htmlFor="create-task-deadline">Deadline</Label>
            <Input
              id="create-task-deadline"
              type="datetime-local"
              value={form.deadline}
              onChange={(e) => updateField("deadline", e.target.value)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={isSaving || !form.title.trim()}>
            {isSaving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Create Task
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
