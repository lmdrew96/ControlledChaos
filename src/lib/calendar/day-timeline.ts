/**
 * Layout for the dashboard's day timeline: today's events and planned
 * sittings on one strip from wake to sleep, stacked into lanes where they
 * overlap, plus the free gaps between them.
 *
 * Tentative events are drawn but count as free time: "maybe" isn't a claim on
 * the day. Gaps only look forward (from now), since a free hour that already
 * passed isn't something you can still use.
 */

export type TimelineKind = "event" | "tentative" | "planned";

export interface TimelineInput {
  id: string;
  title: string;
  start: Date;
  end: Date;
  kind: TimelineKind;
  category?: string | null;
  location?: string | null;
  taskId?: string;
}

export interface TimelineItem extends TimelineInput {
  lane: number;
  /** Left edge and width as percentages of the strip. */
  leftPct: number;
  widthPct: number;
}

export interface TimelineGap {
  start: Date;
  end: Date;
  minutes: number;
  leftPct: number;
  widthPct: number;
}

/** A free stretch shorter than this isn't labelled or offered. */
export const MIN_GAP_MINUTES = 30;
/** Past this many overlapping items, the rest share the last lane. */
export const MAX_LANES = 3;

export const buildDayTimeline = (
  inputs: TimelineInput[],
  dayStart: Date,
  dayEnd: Date,
  now: Date
): { items: TimelineItem[]; gaps: TimelineGap[]; lanes: number } => {
  const startMs = dayStart.getTime();
  const endMs = dayEnd.getTime();
  const span = endMs - startMs;
  if (span <= 0) return { items: [], gaps: [], lanes: 1 };

  const pct = (ms: number) => ((Math.min(Math.max(ms, startMs), endMs) - startMs) / span) * 100;

  // Clip to the strip; anything entirely outside it isn't today's shape.
  const visible = inputs
    .filter((i) => i.end.getTime() > startMs && i.start.getTime() < endMs)
    .sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime());

  // Greedy lanes: first lane whose last item has ended.
  const laneEnds: number[] = [];
  const items: TimelineItem[] = visible.map((input) => {
    const s = input.start.getTime();
    let lane = laneEnds.findIndex((end) => end <= s);
    if (lane === -1) lane = Math.min(laneEnds.length, MAX_LANES - 1);
    laneEnds[lane] = Math.max(laneEnds[lane] ?? 0, input.end.getTime());
    const leftPct = pct(s);
    return { ...input, lane, leftPct, widthPct: pct(input.end.getTime()) - leftPct };
  });

  // Free time from now (or wake) to sleep, minus everything that isn't tentative.
  const busy = visible
    .filter((i) => i.kind !== "tentative")
    .map((i) => [i.start.getTime(), i.end.getTime()] as const);
  const gaps: TimelineGap[] = [];
  let cursor = Math.max(startMs, now.getTime());
  const pushGap = (from: number, to: number) => {
    const minutes = Math.floor((to - from) / 60_000);
    if (minutes < MIN_GAP_MINUTES) return;
    const leftPct = pct(from);
    gaps.push({ start: new Date(from), end: new Date(to), minutes, leftPct, widthPct: pct(to) - leftPct });
  };
  for (const [s, e] of busy) {
    if (e <= cursor) continue;
    if (s > cursor) pushGap(cursor, Math.min(s, endMs));
    cursor = Math.max(cursor, e);
    if (cursor >= endMs) break;
  }
  if (cursor < endMs) pushGap(cursor, endMs);

  return { items, gaps, lanes: Math.max(1, laneEnds.length) };
};
