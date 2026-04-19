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
