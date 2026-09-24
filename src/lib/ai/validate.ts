/**
 * Shared validation utilities for AI responses.
 * Used across brain dump parsing, recommendation, scheduling, and digests.
 */

/**
 * Validate and coerce a string to ISO 8601 date format.
 * Returns the valid ISO string or undefined if unparseable.
 */
export function validateISODate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) {
    console.warn(`[AI Validate] Invalid date discarded: "${value}"`);
    return undefined;
  }
  // Ensure it's not in the distant past (likely a hallucination)
  const now = new Date();
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  if (parsed < oneYearAgo) {
    console.warn(`[AI Validate] Date too far in past, discarded: "${value}"`);
    return undefined;
  }
  return parsed.toISOString();
}

/**
 * Enforce a word limit on AI-generated text without ever ending mid-sentence.
 *
 * Cuts at the last sentence boundary within the limit when that keeps at
 * least half of it. Otherwise it finishes the sentence the limit fell inside,
 * running a little long. This used to chop at the limit and append "...",
 * so a push stored and shown in the notification menu read "we need to
 * get..." with no way to see the rest. The model's max_tokens already bounds
 * how long "a little long" can be.
 */
export function enforceWordLimit(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;

  // The first maxWords words exactly as written, so offsets line up with
  // `text` even when the model used newlines or double spaces.
  const truncated = text.match(new RegExp(`^\\s*(?:\\S+\\s+){${maxWords - 1}}\\S+`))?.[0] ?? text;
  const lastBoundary = Math.max(
    truncated.lastIndexOf("."),
    truncated.lastIndexOf("!"),
    truncated.lastIndexOf("?")
  );
  if (lastBoundary > truncated.length * 0.5) {
    return truncated.slice(0, lastBoundary + 1);
  }

  // Finish the sentence in progress rather than cut it.
  const rest = text.slice(truncated.length);
  const nextEnd = rest.search(/[.!?]/);
  return nextEnd === -1 ? text : text.slice(0, truncated.length + nextEnd + 1);
}

/**
 * Extract and parse JSON from an AI response.
 * Handles optional markdown code block wrapping and <scratchpad> reasoning blocks.
 */
export function extractJSON<T>(raw: string): T {
  let jsonText = raw.trim();
  // Strip <scratchpad>...</scratchpad> reasoning blocks if present
  jsonText = jsonText.replace(/<scratchpad>[\s\S]*?<\/scratchpad>/gi, "").trim();
  // Strip markdown code blocks if present
  const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonText = jsonMatch[1].trim();
  }
  return JSON.parse(jsonText);
}

/**
 * Extract scratchpad reasoning from an AI response, if present.
 * Returns null if no scratchpad block found.
 */
export function extractScratchpad(raw: string): string | null {
  const match = raw.match(/<scratchpad>([\s\S]*?)<\/scratchpad>/i);
  return match ? match[1].trim() : null;
}

/**
 * Repair text that an upstream producer cut mid-word — typically a model
 * response that hit its max_tokens wall. Drops the dangling partial word, then
 * rewinds to the last sentence boundary so the result reads as finished rather
 * than as a sentence that trails off.
 *
 * Returns the text unchanged when it already ends cleanly.
 */
export function trimIncompleteTail(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) return "";

  // Already ends on terminal punctuation — nothing was cut.
  if (/[.!?]["')\]]?$/.test(trimmed)) return trimmed;

  // Rewind to the last completed sentence.
  const lastBoundary = Math.max(
    trimmed.lastIndexOf("."),
    trimmed.lastIndexOf("!"),
    trimmed.lastIndexOf("?")
  );
  if (lastBoundary > 0) return trimmed.slice(0, lastBoundary + 1);

  // No sentence ever completed. Keep whole words only and mark the cut.
  const lastSpace = trimmed.lastIndexOf(" ");
  const words = lastSpace > 0 ? trimmed.slice(0, lastSpace) : trimmed;
  return `${words.replace(/[\s(,;:—-]+$/, "")}…`;
}
