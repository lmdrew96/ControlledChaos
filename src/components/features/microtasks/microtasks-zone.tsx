"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Settings2, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useCrisisDetection } from "@/hooks/use-crisis-detection";
import { useLongPress } from "@/components/features/moments/use-long-press";

interface Microtask {
  id: string;
  title: string;
  emoji: string | null;
  timeOfDay: "morning" | "afternoon" | "evening" | "anytime";
  daysOfWeek: number[];
  active: boolean;
  sortOrder: number;
  completedToday: boolean;
  todayNote: string | null;
  completionCount7d: number;
  scheduledToday: boolean;
}

const TIME_OF_DAY_ORDER = ["morning", "afternoon", "evening", "anytime"] as const;
const TIME_OF_DAY_LABELS: Record<(typeof TIME_OF_DAY_ORDER)[number], string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  anytime: "Anytime",
};

export function MicrotasksZone() {
  const { isActive: crisisActive } = useCrisisDetection();
  const [microtasks, setMicrotasks] = useState<Microtask[] | null>(null);
  const [sheetTask, setSheetTask] = useState<Microtask | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/microtasks");
      if (!res.ok) return;
      const data = (await res.json()) as { microtasks: Microtask[] };
      setMicrotasks(data.microtasks);
    } catch {
      /* swallow — non-critical */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleComplete = useCallback(
    async (mt: Microtask) => {
      const wasCompleted = mt.completedToday;

      // Optimistic update
      setMicrotasks((prev) =>
        prev?.map((m) =>
          m.id === mt.id
            ? {
                ...m,
                completedToday: !wasCompleted,
                todayNote: wasCompleted ? null : m.todayNote,
                completionCount7d: wasCompleted
                  ? Math.max(0, m.completionCount7d - 1)
                  : m.completionCount7d + 1,
              }
            : m
        ) ?? null
      );

      try {
        const res = await fetch(`/api/microtasks/${mt.id}/complete`, {
          method: wasCompleted ? "DELETE" : "POST",
        });
        if (!res.ok) throw new Error("toggle failed");
      } catch {
        // Rollback on failure
        toast.error("Couldn't update microtask");
        void refresh();
      }
    },
    [refresh]
  );

  const saveNote = useCallback(
    async (mt: Microtask, note: string) => {
      try {
        const res = await fetch(`/api/microtasks/${mt.id}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: note.trim() || null }),
        });
        if (!res.ok) throw new Error("save failed");
        if (note.trim()) {
          // If already completed, the POST is idempotent; need to PATCH the note.
          // Easiest: re-fetch fresh state.
        }
        await refresh();
      } catch {
        toast.error("Couldn't save note");
      }
    },
    [refresh]
  );

  // Hide entire zone in Crisis Mode (per spec)
  if (crisisActive) return null;

  // Initial load — show nothing rather than a skeleton (microtasks are quiet)
  if (microtasks === null) return null;

  const scheduledToday = microtasks.filter((m) => m.scheduledToday);

  // Empty state: user has no microtasks at all → soft CTA
  if (microtasks.length === 0) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-border/40 bg-card/50 px-4 py-3 text-sm">
        <span className="text-muted-foreground">
          Microtasks are small daily prompts — like &quot;5 min Upwork scan&quot; or &quot;stretch.&quot;
        </span>
        <Button asChild variant="ghost" size="sm">
          <Link href="/microtasks">
            <Settings2 className="mr-1.5 h-3.5 w-3.5" />
            Set up
          </Link>
        </Button>
      </div>
    );
  }

  // Has microtasks but none scheduled today → quiet (don't render)
  if (scheduledToday.length === 0) return null;

  // Group by time_of_day, preserve canonical order
  const grouped = TIME_OF_DAY_ORDER.map((tod) => ({
    tod,
    items: scheduledToday
      .filter((m) => m.timeOfDay === tod)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      <div className="space-y-3 rounded-xl border border-border/40 bg-card/50 p-3">
        <div className="flex items-center justify-between px-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Microtasks
          </p>
          <Link
            href="/microtasks"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Manage microtasks"
          >
            Manage
          </Link>
        </div>

        {grouped.map(({ tod, items }) => (
          <div key={tod} className="space-y-1.5">
            <p className="px-1 text-xs text-muted-foreground">
              {TIME_OF_DAY_LABELS[tod]}
            </p>
            <div
              className="flex items-center gap-2 overflow-x-auto pb-1 [touch-action:pan-x]"
              role="toolbar"
              aria-label={`${TIME_OF_DAY_LABELS[tod]} microtasks`}
            >
              {items.map((mt) => (
                <MicrotaskChip
                  key={mt.id}
                  microtask={mt}
                  onTap={() => toggleComplete(mt)}
                  onLongPress={() => setSheetTask(mt)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <MicrotaskNoteSheet
        // key on id so the form's local state resets cleanly when a different chip is opened
        key={sheetTask?.id ?? "closed"}
        microtask={sheetTask}
        onClose={() => setSheetTask(null)}
        onToggle={async (mt) => {
          await toggleComplete(mt);
          setSheetTask(null);
        }}
        onSaveNote={saveNote}
      />
    </>
  );
}

interface MicrotaskChipProps {
  microtask: Microtask;
  onTap: () => void;
  onLongPress: () => void;
}

function MicrotaskChip({ microtask, onTap, onLongPress }: MicrotaskChipProps) {
  const handlers = useLongPress({
    onShortPress: onTap,
    onLongPress,
    thresholdMs: 500,
    moveToleranceInPx: 10,
  });

  const { completedToday, completionCount7d, emoji, title } = microtask;

  return (
    <button
      type="button"
      {...handlers}
      aria-pressed={completedToday}
      aria-label={`${title}${completedToday ? " — done today" : ""}`}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
        "select-none active:scale-[0.98]",
        completedToday
          ? "border-primary/30 bg-primary/15 text-primary"
          : "border-border bg-muted/50 text-foreground hover:bg-muted"
      )}
    >
      <span className="flex items-center gap-1.5">
        {completedToday ? (
          <Check className="h-3.5 w-3.5" />
        ) : emoji ? (
          <span className="text-base leading-none">{emoji}</span>
        ) : null}
        <span>{title}</span>
        {completionCount7d > 0 && (
          <span
            className={cn(
              "ml-1 text-xs tabular-nums",
              completedToday ? "text-primary/70" : "text-muted-foreground"
            )}
          >
            {completionCount7d}/7
          </span>
        )}
      </span>
    </button>
  );
}

interface MicrotaskNoteSheetProps {
  microtask: Microtask | null;
  onClose: () => void;
  onToggle: (mt: Microtask) => Promise<void>;
  onSaveNote: (mt: Microtask, note: string) => Promise<void>;
}

function MicrotaskNoteSheet({
  microtask,
  onClose,
  onToggle,
  onSaveNote,
}: MicrotaskNoteSheetProps) {
  const [note, setNote] = useState(microtask?.todayNote ?? "");

  if (!microtask) return null;

  const { completedToday, completionCount7d, title, emoji } = microtask;

  return (
    <Sheet open={true} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="space-y-4">
        <SheetHeader className="space-y-1">
          <SheetTitle className="flex items-center gap-2">
            {emoji && <span className="text-lg">{emoji}</span>}
            <span>{title}</span>
          </SheetTitle>
          <SheetDescription>
            {completionCount7d > 0
              ? `${completionCount7d} of 7 days`
              : "No completions in the last 7 days"}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-2 px-4">
          <label
            htmlFor="microtask-note"
            className="text-sm font-medium text-muted-foreground"
          >
            Quick note (optional)
          </label>
          <Textarea
            id="microtask-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What happened?"
            rows={3}
          />
        </div>

        <div className="flex flex-col gap-2 px-4 pb-4 sm:flex-row">
          <Button
            variant={completedToday ? "outline" : "default"}
            className="flex-1"
            onClick={() => void onToggle(microtask)}
          >
            {completedToday ? "Undo today" : "Mark done"}
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            onClick={async () => {
              await onSaveNote(microtask, note);
              onClose();
            }}
          >
            Save note
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
