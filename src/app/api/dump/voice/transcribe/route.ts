import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { uploadAudio } from "@/lib/storage/r2";
import { transcribeAudio } from "@/lib/ai/transcribe";
import { ensureUser } from "@/lib/db/queries";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Ensure user exists in our DB
    const clerkUser = await currentUser();
    await ensureUser(
      userId,
      clerkUser?.emailAddresses[0]?.emailAddress ?? "",
      clerkUser?.firstName ?? undefined
    );

    // Parse FormData
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File | null;

    if (!audioFile) {
      return NextResponse.json(
        { error: "No audio file provided" },
        { status: 400 }
      );
    }

    if (audioFile.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Audio file too large (max 10MB)" },
        { status: 400 }
      );
    }

    // Convert to Buffer
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const extension = audioFile.name.split(".").pop() ?? "webm";

    // Upload to R2 and transcribe in parallel
    const [mediaUrl, transcription] = await Promise.all([
      uploadAudio({
        userId,
        buffer,
        contentType: audioFile.type || "audio/webm",
        fileExtension: extension,
      }),
      transcribeAudio(buffer, audioFile.name || `recording.${extension}`),
    ]);

    return NextResponse.json({
      transcript: transcription.text,
      mediaUrl,
      transcriptionDurationMs: transcription.durationMs,
    });
  } catch (error) {
    console.error("[API] POST /api/dump/voice/transcribe error:", error);
    const message =
      error instanceof Error ? error.message : "Transcription failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
