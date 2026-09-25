import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { AIUnavailableError } from "@/lib/ai";
import {
  commitParsedDump,
  dumpContentError,
  parseDumpCategory,
} from "@/lib/brain-dump/commit";

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const content = typeof body.extractedText === "string" ? body.extractedText.trim() : "";
    const mediaUrl = typeof body.mediaUrl === "string" ? body.mediaUrl : null;

    if (!content) {
      return NextResponse.json({ error: "Extracted text is empty" }, { status: 400 });
    }
    const invalid = dumpContentError(content);
    if (invalid) {
      return NextResponse.json({ error: invalid }, { status: 400 });
    }

    const result = await commitParsedDump({
      userId,
      inputType: "photo",
      content,
      category: parseDumpCategory(body.category),
      mediaUrl,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[API] POST /api/dump/photo/parse error:", error);
    if (error instanceof AIUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    const message =
      error instanceof Error ? error.message : "Failed to parse brain dump";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
