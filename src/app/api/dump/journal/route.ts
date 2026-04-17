import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { summarizeJunkJournal } from "@/lib/ai/parse-dump";
import { AIUnavailableError } from "@/lib/ai";
import { createBrainDump, ensureUser } from "@/lib/db/queries";

const MAX_CONTENT_LENGTH = 10_000;
const MAX_ATTACHMENTS = 10;

/**
 * Create a Junk Journal entry with optional text + multiple image URLs.
 *
 * Differs from /api/dump/text because:
 * - Content is optional (image-only entries are valid)
 * - Multi-media via mediaUrls[] (text is just ONE piece of an entry)
 * - Never extracts tasks/events (Junk Journal is raw material for Cosma,
 *   not task capture)
 * - Summarizes only when there's content to summarize
 *
 * Image uploads happen separately via /api/dump/upload-image; this endpoint
 * receives the resulting R2 URLs.
 */
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const contentRaw = typeof body.content === "string" ? body.content : "";
    const mediaUrlsRaw = Array.isArray(body.mediaUrls) ? body.mediaUrls : [];

    const content = contentRaw.trim();
    const mediaUrls = mediaUrlsRaw.filter(
      (u: unknown): u is string => typeof u === "string" && u.length > 0
    );

    if (!content && mediaUrls.length === 0) {
      return NextResponse.json(
        { error: "Entry must have text or at least one image" },
        { status: 400 }
      );
    }

    if (content.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json(
        { error: `Entry text too long (max ${MAX_CONTENT_LENGTH} characters)` },
        { status: 400 }
      );
    }

    if (mediaUrls.length > MAX_ATTACHMENTS) {
      return NextResponse.json(
        { error: `Too many attachments (max ${MAX_ATTACHMENTS})` },
        { status: 400 }
      );
    }

    // Ensure user record exists (Clerk sync)
    const clerkUser = await currentUser();
    await ensureUser(
      userId,
      clerkUser?.emailAddresses[0]?.emailAddress ?? "",
      clerkUser?.firstName ?? undefined
    );

    const summary = content
      ? await summarizeJunkJournal(content)
      : "Image-only journal entry";

    // inputType marks the dominant modality for back-compat display
    const inputType = content ? "text" : "photo";

    const dump = await createBrainDump({
      userId,
      inputType,
      rawContent: content || null,
      aiResponse: { tasks: [], events: [], summary },
      mediaUrl: mediaUrls[0] ?? null,
      mediaUrls,
      category: "junk_journal",
    });

    return NextResponse.json({
      dump: {
        id: dump.id,
        summary,
        mediaUrls,
      },
    });
  } catch (error) {
    console.error("[API] POST /api/dump/journal error:", error);
    if (error instanceof AIUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    const message =
      error instanceof Error ? error.message : "Failed to save journal entry";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
