/**
 * Allowlist for PATCH /api/tasks/[id].
 *
 * The route used to pass the raw request body straight into updateTask's
 * .set(), which meant an authenticated client could write columns the UI never
 * exposes — most dangerously `deletedAt`, which soft-deletes a task with no
 * user-visible action. The where clause scopes by userId, so this was never a
 * cross-user hole; it was a "your own data can be corrupted by a buggy or
 * hostile client" hole.
 *
 * Deliberately NOT writable: id, userId, deletedAt, createdAt, updatedAt,
 * sourceEventId, sourceDumpId, snoozedUntil. The Canvas/brain-dump origin
 * pointers in particular must stay server-owned — corrupting sourceEventId
 * orphans a task or makes the next sync duplicate it.
 */

/** Fields a client may write. Values are the coercion applied to each. */
const FIELD_PARSERS = {
  title: parseNonEmptyString,
  description: parseNullableString,
  status: parseString,
  priority: parseString,
  energyLevel: parseString,
  category: parseNullableString,
  locationTags: parseNullableStringArray,
  estimatedMinutes: parseNullableInt,
  deadline: parseNullableDate,
  targetDate: parseNullableDate,
  scheduledFor: parseNullableDate,
  completedAt: parseNullableDate,
  currentStepIndex: parseInt_,
  sortOrder: parseNullableInt,
  goalId: parseNullableString,
} as const;

export type TaskUpdateField = keyof typeof FIELD_PARSERS;

export type TaskUpdatePayload = {
  [K in TaskUpdateField]?: ReturnType<(typeof FIELD_PARSERS)[K]>;
};

export type ParseResult =
  | { ok: true; data: TaskUpdatePayload }
  | { ok: false; error: string };

class FieldError extends Error {}

/**
 * Parse a raw PATCH body into an object safe to hand to updateTask.
 *
 * Unknown keys are rejected with a 400-worthy error rather than silently
 * stripped: a caller sending a field we don't accept has a bug, and swallowing
 * it means edits fail silently — the worst outcome for a task app.
 */
export function parseTaskUpdate(body: unknown): ParseResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Request body must be an object" };
  }

  const entries = Object.entries(body as Record<string, unknown>);
  const unknown = entries
    .map(([key]) => key)
    .filter((key) => !(key in FIELD_PARSERS));

  if (unknown.length > 0) {
    return {
      ok: false,
      error: `Unknown or read-only field(s): ${unknown.join(", ")}`,
    };
  }

  const data: Record<string, unknown> = {};

  for (const [key, value] of entries) {
    if (value === undefined) continue;
    const parse = FIELD_PARSERS[key as TaskUpdateField];
    try {
      data[key] = parse(value, key);
    } catch (error) {
      if (error instanceof FieldError) {
        return { ok: false, error: error.message };
      }
      throw error;
    }
  }

  return { ok: true, data: data as TaskUpdatePayload };
}

// ── field parsers ───────────────────────────────────────────────────────────

function parseString(value: unknown, key: string): string {
  if (typeof value !== "string") {
    throw new FieldError(`${key} must be a string`);
  }
  return value;
}

function parseNonEmptyString(value: unknown, key: string): string {
  const str = parseString(value, key).trim();
  if (!str) throw new FieldError(`${key} cannot be empty`);
  return str;
}

function parseNullableString(value: unknown, key: string): string | null {
  if (value === null || value === "") return null;
  return parseString(value, key);
}

function parseNullableStringArray(
  value: unknown,
  key: string
): string[] | null {
  if (value === null) return null;
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    throw new FieldError(`${key} must be an array of strings or null`);
  }
  return value.length ? (value as string[]) : null;
}

function parseInt_(value: unknown, key: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new FieldError(`${key} must be an integer`);
  }
  return value;
}

function parseNullableInt(value: unknown, key: string): number | null {
  if (value === null || value === "") return null;
  // Callers sometimes send a form string; accept it rather than 400ing on a
  // value that's unambiguously an integer.
  const num = typeof value === "string" ? Number(value) : value;
  return parseInt_(num, key);
}

function parseNullableDate(value: unknown, key: string): Date | null {
  if (value === null || value === "") return null;
  if (value instanceof Date) return value;
  if (typeof value !== "string" && typeof value !== "number") {
    throw new FieldError(`${key} must be an ISO date string or null`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new FieldError(`${key} is not a valid date`);
  }
  return date;
}
