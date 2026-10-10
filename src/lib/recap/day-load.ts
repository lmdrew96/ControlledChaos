import type { RecapEntry } from "@/types";
import { isAssessmentTitle } from "@/lib/calendar/assessments";

/**
 * What a day held, read off the Mirror timeline (getRecapDay).
 *
 * The evening wrap-up used to judge a day by tasks checked off, so a student
 * day with an exam and five other commitments read as "quiet". For a student
 * the calendar is most of the work, so this weighs it first.
 *
 * ControlledChaos can't know whether they went to anything, so this only ever
 * describes what the calendar HAD — never attendance.
 */

type EventEntry = Extract<RecapEntry, { kind: "event" }>;

export interface DayLoadEvent {
  /** Display label: title without its Canvas course tag, plus any badge. */
  title: string;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  isTentative: boolean;
  /** An exam, quiz, test, or due assessment — gets named explicitly. */
  isNotable: boolean;
}

export interface DayLoad {
  /** Chronological. Planned task sessions aren't calendar events, so they never land here. */
  events: DayLoadEvent[];
  /** Union of timed, non-tentative events, so overlaps don't double-count. All-day excluded. */
  scheduledMinutes: number;
  tasksDone: string[];
  microtasksDone: number;
  moments: number;
  journals: number;
  dumps: number;
  rescues: number;
  /** Nothing at all on the Mirror — the only day that may be called quiet. */
  isEmpty: boolean;
}

/** Canvas titles end in a course tag like "[26F-PSYC100-010]"; it's noise in prose. */
const stripCourseTag = (title: string): string =>
  title.replace(/\s*\[[^\]]+\]\s*$/, "").trim();

/**
 * An exam is often flagged by a badge ("📝 Exam 1") on an otherwise ordinary
 * class tile ("PSYC 100 Lecture"), so the badge rides along in the label —
 * otherwise "including PSYC 100 Lecture" names the class but hides the exam.
 */
const eventLabel = (e: EventEntry): string => {
  const title = stripCourseTag(e.title);
  const badge = (e.badge ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
  return badge ? `${title} (${badge})` : title;
};

const toLoadEvent = (e: EventEntry): DayLoadEvent => ({
  title: eventLabel(e),
  startTime: new Date(e.at),
  endTime: new Date(e.endAt),
  isAllDay: e.isAllDay,
  isTentative: e.isTentative,
  isNotable: isAssessmentTitle(e.title) || isAssessmentTitle(e.badge ?? ""),
});

const unionMinutes = (events: DayLoadEvent[]): number => {
  const spans = events
    .filter((e) => !e.isAllDay && !e.isTentative)
    .map((e) => [e.startTime.getTime(), e.endTime.getTime()] as const)
    .filter(([s, end]) => end > s)
    .sort((a, b) => a[0] - b[0]);

  let total = 0;
  let curStart = -Infinity;
  let curEnd = -Infinity;
  for (const [s, end] of spans) {
    if (s > curEnd) {
      if (curEnd > curStart) total += curEnd - curStart;
      curStart = s;
      curEnd = end;
    } else if (end > curEnd) {
      curEnd = end;
    }
  }
  if (curEnd > curStart) total += curEnd - curStart;
  return Math.round(total / 60_000);
};

export const summarizeDayLoad = (entries: RecapEntry[]): DayLoad => {
  const events = entries
    .filter((e): e is EventEntry => e.kind === "event")
    .map(toLoadEvent)
    .sort((a, b) => {
      if (a.isAllDay !== b.isAllDay) return a.isAllDay ? -1 : 1;
      return a.startTime.getTime() - b.startTime.getTime();
    });

  const count = (kind: RecapEntry["kind"]): number =>
    entries.filter((e) => e.kind === kind).length;

  return {
    events,
    scheduledMinutes: unionMinutes(events),
    tasksDone: entries
      .filter((e): e is Extract<RecapEntry, { kind: "task" }> => e.kind === "task")
      .sort((a, b) => a.at.localeCompare(b.at))
      .map((t) => t.title),
    microtasksDone: count("microtask"),
    moments: count("moment"),
    journals: count("journal"),
    dumps: count("dump"),
    rescues: count("rescue"),
    isEmpty: entries.length === 0,
  };
};

const NUMBER_WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
const countWord = (n: number): string => NUMBER_WORDS[n] ?? String(n);
const plural = (n: number, one: string, many: string): string =>
  `${n === 1 ? "a" : n} ${n === 1 ? one : many}`;

/**
 * The line under the AI note when nothing was checked off. It used to be a
 * hardcoded "No tasks checked off today", which contradicted any full day.
 * Says what the day held instead, and never mentions tasks.
 */
export const dayLoadSubtitle = (load: DayLoad): string => {
  if (load.events.length > 0) {
    const n = load.events.length;
    const things = `${countWord(n)} ${n === 1 ? "thing" : "things"} on the calendar today`;
    const notable = load.events.filter((e) => e.isNotable).map((e) => e.title);
    if (notable.length === 0) return `${things}.`;
    const named = notable.length <= 2 ? notable.join(" and ") : `${notable.length} assessments`;
    return `${things}, including ${named}.`;
  }

  const logged = [
    load.moments > 0 ? plural(load.moments, "moment", "moments") : null,
    load.journals > 0 ? plural(load.journals, "journal entry", "journal entries") : null,
    load.dumps > 0 ? plural(load.dumps, "brain dump", "brain dumps") : null,
    load.microtasksDone > 0 ? plural(load.microtasksDone, "microtask", "microtasks") : null,
    load.rescues > 0 ? plural(load.rescues, "rescue plan", "rescue plans") : null,
  ].filter((x): x is string => x !== null);

  if (logged.length > 0) {
    const list =
      logged.length === 1 ? logged[0] : `${logged.slice(0, -1).join(", ")} and ${logged.at(-1)}`;
    return `You logged ${list} today.`;
  }

  return "A quiet day. Those count too.";
};
