import Anthropic, { APIError } from "@anthropic-ai/sdk";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// --- Retry logic for transient Anthropic errors ---

const RETRY_DELAYS = [1000, 2000, 4000]; // 1s, 2s, 4s exponential backoff
const RETRYABLE_STATUS_CODES = new Set([529, 503]); // overloaded, service unavailable

const AI_UNAVAILABLE_MESSAGE =
  "AI features are temporarily unavailable. Your tasks are safe — try again in a few minutes.";

export class AIUnavailableError extends Error {
  constructor() {
    super(AI_UNAVAILABLE_MESSAGE);
    this.name = "AIUnavailableError";
  }
}

export async function callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isRetryable =
        error instanceof APIError &&
        RETRYABLE_STATUS_CODES.has(error.status);

      const hasRetriesLeft = attempt < RETRY_DELAYS.length;

      if (!isRetryable || !hasRetriesLeft) {
        if (isRetryable) {
          console.error(
            `[AI] All ${RETRY_DELAYS.length} retries exhausted (status ${(error as APIError).status})`
          );
          throw new AIUnavailableError();
        }
        throw error;
      }

      const delay = RETRY_DELAYS[attempt];
      console.warn(
        `[AI] Retryable error (${(error as APIError).status}), attempt ${attempt + 1}/${RETRY_DELAYS.length}, waiting ${delay}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error("Retry loop exited unexpectedly");
}

// --- Haiku call interface ---

interface HaikuCallParams {
  system: string;
  user: string;
  maxTokens?: number;
}

interface HaikuCallResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

export async function callHaiku(
  params: HaikuCallParams
): Promise<HaikuCallResult> {
  const start = Date.now();

  const response = await callWithRetry(() =>
    anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: params.maxTokens ?? 2048,
      system: params.system,
      messages: [{ role: "user", content: params.user }],
    })
  );

  const durationMs = Date.now() - start;
  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  console.log(
    `[AI] Haiku call: ${response.usage.input_tokens} in / ${response.usage.output_tokens} out / ${durationMs}ms`
  );

  return {
    text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    durationMs,
  };
}
