"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Clock, ChevronUp, ChevronDown, CalendarClock, Sparkles, MapPin } from "lucide-react";
import {
  toUserLocal,
  formatForDisplay,
  toDateKeyInTimezone,
  addDaysToDateKey,
  toUTC,
  DISPLAY_TIME,
} from "@/lib/timezone";
import { useCalendarSettings } from "@/hooks/use-calendar-settings";
import { categoryHex } from "@/lib/calendar/colors";
import {
  buildDayTimeline,
  type TimelineInput,
  type TimelineItem,
} from "@/lib/calendar/day-timeline";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CalendarColors, EventCategory } from "@/types";

interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  isTentative?: boolean;
  isAllDay?: boolean | null;
  location?: string | null;
  category?: string | null;
}

interface PlanBlock {
  sessionId?: string | null;
  taskId: string;
  title: string;
  startTime: string;
  endTime: string;
  category?: string | null;
}

/** What the anchor shows next — a real event or a block you planned. */
interface UpNext {
  title: string;
  startTime: string;
  isPlanned: boolean;
}

const STORAGE_KEY = "cc-time-anchor-collapsed";
/** Pixel height of one timeline lane. Phone-first: a thumb has to hit it. */
const LANE_PX = 16;
const LANE_GAP_PX = 2;
/** Room under the lanes for free-gap labels. */
const GAP_LABEL_PX = 14;

function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** A local wall-clock hour today (24+ rolls into tomorrow) as an instant. */
function localHourToday(dateKey: string, hour: number, timezone: string): Date {
  const key = hour >= 24 ? addDaysToDateKey(dateKey, 1) : dateKey;
  const h = String(hour % 24).padStart(2, "0");
  return new Date(toUTC(`${key}T${h}:00:00`, timezone));
}

export function TimeAnchor({
  onGapSelect,
  refreshKey,
}: {
  onGapSelect?: (minutes: number) => void;
  /** Bumped when a task changes elsewhere on the dashboard; re-reads in place. */
  refreshKey?: number;
} = {}) {
  // Timezone and the wake/sleep window come from the shared settings cache, so
  // a save in Settings reaches the anchor without a reload.
  const {
    settings: { timezone, wakeHour, sleepHour, calendarColors },
  } = useCalendarSettings();
  const [now, setNow] = useState<Date | null>(null);
  const [inputs, setInputs] = useState<TimelineInput[]>([]);
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

  // The strip runs wake → sleep today. A sleep hour at or before wake means
  // past midnight.
  const dateKey = now ? toDateKeyInTimezone(now, timezone) : null;
  const endHour = sleepHour > wakeHour ? sleepHour : sleepHour + 24;
  const dayStart = dateKey ? localHourToday(dateKey, wakeHour, timezone) : null;
  const dayEnd = dateKey ? localHourToday(dateKey, endHour, timezone) : null;
  const dayStartMs = dayStart?.getTime();
  const dayEndMs = dayEnd?.getTime();

  // Today's events and planned sittings, plus the next 3 hours so "next" still
  // works late in the evening past the strip's end.
  const fetchData = useCallback(async () => {
    if (dayStartMs === undefined || dayEndMs === undefined) return;
    try {
      const end = Math.max(dayEndMs, Date.now() + 3 * 60 * 60 * 1000);
      const res = await fetch(
        `/api/calendar/events?start=${new Date(dayStartMs).toISOString()}&end=${new Date(end).toISOString()}`
      );
      if (!res.ok) throw new Error(`GET /api/calendar/events ${res.status}`);
      const data = await res.json();
      const events: TimelineInput[] = ((data.events ?? []) as CalendarEvent[])
        .filter((e) => !e.isAllDay)
        .map((e) => ({
          id: e.id,
          title: e.title,
          start: new Date(e.startTime),
          end: new Date(e.endTime),
          // A tentative event isn't a countdown or a claim on the day: drawn
          // dashed, counted as free.
          kind: e.isTentative ? "tentative" : "event",
          category: e.category,
          location: e.location,
        }));
      const plans: TimelineInput[] = ((data.planBlocks ?? []) as PlanBlock[]).map((p) => ({
        id: `plan-${p.sessionId ?? p.taskId}-${p.startTime}`,
        title: p.title,
        start: new Date(p.startTime),
        end: new Date(p.endTime),
        kind: "planned",
        category: p.category,
        taskId: p.taskId,
      }));
      setInputs([...events, ...plans]);
    } catch (error) {
      // Ambient feature: the clock still works without it.
      console.error("Time anchor: failed to load today's events:", error);
    }
  }, [dayStartMs, dayEndMs]);

  useEffect(() => {
    void fetchData();
  }, [fetchData, refreshKey]);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    sessionStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  }

  // Don't render until hydrated to avoid mismatch
  if (!now || !dayStart || !dayEnd) {
    return (
      <div className="time-anchor-bar flex flex-col gap-2 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span className="h-4 w-16 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-4 rounded-md bg-muted" />
      </div>
    );
  }

  // Time left in the day
  const local = toUserLocal(now, timezone);
  const currentHour = local.hour + local.minute / 60;
  const dayLength = endHour - wakeHour;
  const elapsed = Math.max(0, Math.min(dayLength, currentHour - wakeHour));
  const minutesLeft = Math.max(0, Math.round((dayLength - elapsed) * 60));

  // Next event or planned block (tentative events never count down)
  const upcoming = inputs
    .filter((i) => i.kind !== "tentative" && i.start > now)
    .sort((a, b) => a.start.getTime() - b.start.getTime())[0];
  const nextEvent: UpNext | null = upcoming
    ? { title: upcoming.title, startTime: upcoming.start.toISOString(), isPlanned: upcoming.kind === "planned" }
    : null;
  const minutesUntilNext = nextEvent
    ? Math.round((new Date(nextEvent.startTime).getTime() - now.getTime()) / 60_000)
    : null;
  const showNextEvent =
    minutesUntilNext != null && minutesUntilNext > 0 && minutesUntilNext <= 180;

  const timeStr = formatForDisplay(now, timezone, DISPLAY_TIME);

  if (collapsed) {
    return (
      <button
        onClick={toggleCollapsed}
        className="group flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <Clock className="h-3 w-3" />
        <span className="tabular-nums">{timeStr}</span>
        {showNextEvent && (
          <span className="text-primary/70">
            &middot; {nextEvent!.title} in {formatMinutes(minutesUntilNext!)}
          </span>
        )}
        <ChevronDown className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
    );
  }

  return (
    <div className="time-anchor-bar flex flex-col gap-2 px-4 py-2.5">
      <div className="flex items-center gap-3">
        {/* Current time */}
        <div className="flex shrink-0 items-center gap-2 text-sm font-semibold tabular-nums">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          {timeStr}
        </div>

        {/* Next event: the only item named on a phone */}
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted-foreground">
          {showNextEvent && (
            <>
              {nextEvent!.isPlanned ? (
                <Sparkles
                  className="h-3 w-3 shrink-0 text-plum dark:text-lavender"
                  aria-label="Planned time"
                />
              ) : (
                <CalendarClock className="h-3 w-3 shrink-0" />
              )}
              <span className="min-w-0 truncate">{nextEvent!.title}</span>
              <span className="shrink-0 font-medium text-primary/70">
                in {formatMinutes(minutesUntilNext!)}
              </span>
            </>
          )}
        </div>

        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
          {formatMinutes(minutesLeft)} left
        </span>

        <button
          onClick={toggleCollapsed}
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Collapse time anchor"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
      </div>

      <DayTimeline
        inputs={inputs}
        dayStart={dayStart}
        dayEnd={dayEnd}
        now={now}
        timezone={timezone}
        calendarColors={calendarColors}
        onGapSelect={onGapSelect}
      />
    </div>
  );
}

function DayTimeline({
  inputs,
  dayStart,
  dayEnd,
  now,
  timezone,
  calendarColors,
  onGapSelect,
}: {
  inputs: TimelineInput[];
  dayStart: Date;
  dayEnd: Date;
  now: Date;
  timezone: string;
  calendarColors: CalendarColors | null;
  onGapSelect?: (minutes: number) => void;
}) {
  const { items, gaps, lanes } = buildDayTimeline(inputs, dayStart, dayEnd, now);
  const nowPct = Math.min(
    100,
    Math.max(0, ((now.getTime() - dayStart.getTime()) / (dayEnd.getTime() - dayStart.getTime())) * 100)
  );
  const lanesPx = lanes * LANE_PX + (lanes - 1) * LANE_GAP_PX;
  const fmt = (d: Date) => formatForDisplay(d, timezone, DISPLAY_TIME);

  return (
    <div
      className="relative w-full"
      style={{ height: lanesPx + GAP_LABEL_PX }}
      role="group"
      aria-label={`Today from ${fmt(dayStart)} to ${fmt(dayEnd)}`}
    >
      {/* Track, with the part of the day that's gone shaded */}
      <div className="absolute inset-x-0 top-0 overflow-hidden rounded-md bg-muted/40" style={{ height: lanesPx }}>
        <div className="h-full bg-muted-foreground/10" style={{ width: `${nowPct}%` }} />
      </div>

      {/* Free gaps: the whole column is the tap target, the label sits underneath */}
      {gaps.map((gap) => (
        <button
          key={gap.start.toISOString()}
          type="button"
          onClick={() => onGapSelect?.(gap.minutes)}
          disabled={!onGapSelect}
          className="group absolute top-0 bottom-0 z-0 flex items-end justify-center rounded-md transition-colors hover:bg-primary/5 focus-visible:bg-primary/5 focus-visible:outline-none"
          style={{ left: `${gap.leftPct}%`, width: `${gap.widthPct}%` }}
          aria-label={`Free ${formatMinutes(gap.minutes)} from ${fmt(gap.start)}. What should I do in it?`}
          title={`Free ${formatMinutes(gap.minutes)} — what should I do?`}
        >
          {gap.widthPct >= 9 && (
            <span className="truncate px-0.5 text-[10px] leading-none tabular-nums text-muted-foreground group-hover:text-primary">
              {formatMinutes(gap.minutes)}
            </span>
          )}
        </button>
      ))}

      {items.map((item) => (
        <TimelineBlock
          key={item.id}
          item={item}
          isPast={item.end <= now}
          hex={categoryHex(item.category as EventCategory | null, calendarColors).solid}
          timeRange={`${fmt(item.start)} – ${fmt(item.end)}`}
        />
      ))}

      {/* Now */}
      <div
        className="pointer-events-none absolute top-[-3px] z-20 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
        style={{ left: `${nowPct}%`, height: lanesPx + 6 }}
        aria-hidden
      />
    </div>
  );
}

function TimelineBlock({
  item,
  isPast,
  hex,
  timeRange,
}: {
  item: TimelineItem;
  isPast: boolean;
  hex: string;
  timeRange: string;
}) {
  // Committed event: solid. Planned sitting: outlined in its category colour.
  // Tentative: dashed ghost.
  const style: React.CSSProperties = {
    left: `${item.leftPct}%`,
    width: `max(${item.widthPct}%, 4px)`,
    top: item.lane * (LANE_PX + LANE_GAP_PX),
    height: LANE_PX,
    ...(item.kind === "event"
      ? { backgroundColor: hex }
      : item.kind === "planned"
        ? { border: `1.5px solid ${hex}`, backgroundColor: `color-mix(in srgb, ${hex} 15%, transparent)` }
        : { border: `1.5px dashed ${hex}`, backgroundColor: "transparent" }),
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "absolute z-10 overflow-hidden rounded-[4px] text-left transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            isPast && "opacity-40"
          )}
          style={style}
          aria-label={`${item.title}, ${timeRange}${item.kind === "tentative" ? ", maybe" : ""}`}
        >
          {/* Desktop names the blocks that have room; a phone relies on the
              next-event text above. */}
          {item.widthPct >= 7 && (
            <span
              className={cn(
                "hidden truncate px-1 text-[10px] leading-[16px] sm:block",
                item.kind === "event" ? "text-white" : "text-foreground"
              )}
            >
              {item.title}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-1.5 p-3 text-sm" align="start">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium leading-snug">{item.title}</p>
          {item.kind === "tentative" && (
            <Badge variant="outline" className="shrink-0 text-[10px]">
              maybe
            </Badge>
          )}
        </div>
        <p className="text-xs tabular-nums text-muted-foreground">{timeRange}</p>
        {item.location && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{item.location}</span>
          </p>
        )}
        {item.taskId && (
          <Link
            href={`/tasks?taskId=${item.taskId}`}
            className="inline-block text-xs font-medium text-primary hover:underline"
          >
            Open task
          </Link>
        )}
      </PopoverContent>
    </Popover>
  );
}
