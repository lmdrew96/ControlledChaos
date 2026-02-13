import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getUserSettings } from "@/lib/db/queries";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const settings = await getUserSettings(userId);
    return NextResponse.json({
      onboardingComplete: settings?.onboardingComplete ?? false,
    });
  } catch (error) {
    console.error("[API] GET /api/onboarding/status error:", error);
    return NextResponse.json(
      { error: "Failed to check onboarding status" },
      { status: 500 }
    );
  }
}
