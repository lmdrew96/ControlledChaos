"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import { cn } from "@/lib/utils";
import type { MarinationBuckets, MomentumStats } from "@/lib/db/queries";
import { MIN_INSIGHT_SAMPLE } from "@/lib/momentum";

type BucketKey = keyof MarinationBuckets;

const BUCKET_KEYS: BucketKey[] = ["fresh", "week", "marinating", "aging"];

const BUCKET_LABELS: Record<BucketKey, { title: string; range: string }> = {
  fresh: { title: "Fresh", range: "< 1 day" },
  week: { title: "This week", range: "1–7 days" },
  marinating: { title: "Marinating", range: "1–4 weeks" },
  aging: { title: "Aging gracefully", range: "30+ days" },
};

function bucketTotal(b: MarinationBuckets): number {
  return b.fresh + b.week + b.marinating + b.aging;
}

// Log-scale opacity within a row — keeps low counts visible. The floor is
// high enough that a count's cell reads as a cell in dark mode.
function opacityFor(count: number, max: number): number {
  if (count === 0) return 0.08;
  if (max <= 0) return 0.08;
  const t = Math.log(count + 1) / Math.log(max + 1);
  return 0.3 + t * 0.6;
}

function generateMarinationSentence(
  marination: MomentumStats["marination"],
  periodPhrase: string
): string {
  const activeTotal = bucketTotal(marination.active);
  const histTotal = bucketTotal(marination.historical);
  const activeOld = marination.active.marinating + marination.active.aging;

  if (activeTotal === 0) return "Nothing open right now.";
  const olderFact =
    activeOld === 1 ? "**1** open task is over a week old" : `**${activeOld}** open tasks are over a week old`;

  // Facts about what's open are always fine; "normal for how you work" is a
  // pattern, so it needs enough finished tasks behind it.
  if (histTotal < MIN_INSIGHT_SAMPLE) {
    return activeOld > 0 ? `${olderFact}.` : "Everything open is under a week old.";
  }
  const histFast = marination.historical.fresh + marination.historical.week;
  if (histFast / histTotal >= 0.7) {
    return activeOld > 0
      ? `Most tasks you finished ${periodPhrase} took under a week. ${olderFact}: not overdue, just marinating.`
      : `Most tasks you finished ${periodPhrase} took under a week, and everything open is still fresh.`;
  }
  return activeOld > 0
    ? `${olderFact}. Judging by what you finish, that's normal for how you work.`
    : "Everything open is under a week old.";
}

type RowProps = {
  label: string;
  buckets: MarinationBuckets;
  color: string; // "R, G, B"
  selected?: BucketKey | null;
  onSelect?: (k: BucketKey) => void;
};

function MarinationRow({ label, buckets, color, selected, onSelect }: RowProps) {
  const max = Math.max(buckets.fresh, buckets.week, buckets.marinating, buckets.aging, 1);
  return (
    <div className="grid grid-cols-[90px_1fr] items-center gap-3 sm:grid-cols-[110px_1fr] sm:gap-4">
      <div className="text-right text-xs text-muted-foreground">{label}</div>
      <div className="grid grid-cols-4 gap-[3px] overflow-hidden rounded-md">
        {BUCKET_KEYS.map((k) => {
          const count = buckets[k];
          const cellClass = cn(
            "flex h-10 items-center justify-center rounded-sm text-sm font-semibold tabular-nums",
            count > 0 ? "text-foreground" : "text-muted-foreground/60"
          );
          const style = { backgroundColor: `rgba(${color}, ${opacityFor(count, max)})` };
          const title = `${BUCKET_LABELS[k].title} · ${BUCKET_LABELS[k].range} · ${count} task${count === 1 ? "" : "s"}`;
          return onSelect && count > 0 ? (
            <button
              key={k}
              type="button"
              onClick={() => onSelect(k)}
              aria-pressed={selected === k}
              aria-label={`${title}. Show them`}
              className={cn(
                cellClass,
                "outline-none transition-shadow hover:ring-2 hover:ring-inset hover:ring-foreground/30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/60",
                selected === k && "ring-2 ring-inset ring-foreground/60"
              )}
              style={style}
              title={title}
            >
              {count}
            </button>
          ) : (
            <div key={k} className={cellClass} style={style} title={title}>
              {count}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The open tasks in one age bucket, each with a quick decision. "Keep" only
 * takes it off this list; "Someday" and "Cancel" write.
 */
function TriageList({
  bucket,
  tasks,
  onChanged,
}: {
  bucket: BucketKey;
  tasks: MomentumStats["marination"]["activeTasks"][BucketKey];
  onChanged: () => void;
}) {
  const [handled, setHandled] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const shown = tasks.filter((t) => !handled.has(t.id));

  const markHandled = (id: string) => setHandled((prev) => new Set(prev).add(id));

  const update = async (id: string, body: Record<string, string>, done: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`PATCH /api/tasks/${id} ${res.status}`);
      markHandled(id);
      toast(done);
      onChanged();
    } catch (error) {
      console.error("Momentum triage: update failed:", error);
      toast.error("Couldn't update that task. Try again?");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mt-4 rounded-lg border border-border">
      <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
        {BUCKET_LABELS[bucket].title} ({BUCKET_LABELS[bucket].range}). Keep it, park it for
        someday, or let it go.
      </p>
      {shown.length === 0 ? (
        <p className="px-3 py-3 text-xs text-muted-foreground">All sorted.</p>
      ) : (
        <ul className="divide-y divide-border">
          {shown.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <Link
                href={`/tasks?taskId=${t.id}`}
                className="min-w-0 flex-1 truncate text-sm hover:underline"
              >
                {t.title}
              </Link>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="ghost" disabled={busyId === t.id} onClick={() => markHandled(t.id)}>
                  Keep
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyId === t.id}
                  onClick={() => update(t.id, { priority: "someday" }, "Moved to someday.")}
                >
                  Someday
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyId === t.id}
                  onClick={() =>
                    update(t.id, { status: "cancelled" }, "Let go. You can restore it from Tasks.")
                  }
                >
                  Cancel
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TaskMarination({
  marination,
  periodPhrase,
  onChanged,
}: {
  marination: MomentumStats["marination"];
  periodPhrase: string;
  /** A triage decision was saved; the page should re-read its stats. */
  onChanged: () => void;
}) {
  const [selected, setSelected] = useState<BucketKey | null>(null);
  const activeTotal = bucketTotal(marination.active);
  const histTotal = bucketTotal(marination.historical);

  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="mb-1 text-sm font-medium">What&apos;s aging?</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          How long things live here. Open now, and how old tasks finished {periodPhrase} were.
          Tap a number to sort through those tasks.
        </p>

        {activeTotal === 0 && histTotal === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing open, and nothing finished {periodPhrase}.</p>
        ) : (
          <>
            <div className="space-y-2">
              <MarinationRow
                label="Open now"
                buckets={marination.active}
                color="249, 115, 22"
                selected={selected}
                onSelect={(k) => setSelected((prev) => (prev === k ? null : k))}
              />
              {histTotal > 0 && (
                <MarinationRow
                  label="Finished at this age"
                  buckets={marination.historical}
                  color="140, 189, 185"
                />
              )}
            </div>

            {/* Bucket axis labels */}
            <div className="mt-3 grid grid-cols-[90px_1fr] gap-3 sm:grid-cols-[110px_1fr] sm:gap-4">
              <div aria-hidden="true" />
              <div className="grid grid-cols-4 gap-[3px] text-center">
                {BUCKET_KEYS.map((k) => (
                  <div key={k}>
                    <div className="text-[11px] font-medium text-foreground">
                      {BUCKET_LABELS[k].title}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {BUCKET_LABELS[k].range}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {selected && (
              <TriageList
                key={selected}
                bucket={selected}
                tasks={marination.activeTasks[selected]}
                onChanged={onChanged}
              />
            )}
          </>
        )}

        <p className="mt-4 text-[13px] text-muted-foreground">
          <Markdown inline>{generateMarinationSentence(marination, periodPhrase)}</Markdown>
        </p>
      </CardContent>
    </Card>
  );
}
