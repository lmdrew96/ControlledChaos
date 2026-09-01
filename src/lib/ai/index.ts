import Anthropic, { APIError } from "@anthropic-ai/sdk";

// --- Centralized model constants ---
// Change these once to update every AI call across the codebase.
export const MODEL_HAIKU = "claude-haiku-4-5-20251001";
export const MODEL_SONNET = "claude-sonnet-5";

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

// --- Shared call interface ---

/** Content blocks for multimodal messages (images, PDFs, etc.) */
type ContentBlocks = Anthropic.MessageCreateParams["messages"][0]["content"];

interface AICallParams {
  system: string;
  /** Plain text string OR an array of content blocks for multimodal input. */
  user?: string | ContentBlocks;
  /**
   * Full conversation as real message turns. Prefer this over `user` for any
   * multi-turn chat: flattening a transcript into one user-role string strips
   * the role attribution the model relies on to tell what the USER actually
   * said from what it said back, which is how a stated correction ends up
   * outranked by a stale system-prompt fact.
   *
   * Takes precedence over `user` when both are set.
   */
  messages?: Anthropic.MessageParam[];
  /** Tool definitions. Inspect `stopReason`/`content` on the result to handle calls. */
  tools?: Anthropic.Tool[];
  maxTokens?: number;
}

export interface AICallResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  /** Full content blocks — needed to read tool_use blocks and to echo the turn back. */
  content: Anthropic.ContentBlock[];
  stopReason: Anthropic.Message["stop_reason"];
}

/** Build the messages array from either shape, preferring real turns. */
function resolveMessages(params: AICallParams): Anthropic.MessageParam[] {
  if (params.messages?.length) return params.messages;
  return [{ role: "user", content: params.user ?? "" }];
}

/** Concatenate every text block — a tool-using turn can emit text alongside the call. */
function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

// --- Haiku (fast, cheap — parsing, scheduling, chunking) ---

export async function callHaiku(
  params: AICallParams
): Promise<AICallResult> {
  const start = Date.now();

  const response = await callWithRetry(() =>
    anthropic.messages.create({
      model: MODEL_HAIKU,
      max_tokens: params.maxTokens ?? 2048,
      system: params.system,
      messages: resolveMessages(params),
      ...(params.tools?.length ? { tools: params.tools } : {}),
    })
  );

  const durationMs = Date.now() - start;

  console.log(
    `[AI] Haiku call: ${response.usage.input_tokens} in / ${response.usage.output_tokens} out / ${durationMs}ms`
  );

  return {
    text: extractText(response.content),
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    durationMs,
    content: response.content,
    stopReason: response.stop_reason,
  };
}

// --- Sonnet (personality, sass — notifications, digests, crisis) ---

export async function callSonnet(
  params: AICallParams
): Promise<AICallResult> {
  const start = Date.now();

  const response = await callWithRetry(() =>
    anthropic.messages.create({
      model: MODEL_SONNET,
      max_tokens: params.maxTokens ?? 2048,
      system: params.system,
      messages: resolveMessages(params),
      ...(params.tools?.length ? { tools: params.tools } : {}),
    })
  );

  const durationMs = Date.now() - start;

  console.log(
    `[AI] Sonnet call: ${response.usage.input_tokens} in / ${response.usage.output_tokens} out / ${durationMs}ms`
  );

  return {
    text: extractText(response.content),
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    durationMs,
    content: response.content,
    stopReason: response.stop_reason,
  };
}
