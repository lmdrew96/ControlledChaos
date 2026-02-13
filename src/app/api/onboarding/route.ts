import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  ensureUser,
  getUserSettings,
  createUserSettings,
  updateUserSettings,
  updateUser,
} from "@/lib/db/queries";
import type { EnergyProfile } from "@/types";

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { displayName, timezone, energyProfile, canvasIcalUrl } = body as {
      displayName?: string;
      timezone?: string;
      energyProfile?: EnergyProfile;
      canvasIcalUrl?: string;
    };

    if (!displayName?.trim()) {
      return NextResponse.json(
        { error: "Display name is required" },
        { status: 400 }
      );
    }

    // Ensure user record exists
    const clerkUser = await currentUser();
    await ensureUser(
      userId,
      clerkUser?.emailAddresses[0]?.emailAddress ?? "",
      displayName.trim()
    );

    // Update user display name and timezone
    await updateUser(userId, {
      displayName: displayName.trim(),
      timezone: timezone || "America/New_York",
    });

    // Create or update user settings
    const existing = await getUserSettings(userId);
    if (existing) {
      await updateUserSettings(userId, {
        energyProfile: energyProfile ?? null,
        canvasIcalUrl: canvasIcalUrl?.trim() || null,
        onboardingComplete: true,
      });
    } else {
      await createUserSettings({
        userId,
        energyProfile: energyProfile ?? null,
        canvasIcalUrl: canvasIcalUrl?.trim() || null,
        onboardingComplete: true,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] POST /api/onboarding error:", error);
    return NextResponse.json(
      { error: "Failed to save onboarding data" },
      { status: 500 }
    );
  }
}
