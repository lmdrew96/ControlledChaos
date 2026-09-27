/**
 * A tentative event is one the user MIGHT go to. Its time is still theirs:
 * busy-time callers leave it out (getCalendarEventsByDateRange's
 * `committedOnly`), and anywhere a model reads the calendar, the title carries
 * this tag so it never treats a maybe as an obligation.
 */
export const AI_TENTATIVE_TAG = " (TENTATIVE: optional, the time counts as free)";

/** An event title as a model should read it. */
export function aiEventTitle(e: { title: string; isTentative?: boolean | null }): string {
  return e.isTentative ? `${e.title}${AI_TENTATIVE_TAG}` : e.title;
}
