import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getOrCreateCalendarExportToken, regenerateCalendarExportToken } from "@/lib/db/queries";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const regenerate = body?.regenerate === true;

    const token = regenerate
      ? await regenerateCalendarExportToken(userId)
      : await getOrCreateCalendarExportToken(userId);

    const origin = request.nextUrl.origin;
    const subscribeUrl = `${origin}/api/calendar/export/${token}`;

    return NextResponse.json({ token, subscribeUrl });
  } catch (error) {
    console.error("[API] POST /api/calendar/export error:", error);
    return NextResponse.json({ error: "Failed to generate export token" }, { status: 500 });
  }
}
