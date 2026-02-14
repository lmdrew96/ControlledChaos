import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getUserSettings, updateUserSettings } from "@/lib/db/queries";
import type { EnergyProfile } from "@/types";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const settings = await getUserSettings(userId);
    return NextResponse.json({
      energyProfile: settings?.energyProfile ?? null,
      canvasIcalUrl: settings?.canvasIcalUrl ?? null,
      googleCalConnected: settings?.googleCalConnected ?? false,
    });
  } catch (error) {
    console.error("[API] GET /api/settings error:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (body.energyProfile !== undefined) {
      data.energyProfile = body.energyProfile as EnergyProfile;
    }
    if (body.canvasIcalUrl !== undefined) {
      data.canvasIcalUrl = body.canvasIcalUrl;
    }

    const updated = await updateUserSettings(userId, data);

    if (!updated) {
      return NextResponse.json(
        { error: "Settings not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ settings: updated });
  } catch (error) {
    console.error("[API] PATCH /api/settings error:", error);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
