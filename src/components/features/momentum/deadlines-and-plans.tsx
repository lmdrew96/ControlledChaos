"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { MomentumStats } from "@/lib/db/queries";
import {
  DEADLINE_BUCKETS,
  PLAN_OUTCOMES,
  deadlineInsight,
  planInsight,
  type DeadlineBucket,
  type PlanOutcome,
} from "@/lib/momentum";

interface BucketItem {
  key: string;
  taskId: string;
  title: string;
  note?: string;
}

interface Bucket {
  id: string;
  label: string;
  /** Tailwind background for the bar segment and the legend dot. */
  color: string;
  items: BucketItem[];
}

/** Date keys name calendar days, so format them in UTC to keep the day. */
const formatDay = (key: string) =>
  new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${key}T12:00:00Z`)
  );

/**
 * A stacked bar of outcomes, a count per outcome you can tap, and the tasks
 * behind the tapped one.
 */
function OutcomeCard({
  title,
  description,
  fact,
  insight,
  empty,
  buckets,
}: {
  title: string;
  description: string;
  fact: string | null;
  insight: string;
  empty: string;
  buckets: Bucket[];
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const total = buckets.reduce((sum, b) => sum + b.items.length, 0);
  const open = buckets.find((b) => b.id === selected);

  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="mb-1 text-sm font-medium">{title}</h2>
        <p className="mb-4 text-xs text-muted-foreground">{description}</p>

        {total === 0 ? (
          <p className="text-xs text-muted-foreground">{empty}</p>
        ) : (
          <>
            {fact && <p className="mb-3 text-sm font-medium">{fact}</p>}
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-secondary" aria-hidden>
              {buckets.map((b) =>
                b.items.length > 0 ? (
                  <div
                    key={b.id}
                    className={cn("h-full", b.color)}
                    style={{ width: `${(b.items.length / total) * 100}%` }}
                  />
                ) : null
              )}
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {buckets.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  disabled={b.items.length === 0}
                  onClick={() => setSelected((prev) => (prev === b.id ? null : b.id))}
                  aria-pressed={selected === b.id}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs transition-colors",
                    "outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-primary/60",
                    "disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent",
                    selected === b.id && "bg-accent"
                  )}
                >
                  <span className={cn("h-2 w-2 rounded-full", b.color)} />
                  <span>{b.label}</span>
                  <span className="font-semibold tabular-nums">{b.items.length}</span>
                </button>
              ))}
            </div>

            {open && open.items.length > 0 && (
              <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
                {open.items.map((item) => (
                  <li key={item.key} className="flex items-baseline gap-2 px-3 py-2">
                    <Link
                      href={`/tasks?taskId=${item.taskId}`}
                      className="min-w-0 flex-1 truncate text-sm hover:underline"
                    >
                      {item.title}
                    </Link>
                    {item.note && (
                      <span className="shrink-0 text-xs text-muted-foreground">{item.note}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        <p className="mt-4 text-[13px] text-muted-foreground">{insight}</p>
      </CardContent>
    </Card>
  );
}

// ============================================================
// 2. Am I beating deadlines?
// ============================================================

const DEADLINE_META: Record<DeadlineBucket, { label: string; color: string }> = {
  early: { label: "A day or more early", color: "bg-success" },
  justInTime: { label: "In the last day", color: "bg-coral" },
  late: { label: "After the deadline", color: "bg-rose/70" },
};

export function DeadlineOutcomes({
  deadlines,
  periodPhrase,
}: {
  deadlines: MomentumStats["deadlines"];
  periodPhrase: string;
}) {
  const counts = {
    early: deadlines.early.length,
    justInTime: deadlines.justInTime.length,
    late: deadlines.late.length,
  };
  const total = counts.early + counts.justInTime + counts.late;
  const beat = counts.early + counts.justInTime;

  return (
    <OutcomeCard
      title="Am I beating deadlines?"
      description={`Tasks with a hard deadline that you finished ${periodPhrase}`}
      fact={total > 0 ? `${beat} of ${total} beat the deadline.` : null}
      insight={deadlineInsight(counts)}
      empty={`No deadline tasks finished ${periodPhrase}.`}
      buckets={DEADLINE_BUCKETS.map((b) => ({
        id: b,
        ...DEADLINE_META[b],
        items: deadlines[b].map((t) => ({ key: t.id, taskId: t.id, title: t.title })),
      }))}
    />
  );
}

// ============================================================
// 3. Do my plans hold?
// ============================================================

const PLAN_META: Record<PlanOutcome, { label: string; color: string }> = {
  inSitting: { label: "Done in the sitting", color: "bg-success" },
  // Same-day recovery is a plan that held, just not on the minute.
  sameDay: { label: "Done later that day", color: "bg-success/50" },
  later: { label: "Done another day", color: "bg-lavender" },
  open: { label: "Still open", color: "bg-muted-foreground/40" },
  skipped: { label: "Skipped", color: "bg-salmon/70" },
};

export function PlanOutcomes({
  plans,
  periodPhrase,
}: {
  plans: MomentumStats["plans"];
  periodPhrase: string;
}) {
  const counts = Object.fromEntries(PLAN_OUTCOMES.map((o) => [o, plans[o].length])) as Record<
    PlanOutcome,
    number
  >;
  const total = PLAN_OUTCOMES.reduce((sum, o) => sum + counts[o], 0);
  const gotDone = counts.inSitting + counts.sameDay + counts.later;

  return (
    <OutcomeCard
      title="Do my plans hold?"
      description={`What became of the sittings you planned ${periodPhrase}`}
      fact={total > 0 ? `${gotDone} of ${total} sittings led to the work getting done.` : null}
      insight={planInsight(counts)}
      empty={`No planned sittings ${periodPhrase}.`}
      buckets={PLAN_OUTCOMES.map((o) => ({
        id: o,
        ...PLAN_META[o],
        items: plans[o].map((s) => ({
          key: s.id,
          taskId: s.taskId,
          title: s.title,
          note: formatDay(s.day),
        })),
      }))}
    />
  );
}
