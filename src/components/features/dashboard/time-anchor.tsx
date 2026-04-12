"use client";

import { useEffect, useState, useCallback } from "react";
import { Clock, ChevronUp, CalendarClock } from "lucide-react";

interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
}

const STORAGE_KEY = "cc-time-anchor-collapsed";

function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function TimeAnchor() {
  const [now, setNow] = useState<Date | null>(null);
  const [nextEvent, setNextEvent] = useState<CalendarEvent | null>(null);
  const [wakeHour, setWakeHour] = useState(7);
  const [sleepHour, setSleepHour] = useState(22);
  const [collapsed, setCollapsed] = useState(false);

  // Hydrate on mount: set real time + restore collapsed state
  useEffect(() => {
    setNow(new Date());
    setCollapsed(sessionStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  // Tick every minute, aligned to the start of each minute
  useEffect(() => {
    if (!now) return;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    const alignTimeout = setTimeout(() => {
      setNow(new Date());
      intervalId = setInterval(() => setNow(new Date()), 60_000);
    }, msUntilNextMinute);
    return () => {
      clearTimeout(alignTimeout);
      if (intervalId) clearInterval(intervalId);
    };
    // Only run once after initial mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!now]);

  // Fetch settings + today's events
  const fetchData = useCallback(async () => {
    try {
      const [settingsRes, eventsRes] = await Promise.all([
        fetch("/api/settings"),
        fetch(
          `/api/calendar/events?start=${new Date().toISOString()}&end=${new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()}`
        ),
      ]);

      if (settingsRes.ok) {
        const data = await settingsRes.json();
        if (data.wakeTime != null) setWakeHour(data.wakeTime);
        if (data.sleepTime != null) setSleepHour(data.sleepTime);
      }

      if (eventsRes.ok) {
        const data = await eventsRes.json();
        const upcoming = (data.events as CalendarEvent[])
          ?.filter((e) => new Date(e.startTime) > new Date())
          .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
        setNextEvent(upcoming?.[0] ?? null);
      }
    } catch {
      // Silent fail — ambient feature, not critical
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    sessionStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  }

  // Don't render until hydrated to avoid mismatch
  if (!now) {
    return (
      <div className="flex items-center gap-4 rounded-lg border border-border/50 bg-card/50 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span className="w-16 h-4 bg-muted rounded animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="h-1.5 rounded-full bg-muted" />
        </div>
      </div>
    );
  }

  // Day progress calculation
  const currentHour = now.getHours() + now.getMinutes() / 60;
  const dayLength = sleepHour - wakeHour;
  const elapsed = Math.max(0, Math.min(dayLength, currentHour - wakeHour));
  const progress = dayLength > 0 ? (elapsed / dayLength) * 100 : 0;
  const minutesLeft = Math.max(0, Math.round((dayLength - elapsed) * 60));

  // Next event countdown
  const minutesUntilNext = nextEvent
    ? Math.round((new Date(nextEvent.startTime).getTime() - now.getTime()) / 60_000)
    : null;

  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (collapsed) {
    return (
      <button
        onClick={toggleCollapsed}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Clock className="h-3 w-3" />
        <span>{timeStr}</span>
        {minutesUntilNext != null && minutesUntilNext > 0 && minutesUntilNext <= 180 && (
          <span className="text-primary/70">
            &middot; {nextEvent!.title} in {formatMinutes(minutesUntilNext)}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-4 rounded-lg border border-border/50 bg-card/50 px-4 py-2.5">
      {/* Current time */}
      <div className="flex items-center gap-2 text-sm font-medium tabular-nums">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        {timeStr}
      </div>

      {/* Day progress bar */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden" title={`${Math.round(progress)}% of your day`}>
          <div
            className="h-full rounded-full bg-primary/40 transition-all duration-1000"
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
        <span className="text-[10px] text-muted-foreground/70 shrink-0 tabular-nums">
          {formatMinutes(minutesLeft)} left
        </span>
      </div>

      {/* Next event */}
      {minutesUntilNext != null && minutesUntilNext > 0 && minutesUntilNext <= 180 && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
          <CalendarClock className="h-3 w-3" />
          <span className="truncate max-w-[140px]">{nextEvent!.title}</span>
          <span className="text-primary/70 font-medium">in {formatMinutes(minutesUntilNext)}</span>
        </div>
      )}

      {/* Collapse button */}
      <button
        onClick={toggleCollapsed}
        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Collapse time anchor"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
