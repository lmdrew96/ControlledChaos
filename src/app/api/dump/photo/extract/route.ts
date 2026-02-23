import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { uploadPhoto } from "@/lib/storage/r2";
import { extractTextFromPhoto } from "@/lib/ai/extract-photo";
import { AIUnavailableError } from "@/lib/ai";
import { ensureUser } from "@/lib/db/queries";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const clerkUser = await currentUser();
    await ensureUser(
      userId,
      clerkUser?.emailAddresses[0]?.emailAddress ?? "",
      clerkUser?.firstName ?? undefined
    );

    const formData = await request.formData();
    const photoFile = formData.get("photo") as File | null;

    if (!photoFile) {
      return NextResponse.json(
        { error: "No photo file provided" },
        { status: 400 }
      );
    }

    if (photoFile.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Photo too large (max 10MB)" },
        { status: 400 }
      );
    }

    const contentType = photoFile.type || "image/jpeg";
    if (!ALLOWED_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: "Unsupported image format. Use JPEG, PNG, GIF, or WebP." },
        { status: 400 }
      );
    }

    const arrayBuffer = await photoFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Data = buffer.toString("base64");
    const extension = photoFile.name.split(".").pop() ?? "jpg";

    // Upload to R2 and extract text via Vision in parallel
    const [mediaUrl, extraction] = await Promise.all([
      uploadPhoto({
        userId,
        buffer,
        contentType,
        fileExtension: extension,
      }),
      extractTextFromPhoto(
        base64Data,
        contentType as "image/jpeg" | "image/png" | "image/gif" | "image/webp"
      ),
    ]);

    if (
      !extraction.text.trim() ||
      extraction.text.includes("[NO TEXT DETECTED]")
    ) {
      return NextResponse.json(
        {
          error:
            "No readable text found in the photo. Try a clearer image or use text/voice input instead.",
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      extractedText: extraction.text,
      mediaUrl,
      extractionDurationMs: extraction.durationMs,
    });
  } catch (error) {
    console.error("[API] POST /api/dump/photo/extract error:", error);
    if (error instanceof AIUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    const message =
      error instanceof Error ? error.message : "Photo processing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
