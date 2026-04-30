"use client";

import { useState, useEffect } from "react";
import { Bell, Mail, Moon, MapPin, Loader2, Clock, Plus, X, Sun } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { usePushSubscription } from "@/hooks/use-push-subscription";
import {
  DEFAULT_REMINDER_INTERVALS,
  type DailyCheckInTime,
  type NotificationAssertiveness,
  type NotificationPrefs,
} from "@/types";

const DEFAULT_PREFS: NotificationPrefs = {
  pushEnabled: false,
  locationNotificationsEnabled: false,
  emailMorningDigest: false,
  emailEveningDigest: false,
  morningDigestTime: "07:30",
  eveningDigestTime: "21:00",
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
  assertivenessMode: "balanced",
  friendNudgesEnabled: true,
  mutedFriendIds: [],
  celebrationLevel: "full",
  momentumStyle: "neutral",
  reminderIntervals: DEFAULT_REMINDER_INTERVALS,
  dailyCheckInEnabled: true,
  dailyCheckInTime: "morning",
};

const CHECK_IN_TIME_OPTIONS: Array<{
  value: DailyCheckInTime;
  label: string;
  hint: string;
}> = [
  { value: "morning", label: "Morning", hint: "11am – 3pm" },
  { value: "afternoon", label: "Afternoon", hint: "3pm – 7pm" },
  { value: "evening", label: "Evening", hint: "After 7pm" },
];

type ReminderUnit = "minutes" | "hours" | "days";

function formatIntervalLabel(minutes: number): string {
  if (minutes % (60 * 24) === 0) {
    const d = minutes / (60 * 24);
    return d === 1 ? "1 day" : `${d} days`;
  }
  if (minutes % 60 === 0) {
    const h = minutes / 60;
    return h === 1 ? "1 hour" : `${h} hours`;
  }
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

function unitToMinutes(value: number, unit: ReminderUnit): number {
  if (unit === "hours") return value * 60;
  if (unit === "days") return value * 60 * 24;
  return value;
}

function sortIntervalsDesc(list: number[]): number[] {
  return Array.from(new Set(list.filter((n) => Number.isFinite(n) && n > 0))).sort(
    (a, b) => b - a
  );
}

const ASSERTIVENESS_OPTIONS: Array<{
  value: NotificationAssertiveness;
  label: string;
  description: string;
}> = [
  {
    value: "gentle",
    label: "Gentle",
    description:
      "Up to 4 pushes/day. Skips departure nudges and missed-task follow-ups. Softer language.",
  },
  {
    value: "balanced",
    label: "Balanced",
    description:
      "Up to 6 pushes/day. Departure nudges included. Neutral language.",
  },
  {
    value: "assertive",
    label: "Assertive",
    description:
      "Up to 8 pushes/day. Follow-ups when scheduled tasks slip past their start time. More direct language.",
  },
];

function normalizePrefs(raw: Partial<NotificationPrefs> | null | undefined): NotificationPrefs {
  const rawIntervals = raw?.reminderIntervals;
  // null/undefined = use defaults. Empty array = user explicitly opted out.
  const intervals = Array.isArray(rawIntervals)
    ? sortIntervalsDesc(rawIntervals)
    : DEFAULT_REMINDER_INTERVALS;
  const checkInTime: DailyCheckInTime =
    raw?.dailyCheckInTime === "morning" ||
    raw?.dailyCheckInTime === "afternoon" ||
    raw?.dailyCheckInTime === "evening"
      ? raw.dailyCheckInTime
      : "morning";
  return {
    ...DEFAULT_PREFS,
    ...raw,
    assertivenessMode:
      raw?.assertivenessMode === "gentle" ||
      raw?.assertivenessMode === "balanced" ||
      raw?.assertivenessMode === "assertive"
        ? raw.assertivenessMode
        : "balanced",
    friendNudgesEnabled: raw?.friendNudgesEnabled ?? true,
    mutedFriendIds: raw?.mutedFriendIds ?? [],
    reminderIntervals: intervals,
    dailyCheckInEnabled:
      typeof raw?.dailyCheckInEnabled === "boolean" ? raw.dailyCheckInEnabled : true,
    dailyCheckInTime: checkInTime,
  };
}

export function NotificationSettings() {
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [savedPrefs, setSavedPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTogglingPush, setIsTogglingPush] = useState(false);
  const [newIntervalValue, setNewIntervalValue] = useState("");
  const [newIntervalUnit, setNewIntervalUnit] = useState<ReminderUnit>("minutes");
  const {
    isSupported: pushSupported,
    isSubscribed: pushSubscribed,
    subscribe: subscribePush,
    unsubscribe: unsubscribePush,
  } = usePushSubscription();

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        if (data?.notificationPrefs) {
          const normalized = normalizePrefs(data.notificationPrefs);
          setPrefs(normalized);
          setSavedPrefs(normalized);
        }
      })
      .catch(() => setLoadError(true))
      .finally(() => setIsLoading(false));
  }, []);

  const isDirty = JSON.stringify(prefs) !== JSON.stringify(savedPrefs);

  function update(partial: Partial<NotificationPrefs>) {
    setPrefs((prev) => ({ ...prev, ...partial }));
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationPrefs: prefs }),
      });
      if (!res.ok) throw new Error();
      setSavedPrefs(prefs);
      toast.success("Notification preferences saved!");
    } catch {
      toast.error("Failed to save notification preferences");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading notification preferences...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="py-4 text-center text-sm text-muted-foreground">
        <p>Failed to load notification preferences.</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => {
            setLoadError(false);
            setIsLoading(true);
            fetch("/api/settings")
              .then((r) => {
                if (!r.ok) throw new Error();
                return r.json();
              })
              .then((data) => {
                if (data?.notificationPrefs) {
                  const normalized = normalizePrefs(data.notificationPrefs);
                  setPrefs(normalized);
                  setSavedPrefs(normalized);
                }
              })
              .catch(() => setLoadError(true))
              .finally(() => setIsLoading(false));
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Push Notifications */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Bell className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Push Notifications</p>
            <p className="text-xs text-muted-foreground">
              {!pushSupported
                ? "Not supported in this browser"
                : "Deadline reminders, scheduled task alerts, and check-ins"}
            </p>
          </div>
        </div>
        {isTogglingPush ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <Switch
            checked={prefs.pushEnabled && pushSubscribed}
            disabled={!pushSupported}
            onCheckedChange={async (checked) => {
              setIsTogglingPush(true);
              try {
                if (checked) {
                  const ok = await subscribePush();
                  if (ok) {
                    // Immediately persist pushEnabled: true — don't wait for Save button
                    const newPrefs = { ...prefs, pushEnabled: true };
                    const res = await fetch("/api/settings", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ notificationPrefs: newPrefs }),
                    });
                    if (res.ok) {
                      setPrefs(newPrefs);
                      setSavedPrefs(newPrefs);
                      toast.success("Push notifications enabled!");
                    } else {
                      toast.error("Subscribed but failed to save preference. Try again.");
                    }
                  } else {
                    toast.error("Failed to enable push notifications. Check browser permissions.");
                  }
                } else {
                  await unsubscribePush();
                  // Immediately persist pushEnabled: false
                  const newPrefs = { ...prefs, pushEnabled: false };
                  await fetch("/api/settings", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ notificationPrefs: newPrefs }),
                  });
                  setPrefs(newPrefs);
                  setSavedPrefs(newPrefs);
                  toast.success("Push notifications disabled.");
                }
              } finally {
                setIsTogglingPush(false);
              }
            }}
          />
        )}
      </div>

      {prefs.pushEnabled && pushSubscribed && (
        <Button
          variant="outline"
          size="sm"
          className="w-full sm:ml-7 sm:w-auto"
          onClick={async () => {
            const res = await fetch("/api/notifications/test", { method: "POST" });
            const data = await res.json();
            if (data.success) {
              toast.success("Test notification sent!");
            } else {
              toast.error(data.message || "Failed to send test notification");
            }
          }}
        >
          Send Test Notification
        </Button>
      )}

      {/* Location Notifications */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Location Notifications</p>
            <p className="text-xs text-muted-foreground">
              Get reminders when you arrive at places where you have tasks
            </p>
          </div>
        </div>
        <Switch
          checked={prefs.locationNotificationsEnabled}
          disabled={!prefs.pushEnabled || !pushSubscribed}
          onCheckedChange={async (checked) => {
            if (checked) {
              // Probe geolocation permission
              try {
                await new Promise<void>((resolve, reject) => {
                  navigator.geolocation.getCurrentPosition(
                    () => resolve(),
                    (err) => reject(err),
                    { enableHighAccuracy: false, timeout: 10000 }
                  );
                });
                const newPrefs = { ...prefs, locationNotificationsEnabled: true };
                const res = await fetch("/api/settings", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ notificationPrefs: newPrefs }),
                });
                if (res.ok) {
                  setPrefs(newPrefs);
                  setSavedPrefs(newPrefs);
                  toast.success("Location notifications enabled!");
                }
              } catch {
                toast.error(
                  "Location access was denied. Enable it in your browser settings to use this feature."
                );
              }
            } else {
              const newPrefs = { ...prefs, locationNotificationsEnabled: false };
              await fetch("/api/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ notificationPrefs: newPrefs }),
              });
              setPrefs(newPrefs);
              setSavedPrefs(newPrefs);
              toast.success("Location notifications disabled.");
            }
          }}
        />
      </div>

      <div className="h-px bg-border" />

      {/* Email Digests */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Mail className="h-4 w-4 text-muted-foreground" />
          Email Digests
        </div>

        {/* Morning Digest */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:pl-6">
          <div>
            <p className="text-sm">Morning Digest</p>
            <p className="text-xs text-muted-foreground">
              Today&apos;s events, priorities, and upcoming deadlines
            </p>
          </div>
          <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-normal">
            <input
              type="time"
              value={prefs.morningDigestTime}
              onChange={(e) => update({ morningDigestTime: e.target.value })}
              disabled={!prefs.emailMorningDigest}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs disabled:opacity-50"
            />
            <Switch
              checked={prefs.emailMorningDigest}
              onCheckedChange={(checked) =>
                update({ emailMorningDigest: checked })
              }
            />
          </div>
        </div>

        {/* Evening Digest */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:pl-6">
          <div>
            <p className="text-sm">Evening Digest</p>
            <p className="text-xs text-muted-foreground">
              Completed tasks, tomorrow&apos;s priorities, and a warm wrap-up
            </p>
          </div>
          <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-normal">
            <input
              type="time"
              value={prefs.eveningDigestTime}
              onChange={(e) => update({ eveningDigestTime: e.target.value })}
              disabled={!prefs.emailEveningDigest}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs disabled:opacity-50"
            />
            <Switch
              checked={prefs.emailEveningDigest}
              onCheckedChange={(checked) =>
                update({ emailEveningDigest: checked })
              }
            />
          </div>
        </div>
      </div>

      <div className="h-px bg-border" />

      {/* Push Style */}
      <div className="space-y-3">
        <div className="text-sm font-medium">Push Style</div>
        <p className="text-xs text-muted-foreground sm:pl-6">
          Choose how firm reminders should feel when tasks are ignored.
        </p>
        <div className="grid gap-2 sm:pl-6">
          {ASSERTIVENESS_OPTIONS.map((option) => {
            const selected = prefs.assertivenessMode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => update({ assertivenessMode: option.value })}
                className={`rounded-md border p-3 text-left transition-colors ${
                  selected
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-accent"
                }`}
              >
                <p className="text-sm font-medium">{option.label}</p>
                <p className="text-xs text-muted-foreground">{option.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Daily Check-in */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sun className="h-4 w-4 text-muted-foreground" />
            Daily Check-in
          </div>
          <Switch
            checked={prefs.dailyCheckInEnabled ?? true}
            onCheckedChange={(checked) => update({ dailyCheckInEnabled: checked })}
          />
        </div>
        <p className="text-xs text-muted-foreground sm:pl-6">
          At most one nudge per day. Morning and afternoon only fire if you&apos;ve been idle;
          evening fires as a gentle wrap-up regardless.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:pl-6">
          {CHECK_IN_TIME_OPTIONS.map((option) => {
            const selected = (prefs.dailyCheckInTime ?? "morning") === option.value;
            const disabled = !(prefs.dailyCheckInEnabled ?? true);
            return (
              <button
                key={option.value}
                type="button"
                disabled={disabled}
                onClick={() => update({ dailyCheckInTime: option.value })}
                className={`rounded-md border p-2 text-center transition-colors ${
                  selected
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-accent"
                } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
              >
                <p className="text-sm font-medium">{option.label}</p>
                <p className="text-[10px] text-muted-foreground">{option.hint}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Reminder Times */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Clock className="h-4 w-4 text-muted-foreground" />
          Reminder Times
        </div>
        <p className="text-xs text-muted-foreground sm:pl-6">
          When to get reminders before events and deadlines. Defaults to 1 day, 1 hour,
          and 10 minutes before.
        </p>
        <div className="flex flex-wrap gap-2 sm:pl-6">
          {(prefs.reminderIntervals ?? []).map((minutes) => (
            <span
              key={minutes}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-accent/40 px-3 py-1 text-xs"
            >
              {formatIntervalLabel(minutes)}
              <button
                type="button"
                aria-label={`Remove ${formatIntervalLabel(minutes)} reminder`}
                onClick={() =>
                  update({
                    reminderIntervals: (prefs.reminderIntervals ?? []).filter(
                      (m) => m !== minutes
                    ),
                  })
                }
                className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {(prefs.reminderIntervals ?? []).length === 0 && (
            <span className="text-xs italic text-muted-foreground">
              No reminders configured.
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:pl-6">
          <input
            type="number"
            min={1}
            placeholder="Amount"
            value={newIntervalValue}
            onChange={(e) => setNewIntervalValue(e.target.value)}
            className="h-8 w-24 rounded-md border border-input bg-background px-2 text-xs"
          />
          <select
            value={newIntervalUnit}
            onChange={(e) => setNewIntervalUnit(e.target.value as ReminderUnit)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="minutes">minutes</option>
            <option value="hours">hours</option>
            <option value="days">days</option>
          </select>
          <span className="text-xs text-muted-foreground">before</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              const n = Number(newIntervalValue);
              if (!Number.isFinite(n) || n <= 0) {
                toast.error("Enter a positive number.");
                return;
              }
              const minutes = unitToMinutes(Math.floor(n), newIntervalUnit);
              const next = sortIntervalsDesc([
                ...(prefs.reminderIntervals ?? []),
                minutes,
              ]);
              update({ reminderIntervals: next });
              setNewIntervalValue("");
            }}
          >
            <Plus className="h-3 w-3" />
            Add
          </Button>
        </div>
      </div>

      {/* Quiet Hours */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Moon className="h-4 w-4 text-muted-foreground" />
          Quiet Hours
        </div>
        <p className="text-xs text-muted-foreground sm:pl-6">
          No push notifications during these hours. Email digests are
          unaffected.
        </p>
        <div className="flex flex-wrap items-center gap-2 sm:pl-6">
          <input
            type="time"
            value={prefs.quietHoursStart}
            onChange={(e) => update({ quietHoursStart: e.target.value })}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <input
            type="time"
            value={prefs.quietHoursEnd}
            onChange={(e) => update({ quietHoursEnd: e.target.value })}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          />
        </div>
      </div>

      {/* Save Button */}
      {isDirty && (
        <Button onClick={handleSave} disabled={isSaving} size="sm">
          {isSaving ? "Saving..." : "Save Preferences"}
        </Button>
      )}
    </div>
  );
}
