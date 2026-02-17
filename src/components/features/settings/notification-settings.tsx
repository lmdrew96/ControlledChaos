"use client";

import { useState, useEffect } from "react";
import { Bell, Mail, Moon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { usePushSubscription } from "@/hooks/use-push-subscription";
import type { NotificationPrefs } from "@/types";

const DEFAULT_PREFS: NotificationPrefs = {
  pushEnabled: false,
  emailMorningDigest: false,
  emailEveningDigest: false,
  morningDigestTime: "07:30",
  eveningDigestTime: "21:00",
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
};

export function NotificationSettings() {
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [savedPrefs, setSavedPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTogglingPush, setIsTogglingPush] = useState(false);
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
          setPrefs(data.notificationPrefs);
          setSavedPrefs(data.notificationPrefs);
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
                  setPrefs(data.notificationPrefs);
                  setSavedPrefs(data.notificationPrefs);
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
      <div className="flex items-center justify-between">
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
                    update({ pushEnabled: true });
                    toast.success("Push notifications enabled!");
                  } else {
                    toast.error("Failed to enable push notifications. Check browser permissions.");
                  }
                } else {
                  await unsubscribePush();
                  update({ pushEnabled: false });
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
          className="ml-7"
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

      <div className="h-px bg-border" />

      {/* Email Digests */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Mail className="h-4 w-4 text-muted-foreground" />
          Email Digests
        </div>

        {/* Morning Digest */}
        <div className="flex items-center justify-between pl-6">
          <div>
            <p className="text-sm">Morning Digest</p>
            <p className="text-xs text-muted-foreground">
              Today&apos;s events, priorities, and upcoming deadlines
            </p>
          </div>
          <div className="flex items-center gap-3">
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
        <div className="flex items-center justify-between pl-6">
          <div>
            <p className="text-sm">Evening Digest</p>
            <p className="text-xs text-muted-foreground">
              Completed tasks, tomorrow&apos;s priorities, and a warm wrap-up
            </p>
          </div>
          <div className="flex items-center gap-3">
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

      {/* Quiet Hours */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Moon className="h-4 w-4 text-muted-foreground" />
          Quiet Hours
        </div>
        <p className="text-xs text-muted-foreground pl-6">
          No push notifications during these hours. Email digests are
          unaffected.
        </p>
        <div className="flex items-center gap-2 pl-6">
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
