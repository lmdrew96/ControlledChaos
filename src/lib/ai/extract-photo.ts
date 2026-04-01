import { anthropic, callWithRetry } from "@/lib/ai";
import { PHOTO_EXTRACTION_SYSTEM_PROMPT } from "@/lib/ai/prompts";

interface ExtractPhotoResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export async function extractTextFromPhoto(
  base64Data: string,
  mediaType: ImageMediaType
): Promise<ExtractPhotoResult> {
  const start = Date.now();

  const response = await callWithRetry(() =>
    anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: PHOTO_EXTRACTION_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: base64Data,
              },
            },
            {
              type: "text",
              text: "Extract all text from this image.",
            },
          ],
        },
      ],
    })
  );

  const durationMs = Date.now() - start;
  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  console.log(
    `[AI] Photo extraction: ${response.usage.input_tokens} in / ${response.usage.output_tokens} out / ${durationMs}ms`
  );

  return {
    text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    durationMs,
  };
}
