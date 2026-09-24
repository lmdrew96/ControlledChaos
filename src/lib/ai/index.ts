import Anthropic, { APIError } from "@anthropic-ai/sdk";

// --- Centralized model constants ---
// Change these once to update every AI call across the codebase.
export const MODEL_HAIKU = "claude-haiku-4-5-20251001";
export const MODEL_SONNET = "claude-sonnet-5";

let client: Anthropic | null = null;

/**
 * Built on first use, not on import: the SDK constructor throws when no key
 * is set, and a module-scope throw turns a runtime secret into a build-time
 * requirement (see the getDb note in lib/db). A missing key still fails
 * loudly, at the request that needed it.
 */
const getAnthropic = (): Anthropic => {
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
};

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

/**
 * The model hit its max_tokens wall, so the response is cut off wherever the
 * token boundary happened to fall — mid-sentence, mid-word, or mid-JSON.
 *
 * Raised only for callers that opt in with `requireComplete`. Prose callers
 * generally should NOT: a slightly short sentence repaired by
 * trimIncompleteTail is better than no message at all. Structured callers
 * should, because truncated JSON is unparseable garbage and failing loudly
 * beats a SyntaxError from deep inside a parse helper.
 */
export class AIResponseTruncatedError extends Error {
  constructor(label: string, outputTokens: number) {
    super(
      `The AI response was cut off at its length limit (${label}, ${outputTokens} tokens). Try again.`
    );
    this.name = "AIResponseTruncatedError";
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
  /**
   * Short name for the calling feature ("parse-dump", "push-message", ...).
   * Only used to make the shared logs attributable — without it a max_tokens
   * warning in production names a model but not the feature that hit it.
   */
  label?: string;
  /**
   * Treat a max_tokens stop as an error rather than a result. See
   * AIResponseTruncatedError for when to use this.
   */
  requireComplete?: boolean;
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

// --- Shared implementation ---
//
// Haiku and Sonnet differ only by model id, so they share one body. Keeping
// them separate let the stop_reason handling below drift between the two.

async function callModel(
  model: string,
  modelName: string,
  params: AICallParams
): Promise<AICallResult> {
  const start = Date.now();

  const response = await callWithRetry(() =>
    getAnthropic().messages.create({
      model,
      max_tokens: params.maxTokens ?? 2048,
      system: params.system,
      messages: resolveMessages(params),
      ...(params.tools?.length ? { tools: params.tools } : {}),
    })
  );

  const durationMs = Date.now() - start;
  const site = params.label ? ` (${params.label})` : "";

  console.log(
    `[AI] ${modelName} call${site}: ${response.usage.input_tokens} in / ${response.usage.output_tokens} out / ${durationMs}ms`
  );

  // Every caller used to have to remember to check this, and exactly one did.
  // Warn centrally so a truncation is never silent, wherever it happens.
  if (response.stop_reason === "max_tokens") {
    console.warn(
      `[AI] ${modelName}${site} hit max_tokens (${response.usage.output_tokens} out) — response is cut off`
    );
    if (params.requireComplete) {
      throw new AIResponseTruncatedError(
        params.label ?? modelName,
        response.usage.output_tokens
      );
    }
  }

  const text = extractText(response.content);

  // An empty text result is indistinguishable downstream from "the model had
  // nothing to say", so surface it here rather than letting "" flow onward.
  // A tool-use turn legitimately carries no text.
  const usedTool = response.content.some((b) => b.type === "tool_use");
  if (text.length === 0 && !usedTool) {
    console.warn(
      `[AI] ${modelName}${site} returned no text (stop_reason=${response.stop_reason}, ${response.usage.output_tokens} out)`
    );
  }

  return {
    text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    durationMs,
    content: response.content,
    stopReason: response.stop_reason,
  };
}

// --- Haiku (fast, cheap — parsing, scheduling, chunking) ---

export async function callHaiku(params: AICallParams): Promise<AICallResult> {
  return callModel(MODEL_HAIKU, "Haiku", params);
}

// --- Sonnet (personality, sass — notifications, digests, crisis) ---

export async function callSonnet(params: AICallParams): Promise<AICallResult> {
  return callModel(MODEL_SONNET, "Sonnet", params);
}
