"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface CreateEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: {
    title: string;
    description?: string;
    location?: string;
    startTime: string;
    endTime: string;
    isAllDay?: boolean;
    recurrence?: {
      type: "daily" | "weekly";
      daysOfWeek?: number[];
      endDate?: string;
    };
  }) => Promise<{ count: number; seriesId: string | null }>;
  defaultDate?: Date;
}

export function CreateEventDialog({
  open,
  onOpenChange,
  onSubmit,
  defaultDate,
}: CreateEventDialogProps) {
  const today = defaultDate ?? new Date();
  const dateStr = formatDateInput(today);

  const [title, setTitle] = useState("");
  const [date, setDate] = useState(dateStr);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [isAllDay, setIsAllDay] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<
    "none" | "daily" | "weekly"
  >("none");
  const [selectedDays, setSelectedDays] = useState<number[]>([today.getDay()]);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(() => {
    const end = new Date(today);
    end.setDate(end.getDate() + 16 * 7);
    return formatDateInput(end);
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDescription, setShowDescription] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    const now = defaultDate ?? new Date();
    setTitle("");
    setDate(formatDateInput(now));
    setStartTime("09:00");
    setEndTime("10:00");
    setLocation("");
    setDescription("");
    setIsAllDay(false);
    setRecurrenceType("none");
    setSelectedDays([now.getDay()]);
    const end = new Date(now);
    end.setDate(end.getDate() + 16 * 7);
    setRecurrenceEndDate(formatDateInput(end));
    setShowDescription(false);
    setError(null);
  }

  function toggleDay(day: number) {
    setSelectedDays((prev) =>
      prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day].sort()
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    // Build ISO timestamps
    const startISO = isAllDay
      ? `${date}T00:00:00`
      : `${date}T${startTime}:00`;
    const endISO = isAllDay
      ? `${date}T23:59:59`
      : `${date}T${endTime}:00`;

    if (new Date(endISO) <= new Date(startISO) && !isAllDay) {
      setError("End time must be after start time");
      return;
    }

    const recurrence =
      recurrenceType === "none"
        ? undefined
        : {
            type: recurrenceType as "daily" | "weekly",
            daysOfWeek:
              recurrenceType === "weekly" ? selectedDays : undefined,
            endDate: `${recurrenceEndDate}T23:59:59`,
          };

    setIsSubmitting(true);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        startTime: startISO,
        endTime: endISO,
        isAllDay,
        recurrence,
      });
      resetForm();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create event");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForm();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Event</DialogTitle>
          <DialogDescription>
            Create a one-time or recurring calendar event.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="event-title">Title</Label>
            <Input
              id="event-title"
              placeholder="e.g., Biology Class"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          {/* Date */}
          <div className="space-y-2">
            <Label htmlFor="event-date">Date</Label>
            <Input
              id="event-date"
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                // Auto-check the selected day for weekly recurrence
                const d = new Date(e.target.value + "T12:00:00");
                if (!isNaN(d.getTime())) {
                  setSelectedDays((prev) =>
                    prev.includes(d.getDay()) ? prev : [...prev, d.getDay()]
                  );
                }
              }}
            />
          </div>

          {/* All Day Toggle */}
          <div className="flex items-center gap-3">
            <Switch
              id="all-day"
              checked={isAllDay}
              onCheckedChange={setIsAllDay}
            />
            <Label htmlFor="all-day">All day</Label>
          </div>

          {/* Time Inputs */}
          {!isAllDay && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="event-start">Start</Label>
                <Input
                  id="event-start"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-end">End</Label>
                <Input
                  id="event-end"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Location */}
          <div className="space-y-2">
            <Label htmlFor="event-location">Location (optional)</Label>
            <Input
              id="event-location"
              placeholder="e.g., Room 204"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>

          {/* Recurrence */}
          <div className="space-y-2">
            <Label>Repeats</Label>
            <Select
              value={recurrenceType}
              onValueChange={(v) =>
                setRecurrenceType(v as "none" | "daily" | "weekly")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Does not repeat</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Weekly Day Picker */}
          {recurrenceType === "weekly" && (
            <div className="space-y-2">
              <Label>Repeat on</Label>
              <div className="flex gap-1">
                {DAY_LABELS.map((label, i) => (
                  <label
                    key={i}
                    className="flex flex-col items-center gap-1 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedDays.includes(i)}
                      onCheckedChange={() => toggleDay(i)}
                    />
                    <span className="text-xs text-muted-foreground">
                      {label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Recurrence End Date */}
          {recurrenceType !== "none" && (
            <div className="space-y-2">
              <Label htmlFor="recurrence-end">Repeat until</Label>
              <Input
                id="recurrence-end"
                type="date"
                value={recurrenceEndDate}
                onChange={(e) => setRecurrenceEndDate(e.target.value)}
              />
            </div>
          )}

          {/* Description (collapsible) */}
          {!showDescription ? (
            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowDescription(true)}
            >
              + Add description
            </button>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="event-description">Description</Label>
              <Textarea
                id="event-description"
                placeholder="Optional details..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                resetForm();
                onOpenChange(false);
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              ) : null}
              {recurrenceType !== "none" ? "Create Series" : "Create Event"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function formatDateInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
