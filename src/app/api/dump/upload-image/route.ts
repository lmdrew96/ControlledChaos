import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { uploadPhoto } from "@/lib/storage/r2";
import { ensureUser } from "@/lib/db/queries";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

/**
 * Image-only upload to R2 for Junk Journal multi-media capture.
 * Unlike /api/dump/photo/extract, this endpoint does NOT run OCR —
 * Junk Journal images can be doodles, mood-board scraps, landscapes,
 * anything without legible text.
 */
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
    const file = formData.get("photo") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No photo file provided" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Photo too large (max 10MB)" },
        { status: 400 }
      );
    }

    const contentType = file.type || "image/jpeg";
    if (!ALLOWED_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: "Unsupported image format. Use JPEG, PNG, GIF, or WebP." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const extension = file.name.split(".").pop() ?? "jpg";

    const mediaUrl = await uploadPhoto({
      userId,
      buffer,
      contentType,
      fileExtension: extension,
    });

    return NextResponse.json({ mediaUrl });
  } catch (error) {
    console.error("[API] POST /api/dump/upload-image error:", error);
    const message =
      error instanceof Error ? error.message : "Photo upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
