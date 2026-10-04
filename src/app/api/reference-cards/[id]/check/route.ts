import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getUser, setReferenceCardCheck } from "@/lib/db/queries";
import { todayInTimezone } from "@/lib/timezone";

/**
 * Tick a checklist item: { index, checked }. Clear the whole list: { reset: true }.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown> | null;
    let change: { index: number; checked: boolean } | null;
    if (body?.reset === true) {
      change = null;
    } else if (
      Number.isInteger(body?.index) &&
      (body!.index as number) >= 0 &&
      typeof body?.checked === "boolean"
    ) {
      change = { index: body.index as number, checked: body.checked };
    } else {
      return NextResponse.json(
        { error: "Send { index, checked } or { reset: true }" },
        { status: 400 }
      );
    }

    const user = await getUser(userId);
    const today = todayInTimezone(user?.timezone ?? "America/New_York");
    const card = await setReferenceCardCheck(id, userId, today, change);
    if (!card) {
      return NextResponse.json({ error: "Reference card not found" }, { status: 404 });
    }
    return NextResponse.json({ card });
  } catch (error) {
    console.error("[API] POST /api/reference-cards/[id]/check error:", error);
    return NextResponse.json({ error: "Failed to update checklist" }, { status: 500 });
  }
}
