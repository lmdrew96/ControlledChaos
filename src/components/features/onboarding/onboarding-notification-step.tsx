"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Bell, Sunrise, Moon } from "lucide-react";

interface Props {
  pushEnabled: boolean;
  onPushChange: (v: boolean) => void;
  morningDigest: boolean;
  onMorningChange: (v: boolean) => void;
  eveningDigest: boolean;
  onEveningChange: (v: boolean) => void;
}

export function OnboardingNotificationStep({
  pushEnabled,
  onPushChange,
  morningDigest,
  onMorningChange,
  eveningDigest,
  onEveningChange,
}: Props) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Choose how you want to be reminded. You can fine-tune all of this later in Settings.
      </p>

      <div className="space-y-4">
        {/* Push notifications */}
        <div className="flex items-center justify-between rounded-lg border border-border p-4">
          <div className="flex items-center gap-3">
            <Bell className="h-5 w-5 text-muted-foreground" />
            <div>
              <Label className="text-sm font-medium">Push Notifications</Label>
              <p className="text-xs text-muted-foreground">
                Deadline warnings, task reminders, check-ins
              </p>
            </div>
          </div>
          <Switch checked={pushEnabled} onCheckedChange={onPushChange} />
        </div>

        {/* Morning digest */}
        <div className="flex items-center justify-between rounded-lg border border-border p-4">
          <div className="flex items-center gap-3">
            <Sunrise className="h-5 w-5 text-muted-foreground" />
            <div>
              <Label className="text-sm font-medium">Morning Digest</Label>
              <p className="text-xs text-muted-foreground">
                Daily email with your game plan
              </p>
            </div>
          </div>
          <Switch checked={morningDigest} onCheckedChange={onMorningChange} />
        </div>

        {/* Evening digest */}
        <div className="flex items-center justify-between rounded-lg border border-border p-4">
          <div className="flex items-center gap-3">
            <Moon className="h-5 w-5 text-muted-foreground" />
            <div>
              <Label className="text-sm font-medium">Evening Wrap-Up</Label>
              <p className="text-xs text-muted-foreground">
                Daily email reflecting on what you accomplished
              </p>
            </div>
          </div>
          <Switch checked={eveningDigest} onCheckedChange={onEveningChange} />
        </div>
      </div>
    </div>
  );
}
