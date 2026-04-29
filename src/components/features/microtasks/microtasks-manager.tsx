"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Pause, Play, ArrowUp, ArrowDown, Pencil } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Microtask {
  id: string;
  title: string;
  emoji: string | null;
  timeOfDay: "morning" | "afternoon" | "evening" | "anytime";
  daysOfWeek: number[];
  active: boolean;
  sortOrder: number;
}

const TIME_OF_DAY_OPTIONS = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
  { value: "anytime", label: "Anytime" },
] as const;

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

interface FormState {
  id: string | null; // null = creating new
  title: string;
  emoji: string;
  timeOfDay: Microtask["timeOfDay"];
  daysOfWeek: number[];
}

const EMPTY_FORM: FormState = {
  id: null,
  title: "",
  emoji: "",
  timeOfDay: "anytime",
  daysOfWeek: ALL_DAYS,
};

export function MicrotasksManager() {
  const [microtasks, setMicrotasks] = useState<Microtask[] | null>(null);
  const [form, setForm] = useState<FormState | null>(null); // null = sheet closed
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/microtasks?all=true");
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { microtasks: Microtask[] };
      setMicrotasks(data.microtasks);
    } catch {
      toast.error("Couldn't load microtasks");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const { active, inactive } = useMemo(() => {
    const all = microtasks ?? [];
    return {
      active: all.filter((m) => m.active).sort((a, b) => a.sortOrder - b.sortOrder),
      inactive: all.filter((m) => !m.active),
    };
  }, [microtasks]);

  const submitForm = useCallback(async () => {
    if (!form) return;
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (form.daysOfWeek.length === 0) {
      toast.error("Pick at least one day");
      return;
    }
    setSaving(true);
    try {
      const body = {
        title: form.title.trim(),
        emoji: form.emoji.trim() || null,
        time_of_day: form.timeOfDay,
        days_of_week: [...form.daysOfWeek].sort((a, b) => a - b),
      };
      const url = form.id ? `/api/microtasks/${form.id}` : "/api/microtasks";
      const method = form.id ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      setForm(null);
      await refresh();
    } catch {
      toast.error("Couldn't save microtask");
    } finally {
      setSaving(false);
    }
  }, [form, refresh]);

  const setActive = useCallback(
    async (mt: Microtask, active: boolean) => {
      try {
        const res = await fetch(`/api/microtasks/${mt.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active }),
        });
        if (!res.ok) throw new Error();
        await refresh();
      } catch {
        toast.error(active ? "Couldn't reactivate" : "Couldn't pause");
      }
    },
    [refresh]
  );

  const move = useCallback(
    async (mt: Microtask, direction: "up" | "down") => {
      const ordered = active;
      const idx = ordered.findIndex((m) => m.id === mt.id);
      if (idx < 0) return;
      const swapWith = direction === "up" ? ordered[idx - 1] : ordered[idx + 1];
      if (!swapWith) return;

      // Optimistic swap
      const newOrders: Record<string, number> = {
        [mt.id]: swapWith.sortOrder,
        [swapWith.id]: mt.sortOrder,
      };
      setMicrotasks((prev) =>
        prev?.map((m) =>
          newOrders[m.id] !== undefined ? { ...m, sortOrder: newOrders[m.id] } : m
        ) ?? null
      );

      try {
        await Promise.all([
          fetch(`/api/microtasks/${mt.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sort_order: newOrders[mt.id] }),
          }),
          fetch(`/api/microtasks/${swapWith.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sort_order: newOrders[swapWith.id] }),
          }),
        ]);
      } catch {
        toast.error("Couldn't reorder");
        void refresh();
      }
    },
    [active, refresh]
  );

  const startCreate = () => {
    setForm({ ...EMPTY_FORM, daysOfWeek: ALL_DAYS, timeOfDay: "anytime" });
  };

  const startEdit = (mt: Microtask) => {
    setForm({
      id: mt.id,
      title: mt.title,
      emoji: mt.emoji ?? "",
      timeOfDay: mt.timeOfDay,
      daysOfWeek: [...mt.daysOfWeek],
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={startCreate}>
          <Plus className="mr-1.5 h-4 w-4" />
          New microtask
        </Button>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Active
        </h2>
        {active.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/50 px-4 py-6 text-center text-sm text-muted-foreground">
            No active microtasks yet. Tap &quot;New microtask&quot; to add one.
          </div>
        ) : (
          <ul className="space-y-2">
            {active.map((mt, i) => (
              <MicrotaskRow
                key={mt.id}
                microtask={mt}
                isFirst={i === 0}
                isLast={i === active.length - 1}
                onMoveUp={() => move(mt, "up")}
                onMoveDown={() => move(mt, "down")}
                onEdit={() => startEdit(mt)}
                onDeactivate={() => setActive(mt, false)}
              />
            ))}
          </ul>
        )}
      </section>

      {inactive.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Paused
          </h2>
          <ul className="space-y-2">
            {inactive.map((mt) => (
              <MicrotaskRow
                key={mt.id}
                microtask={mt}
                isFirst
                isLast
                muted
                onEdit={() => startEdit(mt)}
                onReactivate={() => setActive(mt, true)}
              />
            ))}
          </ul>
        </section>
      )}

      <MicrotaskFormSheet
        form={form}
        saving={saving}
        onChange={setForm}
        onSubmit={submitForm}
        onClose={() => setForm(null)}
      />
    </div>
  );
}

interface MicrotaskRowProps {
  microtask: Microtask;
  isFirst: boolean;
  isLast: boolean;
  muted?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onEdit: () => void;
  onDeactivate?: () => void;
  onReactivate?: () => void;
}

function MicrotaskRow({
  microtask,
  isFirst,
  isLast,
  muted,
  onMoveUp,
  onMoveDown,
  onEdit,
  onDeactivate,
  onReactivate,
}: MicrotaskRowProps) {
  const { title, emoji, timeOfDay, daysOfWeek } = microtask;
  const daysLabel =
    daysOfWeek.length === 7
      ? "every day"
      : daysOfWeek
          .slice()
          .sort((a, b) => a - b)
          .map((d) => DAY_LABELS[d])
          .join(", ");

  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border/40 bg-card/50 px-3 py-2.5",
        muted && "opacity-60"
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {emoji && <span className="text-lg leading-none">{emoji}</span>}
        <div className="min-w-0">
          <p className="truncate font-medium">{title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {timeOfDay} · {daysLabel}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {onMoveUp && (
          <Button
            size="icon"
            variant="ghost"
            onClick={onMoveUp}
            disabled={isFirst}
            aria-label="Move up"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        )}
        {onMoveDown && (
          <Button
            size="icon"
            variant="ghost"
            onClick={onMoveDown}
            disabled={isLast}
            aria-label="Move down"
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          onClick={onEdit}
          aria-label="Edit"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        {onDeactivate && (
          <Button
            size="icon"
            variant="ghost"
            onClick={onDeactivate}
            aria-label="Pause"
          >
            <Pause className="h-4 w-4" />
          </Button>
        )}
        {onReactivate && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onReactivate}
          >
            <Play className="mr-1 h-3.5 w-3.5" />
            Reactivate
          </Button>
        )}
      </div>
    </li>
  );
}

interface MicrotaskFormSheetProps {
  form: FormState | null;
  saving: boolean;
  onChange: (form: FormState | null) => void;
  onSubmit: () => void;
  onClose: () => void;
}

function MicrotaskFormSheet({
  form,
  saving,
  onChange,
  onSubmit,
  onClose,
}: MicrotaskFormSheetProps) {
  const open = form !== null;
  const isEditing = form?.id !== null && form?.id !== undefined;

  const toggleDay = (d: number) => {
    if (!form) return;
    const set = new Set(form.daysOfWeek);
    if (set.has(d)) set.delete(d);
    else set.add(d);
    onChange({ ...form, daysOfWeek: Array.from(set) });
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="space-y-5 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Edit microtask" : "New microtask"}</SheetTitle>
          <SheetDescription>
            Small daily prompt — like &quot;5 min Upwork scan.&quot; Won&apos;t pile up if missed.
          </SheetDescription>
        </SheetHeader>

        {form && (
          <form
            className="space-y-4 px-4"
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="mt-title">Title</Label>
              <Input
                id="mt-title"
                value={form.title}
                onChange={(e) => onChange({ ...form, title: e.target.value })}
                placeholder="5 min Upwork scan"
                autoFocus
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mt-emoji">Emoji (optional)</Label>
              <Input
                id="mt-emoji"
                value={form.emoji}
                onChange={(e) => onChange({ ...form, emoji: e.target.value })}
                placeholder="🔍"
                maxLength={4}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mt-tod">Time of day</Label>
              <Select
                value={form.timeOfDay}
                onValueChange={(v) =>
                  onChange({ ...form, timeOfDay: v as FormState["timeOfDay"] })
                }
              >
                <SelectTrigger id="mt-tod">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_OF_DAY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Days</Label>
              <div className="flex flex-wrap gap-1.5">
                {DAY_LABELS.map((label, d) => {
                  const selected = form.daysOfWeek.includes(d);
                  return (
                    <button
                      type="button"
                      key={d}
                      onClick={() => toggleDay(d)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-sm transition-colors",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <SheetFooter className="px-0">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : isEditing ? "Save" : "Create"}
              </Button>
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
            </SheetFooter>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
