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
import { Loader2, Trash2, Copy } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { EVENT_CATEGORIES } from "@/lib/calendar/colors";
import type { CalendarEvent, EventCategory } from "@/types";

interface EditEventDialogProps {
  event: CalendarEvent | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  onDuplicate?: (event: CalendarEvent) => void;
}

interface FormState {
  title: string;
  description: string;
  location: string;
  date: string;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
  category: EventCategory;
  editMode: "single" | "series";
}

function toDateInput(isoString: string): string {
  // Use local date (not UTC date) so date/time fields are consistent
  const d = new Date(isoString);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toTimeInput(isoString: string): string {
  const d = new Date(isoString);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function buildIso(date: string, time: string): string {
  // Construct as local time and convert to UTC via .toISOString()
  // new Date("YYYY-MM-DDTHH:MM:SS") in a browser = local time
  return new Date(`${date}T${time}:00`).toISOString();
}

export function EditEventDialog({
  event,
  onClose,
  onSaved,
  onDeleted,
  onDuplicate,
}: EditEventDialogProps) {
  const [form, setForm] = useState<FormState>({
    title: "",
    description: "",
    location: "",
    date: "",
    startTime: "09:00",
    endTime: "10:00",
    isAllDay: false,
    category: "personal",
    editMode: "single",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (event) {
      setForm({
        title: event.title.replace(/^\[CC\] /, ""),
        description: event.description ?? "",
        location: event.location ?? "",
        date: toDateInput(event.startTime),
        startTime: event.isAllDay ? "00:00" : toTimeInput(event.startTime),
        endTime: event.isAllDay ? "23:59" : toTimeInput(event.endTime),
        isAllDay: event.isAllDay,
        category: (event.category as EventCategory) ?? "personal",
        editMode: "single",
      });
    }
  }, [event]);

  if (!event) return null;

  const hasSeries = !!event.seriesId;

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!event) return;
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }

    setIsSaving(true);
    try {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description || null,
        location: form.location || null,
        category: form.category,
      };

      if (!form.isAllDay) {
        payload.startTime = buildIso(form.date, form.startTime);
        payload.endTime = buildIso(form.date, form.endTime);
      }

      payload.isAllDay = form.isAllDay;

      const url =
        form.editMode === "series" && hasSeries
          ? `/api/calendar/events/${event.id}/series`
          : `/api/calendar/events/${event.id}`;

      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Failed to save");

      toast.success(
        form.editMode === "series" ? "All events in series updated" : "Event updated"
      );
      onSaved();
      onClose();
    } catch {
      toast.error("Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!event) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/calendar/events/${event.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Event deleted");
      onDeleted();
      onClose();
    } catch {
      toast.error("Failed to delete event");
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleDeleteSeries() {
    if (!event) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/calendar/events/${event.id}/series`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete series");
      toast.success("Event series deleted");
      onDeleted();
      onClose();
    } catch {
      toast.error("Failed to delete series");
    } finally {
      setIsDeleting(false);
    }
  }

  function handleDuplicate() {
    if (!event) return;
    if (onDuplicate) onDuplicate(event);
    onClose();
  }

  return (
    <Dialog open={!!event} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Event</DialogTitle>
          <DialogDescription>Update this event&apos;s details.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 space-y-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="edit-title">Title</Label>
            <Input
              id="edit-title"
              value={form.title}
              onChange={(e) => updateField("title", e.target.value)}
              placeholder="Event title"
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="edit-description">Description</Label>
            <Textarea
              id="edit-description"
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              placeholder="Add details..."
              className="min-h-[72px] resize-none"
            />
          </div>

          {/* Location */}
          <div className="space-y-2">
            <Label htmlFor="edit-location">Location</Label>
            <Input
              id="edit-location"
              value={form.location}
              onChange={(e) => updateField("location", e.target.value)}
              placeholder="Add location..."
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label>Category</Label>
            <Select
              value={form.category}
              onValueChange={(v) => updateField("category", v as EventCategory)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.key} value={cat.key}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* All-day toggle */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="edit-allday"
              checked={form.isAllDay}
              onChange={(e) => updateField("isAllDay", e.target.checked)}
              className="accent-primary h-4 w-4 rounded"
            />
            <Label htmlFor="edit-allday" className="cursor-pointer font-normal">
              All day
            </Label>
          </div>

          {/* Date + times */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-date">Date</Label>
              <Input
                id="edit-date"
                type="date"
                value={form.date}
                onChange={(e) => updateField("date", e.target.value)}
              />
            </div>
            {!form.isAllDay && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="edit-start">Start</Label>
                  <Input
                    id="edit-start"
                    type="time"
                    value={form.startTime}
                    onChange={(e) => updateField("startTime", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-end">End</Label>
                  <Input
                    id="edit-end"
                    type="time"
                    value={form.endTime}
                    onChange={(e) => updateField("endTime", e.target.value)}
                  />
                </div>
              </>
            )}
          </div>

          {/* Series edit mode (only if part of a series) */}
          {hasSeries && (
            <div className="space-y-2 rounded-md border border-border p-3">
              <p className="text-xs font-medium text-muted-foreground">
                This event is part of a series
              </p>
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="edit-mode"
                    value="single"
                    checked={form.editMode === "single"}
                    onChange={() => updateField("editMode", "single")}
                    className="accent-primary"
                  />
                  Edit this event only
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="edit-mode"
                    value="series"
                    checked={form.editMode === "series"}
                    onChange={() => updateField("editMode", "series")}
                    className="accent-primary"
                  />
                  Edit all events in series
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap gap-2 pt-4 border-t border-border sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
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
            {hasSeries && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDeleteSeries}
                disabled={isDeleting}
                className="text-destructive hover:text-destructive"
              >
                Delete series
              </Button>
            )}
            {onDuplicate && (
              <Button variant="outline" size="sm" onClick={handleDuplicate}>
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                Duplicate
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving || !form.title.trim()}
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
