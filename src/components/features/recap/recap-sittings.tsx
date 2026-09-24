"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { SessionOutcomePicker } from "@/components/features/task-feed/session-outcome-picker";
import { formatForDisplay, DISPLAY_TIME } from "@/lib/timezone";

interface UnansweredSitting {
  sessionId: string;
  taskId: string;
  title: string;
  startsAt: string;
  minutes: number | null;
}

interface RecapSittingsProps {
  date: string;
  timezone: string;
  /** After a log, so the timeline can pick up anything it changed. */
  onLogged?: () => void;
}

/**
 * The day's ended sittings that have no outcome yet, each with a one-tap
 * "how did it go". Renders nothing when there are none, and never counts
 * or highlights what's unanswered: this is a place to log, not a to-do.
 */
export function RecapSittings({ date, timezone, onLogged }: RecapSittingsProps) {
  const [loaded, setLoaded] = useState<{ date: string; sittings: UnansweredSitting[] } | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/recap/sittings?date=${date}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (!cancelled) setLoaded({ date, sittings: data.sittings ?? [] });
      })
      .catch(() => {
        // Optional section: a failed load just means it doesn't show.
        if (!cancelled) setLoaded({ date, sittings: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [date]);

  const sittings = loaded?.date === date ? loaded.sittings : [];
  if (sittings.length === 0) return null;

  return (
    <Card className="p-4">
      <div className="mb-3">
        <h2 className="text-sm font-medium">How did these sittings go?</h2>
        <p className="text-xs text-muted-foreground">
          Whatever you log comes off the task&apos;s estimate, and its other
          sittings split the rest. Skip any you like.
        </p>
      </div>
      <ul className="space-y-3">
        {sittings.map((s) => (
          <li key={s.sessionId} className="space-y-1.5">
            <p className="text-sm">
              <span className="tabular-nums text-muted-foreground">
                {formatForDisplay(new Date(s.startsAt), timezone, DISPLAY_TIME)}
              </span>{" "}
              {s.title}
            </p>
            <SessionOutcomePicker
              taskId={s.taskId}
              sessionId={s.sessionId}
              plannedMinutes={s.minutes}
              onLogged={() => {
                setLoaded((prev) =>
                  prev
                    ? { ...prev, sittings: prev.sittings.filter((x) => x.sessionId !== s.sessionId) }
                    : prev
                );
                onLogged?.();
              }}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}
