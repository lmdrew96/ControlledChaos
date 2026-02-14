import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface ExtractPhotoResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

const PHOTO_EXTRACTION_SYSTEM = `You are a text extraction assistant for ControlledChaos, an ADHD task management app.

Your job: Extract ALL readable text from this image. The image may contain:
- Handwritten notes or to-do lists
- Sticky notes or whiteboard photos
- Screenshots of assignments, syllabi, or emails
- Printed text, typed text, or mixed content

Rules:
- Extract every piece of readable text, preserving its grouping and structure
- For handwritten text, do your best interpretation — messy handwriting is expected
- Preserve bullet points, numbering, and list structure
- If text is partially obscured or unclear, include your best guess with [unclear] markers
- Do NOT try to organize or parse into tasks — just extract the raw text faithfully
- If the image contains no readable text, respond with exactly: [NO TEXT DETECTED]

Output the extracted text as plain text, preserving the original structure as much as possible.`;

export async function extractTextFromPhoto(
  base64Data: string,
  mediaType: ImageMediaType
): Promise<ExtractPhotoResult> {
  const start = Date.now();

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    system: PHOTO_EXTRACTION_SYSTEM,
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
  });

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
