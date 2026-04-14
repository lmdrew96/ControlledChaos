import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getUser, getUserSettings, updateUser, updateUserSettings } from "@/lib/db/queries";
import type { CalendarColorKey, CalendarColors, EnergyProfile, NotificationPrefs, PersonalityPrefs } from "@/types";

const VALID_ASSERTIVENESS_MODES = new Set(["gentle", "balanced", "assertive"]);

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [user, settings] = await Promise.all([
      getUser(userId),
      getUserSettings(userId),
    ]);
    return NextResponse.json({
      displayName: user?.displayName ?? "",
      timezone: user?.timezone ?? "America/New_York",
      energyProfile: settings?.energyProfile ?? null,
      canvasIcalUrl: settings?.canvasIcalUrl ?? null,
      wakeTime: settings?.wakeTime ?? 7,
      sleepTime: settings?.sleepTime ?? 22,
      calendarStartHour: settings?.calendarStartHour ?? settings?.wakeTime ?? 7,
      calendarEndHour: settings?.calendarEndHour ?? settings?.sleepTime ?? 22,
      weekStartDay: settings?.weekStartDay ?? 1,
      notificationPrefs: settings?.notificationPrefs ?? null,
      personalityPrefs: settings?.personalityPrefs ?? null,
      calendarColors: settings?.calendarColors ?? null,
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
    if (body.wakeTime !== undefined) {
      const h = Number(body.wakeTime);
      if (Number.isInteger(h) && h >= 0 && h <= 23) data.wakeTime = h;
    }
    if (body.sleepTime !== undefined) {
      const h = Number(body.sleepTime);
      if (Number.isInteger(h) && h >= 0 && h <= 23) data.sleepTime = h;
    }
    if (body.calendarStartHour !== undefined) {
      const h = Number(body.calendarStartHour);
      if (Number.isInteger(h) && h >= 0 && h <= 23) data.calendarStartHour = h;
    }
    if (body.calendarEndHour !== undefined) {
      const h = Number(body.calendarEndHour);
      if (Number.isInteger(h) && h >= 0 && h <= 24) data.calendarEndHour = h;
    }
    if (body.weekStartDay !== undefined) {
      const d = Number(body.weekStartDay);
      if (d === 0 || d === 1) data.weekStartDay = d;
    }
    if (body.notificationPrefs !== undefined) {
      const prefs = body.notificationPrefs as NotificationPrefs;
      // Validate time format (HH:MM)
      const timeRegex = /^\d{2}:\d{2}$/;
      const assertivenessMode =
        typeof prefs.assertivenessMode === "string" &&
        VALID_ASSERTIVENESS_MODES.has(prefs.assertivenessMode)
          ? prefs.assertivenessMode
          : "balanced";
      if (
        typeof prefs.pushEnabled === "boolean" &&
        typeof prefs.emailMorningDigest === "boolean" &&
        typeof prefs.emailEveningDigest === "boolean" &&
        timeRegex.test(prefs.morningDigestTime) &&
        timeRegex.test(prefs.eveningDigestTime) &&
        timeRegex.test(prefs.quietHoursStart) &&
        timeRegex.test(prefs.quietHoursEnd)
      ) {
        data.notificationPrefs = {
          ...prefs,
          assertivenessMode,
          locationNotificationsEnabled:
            typeof prefs.locationNotificationsEnabled === "boolean"
              ? prefs.locationNotificationsEnabled
              : false,
        };
      }
    }

    if (body.personalityPrefs !== undefined) {
      const p = body.personalityPrefs as PersonalityPrefs;
      const validAxis = (v: unknown) => v === 0 || v === 1 || v === 2;
      if (validAxis(p.supportive) && validAxis(p.formality) && validAxis(p.language)) {
        data.personalityPrefs = p;
      }
    }

    if (body.calendarColors !== undefined) {
      const cc = body.calendarColors as CalendarColors;
      const validColor = (v: unknown): v is CalendarColorKey =>
        typeof v === "string" &&
        ["blue", "purple", "green", "orange", "red", "pink", "teal", "yellow"].includes(v);
      if (
        validColor(cc.school) &&
        validColor(cc.work) &&
        validColor(cc.personal) &&
        validColor(cc.errands) &&
        validColor(cc.health)
      ) {
        data.calendarColors = cc;
      }
    }

    if (body.displayName !== undefined && typeof body.displayName === "string" && body.displayName.trim().length > 0) {
      await updateUser(userId, { displayName: body.displayName.trim() });
    }

    if (body.timezone !== undefined && typeof body.timezone === "string" && body.timezone.length > 0) {
      await updateUser(userId, { timezone: body.timezone });
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
