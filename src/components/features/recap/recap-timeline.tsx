"use client";

import { Skeleton } from "@/components/ui/skeleton";
import type { RecapEntry } from "@/types";
import { RecapEntryRow } from "./recap-entry-row";

interface RecapTimelineProps {
  entries: RecapEntry[];
  timezone: string;
  isLoading: boolean;
  loadError: boolean;
  date: string;
  today: string;
}

export function RecapTimeline({
  entries,
  timezone,
  isLoading,
  loadError,
  date,
  today,
}: RecapTimelineProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-lg" />
      </div>
    );
  }

  if (loadError) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Couldn&apos;t load this day. Try again in a moment.
      </p>
    );
  }

  if (entries.length === 0) {
    return <EmptyState date={date} today={today} />;
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <RecapEntryRow
          key={`${entry.kind}:${entry.id}`}
          entry={entry}
          timezone={timezone}
        />
      ))}
    </div>
  );
}

function EmptyState({ date, today }: { date: string; today: string }) {
  const isFuture = date > today;
  const isToday = date === today;
  return (
    <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
      <p className="text-sm font-medium text-muted-foreground">
        {isFuture
          ? "Nothing here yet — this day hasn't happened."
          : isToday
            ? "Nothing logged yet today."
            : "Nothing was captured this day."}
      </p>
      {!isFuture && (
        <p className="mt-1 text-xs text-muted-foreground">
          {isToday
            ? "Log a moment, complete a task, or capture a thought to see it here."
            : "Quiet days are fine. The recap shows whatever did happen."}
        </p>
      )}
    </div>
  );
}
