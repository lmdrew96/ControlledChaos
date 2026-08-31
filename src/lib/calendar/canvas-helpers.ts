import { toUTC } from "@/lib/timezone";

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
