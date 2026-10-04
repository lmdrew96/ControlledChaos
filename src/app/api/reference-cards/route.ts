import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createReferenceCard, getUser, listReferenceCards } from "@/lib/db/queries";
import { parseReferenceCardFields } from "@/lib/reference-cards";
import { todayInTimezone } from "@/lib/timezone";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getUser(userId);
    const today = todayInTimezone(user?.timezone ?? "America/New_York");
    const cards = await listReferenceCards(userId, today);
    return NextResponse.json({ cards });
  } catch (error) {
    console.error("[API] GET /api/reference-cards error:", error);
    return NextResponse.json({ error: "Failed to fetch reference cards" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = parseReferenceCardFields(await request.json(), { requireTitle: true });
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { title, content, daysOfWeek, showFrom, showUntil, checklistReset } = parsed.data;

    const card = await createReferenceCard(userId, {
      title: title!,
      content,
      daysOfWeek,
      showFrom,
      showUntil,
      checklistReset,
    });
    return NextResponse.json({ card }, { status: 201 });
  } catch (error) {
    console.error("[API] POST /api/reference-cards error:", error);
    return NextResponse.json({ error: "Failed to create reference card" }, { status: 500 });
  }
}
