import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: params.maxTokens ?? 2048,
    system: params.system,
    messages: [{ role: "user", content: params.user }],
  });

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
