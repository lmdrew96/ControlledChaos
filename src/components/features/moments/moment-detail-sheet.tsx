"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { MomentType } from "@/types";
import { MOMENT_COPY } from "./moment-constants";

interface MomentDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: MomentType | null;
  /** Called with the filled-in detail data. */
  onSave: (data: {
    type: MomentType;
    intensity: number | null;
    note: string | null;
    occurredAt: Date;
  }) => void;
}

/**
 * Convert a Date to a `<input type="datetime-local">`-compatible string
 * in the user's local timezone (the browser's timezone).
 */
function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export function MomentDetailSheet({
  open,
  onOpenChange,
  type,
  onSave,
}: MomentDetailSheetProps) {
  if (!type) return null;
  const copy = MOMENT_COPY[type];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        <SheetHeader className="pb-2">
          <SheetTitle>Log {copy.label}</SheetTitle>
          <SheetDescription>{copy.detailHint}</SheetDescription>
        </SheetHeader>
        {/* Key remounts with fresh initial state each open/type cycle —
            avoids setState-in-effect for form reset. */}
        <DetailForm
          key={`${type}:${open}`}
          type={type}
          onSave={(data) => {
            onSave(data);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

interface DetailFormProps {
  type: MomentType;
  onSave: (data: {
    type: MomentType;
    intensity: number | null;
    note: string | null;
    occurredAt: Date;
  }) => void;
  onCancel: () => void;
}

function DetailForm({ type, onSave, onCancel }: DetailFormProps) {
  const [intensity, setIntensity] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [occurredAtLocal, setOccurredAtLocal] = useState(() =>
    toDatetimeLocal(new Date())
  );

  const handleSave = () => {
    const occurredAt = new Date(occurredAtLocal);
    onSave({
      type,
      intensity,
      note: note.trim() || null,
      occurredAt: Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt,
    });
  };

  return (
    <div className="space-y-5 px-4">
      <div className="space-y-2">
        <Label>Intensity</Label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setIntensity(intensity === n ? null : n)}
              className={cn(
                "flex-1 rounded-md border px-2 py-2 text-sm font-medium transition-colors",
                intensity === n
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-muted text-muted-foreground hover:bg-accent"
              )}
              aria-pressed={intensity === n}
              aria-label={`Intensity ${n} of 5`}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Optional — tap again to clear.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="moment-note">Note (optional)</Label>
        <Textarea
          id="moment-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What's going on?"
          maxLength={500}
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="moment-time">When</Label>
        <Input
          id="moment-time"
          type="datetime-local"
          value={occurredAtLocal}
          onChange={(e) => setOccurredAtLocal(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Default is now. Edit if you&apos;re logging something from earlier.
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave}>Save</Button>
      </div>
    </div>
  );
}
