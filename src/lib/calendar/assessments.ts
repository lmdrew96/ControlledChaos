// Shared helpers for detecting Canvas assessment events by title keywords.
// Used by AI context (to flag urgency) and by the Canvas sync adapter
// (to auto-generate prep tasks).

const ASSESSMENT_TITLE_KEYWORDS = [
  "QUIZ",
  "EXAM",
  "TEST",
  "MIDTERM",
  "FINAL",
  "DUE",
  "ASSIGNMENT",
] as const;

export function isAssessmentTitle(title: string): boolean {
  if (!title) return false;
  const upper = title.toUpperCase();
  return ASSESSMENT_TITLE_KEYWORDS.some((k) => upper.includes(k));
}

/**
 * Parse a Canvas event title into a cleaner form for auto-prep tasks.
 *
 * Canvas event titles usually come shaped like
 *   "QUIZ: James Baldwin's \"Sonny's Blues\" [26S-ENGL204-510]"
 * or
 *   "Second Creative Response Project Assignment [26S-ENGL204-510]"
 *
 * We split that into:
 *   - `cleanTitle`: title minus the trailing course tag and leading
 *     assessment-type prefix (QUIZ:/EXAM:/TEST:/MIDTERM:/FINAL:)
 *   - `assessmentType`: human-readable type noun ("Quiz", "Exam", …) or null
 *   - `courseCode`: something like "ENGL204" if the tag matched the common
 *     `[SEM-DEPT###-SECTION]` shape; null otherwise
 */
export interface ParsedCanvasTitle {
  cleanTitle: string;
  assessmentType: string | null;
  courseCode: string | null;
}

const TITLE_TYPE_PREFIX_RE = /^(QUIZ|EXAM|TEST|MIDTERM|FINAL)\s*:\s*/i;
const TRAILING_TAG_RE = /\s*\[([^\]]+)\]\s*$/;
// Matches a course-code-shaped token like "ENGL204", "ANTH104", "CS3140"
const COURSE_CODE_RE = /\b([A-Z]{2,5}\d{2,4})\b/;

export function parseCanvasTitle(raw: string): ParsedCanvasTitle {
  let working = raw.trim();
  let courseCode: string | null = null;

  // Strip trailing [course tag] and try to extract a course code from it.
  const tagMatch = working.match(TRAILING_TAG_RE);
  if (tagMatch) {
    working = working.replace(TRAILING_TAG_RE, "").trim();
    const codeMatch = tagMatch[1].match(COURSE_CODE_RE);
    if (codeMatch) courseCode = codeMatch[1];
  }

  // Strip leading "QUIZ:", "EXAM:", etc. and remember the type.
  let assessmentType: string | null = null;
  const prefixMatch = working.match(TITLE_TYPE_PREFIX_RE);
  if (prefixMatch) {
    const raw = prefixMatch[1].toUpperCase();
    assessmentType = raw.charAt(0) + raw.slice(1).toLowerCase(); // QUIZ → Quiz
    working = working.replace(TITLE_TYPE_PREFIX_RE, "").trim();
  }

  return {
    cleanTitle: working.length > 0 ? working : raw,
    assessmentType,
    courseCode,
  };
}
