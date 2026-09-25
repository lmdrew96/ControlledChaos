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
    const content = typeof body.content === "string" ? body.content.trim() : "";

    if (!content) {
      return NextResponse.json({ error: "Brain dump content cannot be empty" }, { status: 400 });
    }
    const invalid = dumpContentError(content);
    if (invalid) {
      return NextResponse.json({ error: invalid }, { status: 400 });
    }

    const result = await commitParsedDump({
      userId,
      inputType: "text",
      content,
      category: parseDumpCategory(body.category),
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[API] POST /api/dump/text error:", error);
    if (error instanceof AIUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    const message =
      error instanceof Error ? error.message : "Something went wrong";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
