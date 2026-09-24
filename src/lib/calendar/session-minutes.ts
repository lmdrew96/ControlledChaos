/**
 * How long each sitting of a task runs.
 *
 * A session's stored `minutes` is an explicit override. NULL used to mean "use
 * the whole task estimate", so a 120-minute task planned across two sittings
 * rendered as two 120-minute blocks: the sittings cloned the work instead of
 * splitting it. Now NULL means "an even share of what's left":
 *
 *   (estimate − explicit minutes − logged progress) ÷ number of NULL sittings
 *
 * A single-sitting task still gets the full estimate, so nothing changes there.
 * Resolved at read time, never stored: editing one sitting or logging progress
 * re-divides the rest automatically.
 */

/** Anything shorter isn't really a sitting, and a zero-length block is invisible. */
export const MIN_SESSION_MINUTES = 15;

export type SessionOutcome = "done" | "partial" | "skipped";

export interface SessionLengthInput {
  id: string;
  /** Explicit length, or null to take an even share. */
  minutes: number | null;
  /** Set once the user has said how the sitting went. */
  status?: SessionOutcome | null;
  /** Work actually done in this sitting. Only meaningful with a status. */
  actualMinutes?: number | null;
}

/**
 * Resolve every sitting's length. Returns null for a sitting only when the
 * task has no estimate and the sitting no explicit length; callers fall back
 * to the default block length for those (planBlockMinutes).
 */
export function resolveSessionMinutes(
  estimatedMinutes: number | null,
  sessions: SessionLengthInput[]
): Map<string, number | null> {
  const resolved = new Map<string, number | null>();

  // A sitting with an outcome is history: it shows what was actually done
  // and its work comes off the top of the estimate.
  const logged = sessions.filter((s) => s.status);
  const open = sessions.filter((s) => !s.status);

  const loggedMinutes = logged.reduce((sum, s) => sum + (s.actualMinutes ?? 0), 0);
  const explicitOpen = open.reduce((sum, s) => sum + (s.minutes ?? 0), 0);
  const shareCount = open.filter((s) => s.minutes == null).length;

  const share =
    estimatedMinutes == null || shareCount === 0
      ? null
      : Math.max(
          MIN_SESSION_MINUTES,
          Math.round((estimatedMinutes - loggedMinutes - explicitOpen) / shareCount)
        );

  for (const s of open) resolved.set(s.id, s.minutes ?? share);
  for (const s of logged) {
    // Skipped keeps its planned length on the calendar (it was still time
    // that had been set aside); done/partial show what was actually done.
    resolved.set(
      s.id,
      s.status === "skipped" || !s.actualMinutes ? s.minutes ?? share : s.actualMinutes
    );
  }

  return resolved;
}

/** Block length used when a sitting resolves to null. Matches planBlockMinutes. */
const DEFAULT_SITTING_MINUTES = 30;

/**
 * Which sitting a task card should talk about, derived from the clock at
 * read time. A stored "next" goes stale the moment a sitting ends.
 *
 * - `nextAt`: the first sitting that hasn't ENDED yet (one underway counts).
 * - `passedAt`: the most recent sitting that has ended.
 */
export function sessionMarkers(
  sessions: Array<{ startsAt: Date; minutes: number | null }>,
  now: Date = new Date()
): { nextAt: Date | null; passedAt: Date | null } {
  let nextAt: Date | null = null;
  let passedAt: Date | null = null;
  for (const s of [...sessions].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())) {
    const endMs = s.startsAt.getTime() + (s.minutes ?? DEFAULT_SITTING_MINUTES) * 60_000;
    if (endMs > now.getTime()) {
      nextAt ??= s.startsAt;
    } else {
      passedAt = s.startsAt;
    }
  }
  return { nextAt, passedAt };
}
