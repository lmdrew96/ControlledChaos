import Groq from "groq-sdk";

// Lazy singleton: unlike the Anthropic SDK used elsewhere in this codebase,
// groq-sdk's constructor throws immediately if apiKey is missing. Instantiating
// at module scope means Next.js's build-time page-data collection (which
// imports every route module) crashes the whole build if GROQ_API_KEY isn't
// set in that environment — deferring construction to first use turns that
// into a normal runtime error on this route only.
let groq: Groq | null = null;
function getGroqClient(): Groq {
  if (!groq) {
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groq;
}

interface TranscriptionResult {
  text: string;
  durationMs: number;
}

export async function transcribeAudio(
  audioBuffer: Buffer,
  fileName: string
): Promise<TranscriptionResult> {
  const start = Date.now();

  // Convert Buffer to Uint8Array for File constructor compatibility
  const file = new File([new Uint8Array(audioBuffer)], fileName, {
    type: getMimeType(fileName),
  });

  const transcription = await getGroqClient().audio.transcriptions.create({
    file,
    model: "whisper-large-v3-turbo",
    language: "en",
    response_format: "text",
  });

  const durationMs = Date.now() - start;
  console.log(`[AI] Groq Whisper transcription: ${durationMs}ms`);

  const text =
    typeof transcription === "string"
      ? transcription
      : transcription.text;

  return { text: text.trim(), durationMs };
}

function getMimeType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    webm: "audio/webm",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    m4a: "audio/mp4",
    ogg: "audio/ogg",
  };
  return mimeTypes[ext ?? ""] ?? "audio/webm";
}
