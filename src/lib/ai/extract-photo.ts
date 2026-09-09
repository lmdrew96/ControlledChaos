import { callHaiku } from "@/lib/ai";
import type { AICallResult } from "@/lib/ai";
import { PHOTO_EXTRACTION_SYSTEM_PROMPT } from "@/lib/ai/prompts";

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export async function extractTextFromPhoto(
  base64Data: string,
  mediaType: ImageMediaType
): Promise<AICallResult> {
  return callHaiku({
    system: PHOTO_EXTRACTION_SYSTEM_PROMPT,
    user: [
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
    maxTokens: 4096,
    label: "photo-ocr",
    // Deliberately NOT requireComplete. A partial transcription is still
    // useful, and it lands in an editable brain-dump field the user reviews
    // before anything is created from it. The route flags the cut instead.
  });
}
