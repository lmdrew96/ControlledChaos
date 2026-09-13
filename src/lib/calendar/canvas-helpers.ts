import { toUTC } from "@/lib/timezone";
import { parseCanvasTitle } from "@/lib/calendar/assessments";

/**
 * Rewrite an all-day date to 23:59:00 in the user's local timezone.
 * Canvas assignments default to "due at 11:59 PM" — iCal encodes this as a
 * VALUE=DATE (all-day) entry, losing the time. node-ical parses VALUE=DATE
 * to midnight UTC of that calendar day, so we read the date from UTC parts
 * (not the user's tz, which would shift westward into the previous day) and
 * rebuild 23:59 in the user's local time.
 */
export function toEndOfDayLocal(date: Date, timezone: string): Date {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return new Date(toUTC(`${year}-${month}-${day}T23:59:00`, timezone));
}

// ============================================================
// Canvas event classification
// ============================================================

/**
 * What kind of task, if any, a Canvas calendar event should generate.
 *  - "assessment": something you study FOR (quiz, exam, midterm) → prep task
 *  - "assignment": something you turn IN (homework, project, discussion post)
 *    → the task IS the work, due at the event's own due time
 *  - null: not coursework (class meetings, office hours, holidays)
 */
export type CanvasTaskKind = "assessment" | "assignment" | null;

// Canvas encodes the object type in the event UID:
//   event-assignment-12345@canvas.instructure.com   → coursework
//   event-quiz-12345@canvas.instructure.com         → quiz
//   event-discussion_topic-12345@…                  → graded discussion
//   event-calendar-event-12345@…                    → a plain calendar entry
// This is far more reliable than title keywords, which homework titles
// ("Reading Response 3", "Problem Set 4") routinely lack.
const ASSIGNMENT_UID_PATTERNS = ["assignment", "quiz", "discussion_topic"];

/** True if the UID marks this event as a Canvas assignment/quiz/discussion. */
export function isAssignmentEvent(uid: string): boolean {
  return ASSIGNMENT_UID_PATTERNS.some((p) => uid.includes(p));
}

// Title fallbacks, for feeds whose UIDs don't carry the Canvas object type.
// Word-boundary matched so "Latest Draft" isn't read as a TEST and
// "Contest Entry" isn't an exam.
const ASSESSMENT_TITLE_RE =
  /\b(QUIZ|QUIZZES|EXAM|EXAMS|MIDTERM|MIDTERMS|TEST|TESTS|FINALS)\b/i;
const COURSEWORK_TITLE_RE =
  /\b(QUIZ|QUIZZES|EXAM|EXAMS|MIDTERM|MIDTERMS|TEST|TESTS|FINALS|DUE|ASSIGNMENT|ASSIGNMENTS|HOMEWORK)\b/i;

/**
 * Decide whether a Canvas event should become a task, and which flavor.
 * UID is the primary signal; the title is a fallback for feeds that don't
 * use Canvas's standard UID shape.
 */
export function classifyCanvasEvent(
  uid: string,
  title: string
): CanvasTaskKind {
  const isCoursework =
    isAssignmentEvent(uid) || COURSEWORK_TITLE_RE.test(title);
  if (!isCoursework) return null;

  if (uid.includes("quiz") || ASSESSMENT_TITLE_RE.test(title)) {
    return "assessment";
  }
  return "assignment";
}

// ============================================================
// Assignment overrides
// ============================================================

/** event-assignment-override-1240874@… — a per-group/section copy of an assignment. */
export function isAssignmentOverrideUid(uid: string): boolean {
  return uid.includes("assignment-override");
}

/** event-assignment-15109562@… — the course-wide assignment itself. */
function isBaseAssignmentUid(uid: string): boolean {
  return uid.includes("event-assignment-") && !isAssignmentOverrideUid(uid);
}

// Canvas appends the group or section name: "Write a Team Charter (Mentor Program Group 3)".
const OVERRIDE_SUFFIX_RE = /\s*\([^()]*\)\s*$/;

function baseKey(courseCode: string | null, cleanTitle: string): string {
  return `${courseCode ?? ""}::${cleanTitle.trim().toLowerCase()}`;
}

/**
 * Keys of base assignments that also appear as an override in the same feed.
 *
 * Canvas emits BOTH the base assignment and an assignment-override event for
 * a student the override applies to (a group or section with its own dates).
 * The two UIDs share no id, so UID matching can't pair them and the sync made
 * two tasks for one piece of work. The override carries this student's actual
 * due date, so it wins and the base event is skipped.
 */
export function findOverriddenBaseKeys(
  events: Array<{ uid: string; title: string }>
): Set<string> {
  const keys = new Set<string>();
  for (const { uid, title } of events) {
    if (!isAssignmentOverrideUid(uid)) continue;
    const { cleanTitle, courseCode } = parseCanvasTitle(title);
    const stripped = cleanTitle.replace(OVERRIDE_SUFFIX_RE, "");
    // No suffix means we can't tell which base it shadows — don't guess.
    if (stripped === cleanTitle) continue;
    keys.add(baseKey(courseCode, stripped));
  }
  return keys;
}

/** True if this is a base assignment shadowed by an override in the same feed. */
export function isShadowedBaseAssignment(
  uid: string,
  title: string,
  overriddenBaseKeys: Set<string>
): boolean {
  if (!isBaseAssignmentUid(uid)) return false;
  const { cleanTitle, courseCode } = parseCanvasTitle(title);
  return overriddenBaseKeys.has(baseKey(courseCode, cleanTitle));
}

// The description buildCanvasTaskFields writes: "LATN101 · Due Wed, Sep 23, 1:50 PM".
// Anything else was written or edited by a person and is never overwritten.
const GENERATED_DESCRIPTION_RE = /^(?:[^·\n]+ · )*Due [^·\n]+$/;

export function isGeneratedCanvasDescription(description: string | null): boolean {
  return typeof description === "string" && GENERATED_DESCRIPTION_RE.test(description);
}

/**
 * Whether a Canvas event should be stored as a calendar event.
 *
 * Assignments and homework are work you DO, not a block of time you're
 * somewhere — they belong in the task list only. Putting them on the
 * calendar too double-counts them and clutters the day view with 11:59 PM
 * entries that aren't really appointments.
 *
 * Assessments (quizzes, tests, exams, midterms, finals) stay on the calendar:
 * they genuinely occupy a fixed time slot you have to show up for. They also
 * get a companion "prep" task, created by the Canvas sync adapter.
 *
 * Everything else (class meetings, office hours, holidays) stays an event.
 */
export function shouldSyncAsCalendarEvent(kind: CanvasTaskKind): boolean {
  return kind !== "assignment";
}

/**
 * Local wall-clock hour and minute for a Date in the given timezone.
 * One Intl pass — getHourInTimezone() would need a second one for the minute.
 */
function getLocalHourMinute(
  date: Date,
  timezone: string
): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour =
    Number(parts.find((p) => p.type === "hour")!.value) % 24;
  const minute = Number(parts.find((p) => p.type === "minute")!.value);
  return { hour, minute };
}

/**
 * True if a Canvas due time is an end-of-day deadline (11:55–11:59 PM local).
 *
 * Canvas stamps coursework due dates at 11:59 PM local. That's a submission
 * cutoff, not a time you have to be somewhere — and the calendar grid tops out
 * at midnight, so an event card starting at 11:59 PM renders off the bottom
 * with no way to scroll to it. The window reaches back to :55 to absorb feeds
 * that round the minute.
 */
export function isEndOfDayDeadline(date: Date, timezone: string): boolean {
  const { hour, minute } = getLocalHourMinute(date, timezone);
  return hour === 23 && minute >= 55;
}
