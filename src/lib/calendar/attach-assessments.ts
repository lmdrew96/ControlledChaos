import { parseCanvasTitle } from "@/lib/calendar/assessments";

/**
 * Fold in-class Canvas assessments into the class tile they happen during.
 *
 * A quiz that falls inside a LATN 101 meeting used to render as its own tile
 * on top of the class, and the two split the column into slivers. When the
 * quiz and the class share a course code and the quiz lands within the class
 * time, the quiz rides on the class tile as a badge instead. It stays its own
 * event: the badge opens it.
 *
 * Read-time only. Nothing is written, so Canvas sync and the auto "Prep:"
 * tasks are untouched, and an unmatched assessment renders as before.
 */

export interface AttachableEvent {
  id: string;
  source: string;
  title: string;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
}

const IN_CLASS_RE = /\b(quiz|exam|test|midterm|final)\b/i;
const COURSE_RE = /\b([A-Z]{2,5})\s*-?\s*(\d{3}[A-Z]?)\b/;

/** "LATN 101 - Elementary Latin I" and "[26F-LATN101-010]" both → "LATN101". */
export function courseKey(title: string): string | null {
  const tagged = parseCanvasTitle(title).courseCode;
  if (tagged) return tagged.toUpperCase();
  const m = title.match(COURSE_RE);
  return m ? `${m[1]}${m[2]}`.toUpperCase() : null;
}

/** Only things that happen IN class. A homework "due" is a different thing. */
function inClassAssessmentType(e: AttachableEvent): string | null {
  if (e.source !== "canvas" || e.isAllDay) return null;
  const parsed = parseCanvasTitle(e.title);
  if (parsed.assessmentType) return parsed.assessmentType;
  const m = e.title.match(IN_CLASS_RE);
  return m ? m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() : null;
}

export function attachAssessmentsToClasses<E extends AttachableEvent>(
  events: E[]
): {
  /** What to render as tiles: everything except attached assessments. */
  visible: E[];
  /** Class event id → the assessments riding on it, with a badge label. */
  attached: Map<string, Array<{ event: E; label: string }>>;
} {
  const attached = new Map<string, Array<{ event: E; label: string }>>();
  const consumed = new Set<string>();

  const classes = events.filter((e) => !e.isAllDay && !inClassAssessmentType(e));

  for (const a of events) {
    const type = inClassAssessmentType(a);
    if (!type) continue;
    const key = courseKey(a.title);
    if (!key) continue;

    const aStart = new Date(a.startTime).getTime();
    const host = classes.find((c) => {
      if (courseKey(c.title) !== key) return false;
      const cStart = new Date(c.startTime).getTime();
      const cEnd = new Date(c.endTime).getTime();
      // Starts during the class (a quiz "due" exactly at class start counts).
      return aStart >= cStart && aStart < cEnd;
    });
    if (!host) continue;

    const list = attached.get(host.id) ?? [];
    list.push({ event: a, label: `📝 ${type}` });
    attached.set(host.id, list);
    consumed.add(a.id);
  }

  return { visible: events.filter((e) => !consumed.has(e.id)), attached };
}
