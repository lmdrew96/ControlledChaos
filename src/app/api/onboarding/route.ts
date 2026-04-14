import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  ensureUser,
  getUserSettings,
  createUserSettings,
  updateUserSettings,
  updateUser,
  createLocation,
} from "@/lib/db/queries";
import type { EnergyProfile, PersonalityPrefs, NotificationPrefs } from "@/types";

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      displayName,
      timezone,
      energyProfile,
      canvasIcalUrl,
      personalityPrefs,
      notificationPrefs,
      locations,
    } = body as {
      displayName?: string;
      timezone?: string;
      energyProfile?: EnergyProfile;
      canvasIcalUrl?: string;
      personalityPrefs?: PersonalityPrefs;
      notificationPrefs?: {
        pushEnabled: boolean;
        emailMorningDigest: boolean;
        emailEveningDigest: boolean;
      };
      locations?: Array<{ name: string; latitude: string; longitude: string }>;
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

    // Validate personality prefs
    let validPersonality: PersonalityPrefs | null = null;
    if (personalityPrefs) {
      const valid = (v: unknown) => v === 0 || v === 1 || v === 2;
      if (valid(personalityPrefs.supportive) && valid(personalityPrefs.formality) && valid(personalityPrefs.language)) {
        validPersonality = personalityPrefs;
      }
    }

    // Build notification prefs with defaults for fields not collected in onboarding
    let validNotificationPrefs: NotificationPrefs | null = null;
    if (notificationPrefs) {
      validNotificationPrefs = {
        pushEnabled: !!notificationPrefs.pushEnabled,
        emailMorningDigest: !!notificationPrefs.emailMorningDigest,
        emailEveningDigest: !!notificationPrefs.emailEveningDigest,
        morningDigestTime: "07:30",
        eveningDigestTime: "21:00",
        quietHoursStart: "22:00",
        quietHoursEnd: "07:00",
        assertivenessMode: "balanced",
        locationNotificationsEnabled: false,
      };
    }

    // Create or update user settings
    const settingsData: Record<string, unknown> = {
      energyProfile: energyProfile ?? null,
      canvasIcalUrl: canvasIcalUrl?.trim() || null,
      onboardingComplete: true,
    };
    if (validPersonality) settingsData.personalityPrefs = validPersonality;
    if (validNotificationPrefs) settingsData.notificationPrefs = validNotificationPrefs;

    const existing = await getUserSettings(userId);
    if (existing) {
      await updateUserSettings(userId, settingsData);
    } else {
      await createUserSettings({
        userId,
        energyProfile: (energyProfile as EnergyProfile) ?? null,
        canvasIcalUrl: canvasIcalUrl?.trim() || null,
        onboardingComplete: true,
      });
      // Apply additional settings that createUserSettings doesn't accept
      const extraSettings: Record<string, unknown> = {};
      if (validPersonality) extraSettings.personalityPrefs = validPersonality;
      if (validNotificationPrefs) extraSettings.notificationPrefs = validNotificationPrefs;
      if (Object.keys(extraSettings).length > 0) {
        await updateUserSettings(userId, extraSettings);
      }
    }

    // Create locations
    if (locations && Array.isArray(locations)) {
      for (const loc of locations) {
        if (loc.name?.trim() && loc.latitude && loc.longitude) {
          await createLocation({
            userId,
            name: loc.name.trim(),
            latitude: loc.latitude,
            longitude: loc.longitude,
            radiusMeters: 200,
          });
        }
      }
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
