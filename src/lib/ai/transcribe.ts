import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

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

  const transcription = await groq.audio.transcriptions.create({
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
