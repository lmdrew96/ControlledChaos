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
 * Enforce a word limit on AI-generated text.
 * Truncates at the last sentence boundary within the limit.
 */
export function enforceWordLimit(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;

  const truncated = words.slice(0, maxWords).join(" ");
  // Try to cut at the last sentence boundary
  const lastPeriod = truncated.lastIndexOf(".");
  const lastExclamation = truncated.lastIndexOf("!");
  const lastBoundary = Math.max(lastPeriod, lastExclamation);

  if (lastBoundary > truncated.length * 0.5) {
    return truncated.slice(0, lastBoundary + 1);
  }
  return truncated + "...";
}

/**
 * Extract and parse JSON from an AI response.
 * Handles optional markdown code block wrapping.
 */
export function extractJSON<T>(raw: string): T {
  let jsonText = raw.trim();
  // Strip markdown code blocks if present
  const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonText = jsonMatch[1].trim();
  }
  return JSON.parse(jsonText);
}
