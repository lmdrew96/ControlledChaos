import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { deleteReferenceCard, updateReferenceCard } from "@/lib/db/queries";
import { parseReferenceCardFields } from "@/lib/reference-cards";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const parsed = parseReferenceCardFields(await request.json(), { requireTitle: false });
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const card = await updateReferenceCard(id, userId, parsed.data);
    if (!card) {
      return NextResponse.json({ error: "Reference card not found" }, { status: 404 });
    }
    return NextResponse.json({ card });
  } catch (error) {
    console.error("[API] PATCH /api/reference-cards/[id] error:", error);
    return NextResponse.json({ error: "Failed to update reference card" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!(await deleteReferenceCard(id, userId))) {
      return NextResponse.json({ error: "Reference card not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] DELETE /api/reference-cards/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete reference card" }, { status: 500 });
  }
}
