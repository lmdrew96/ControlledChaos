"use client";

import { useState } from "react";
import { Bike, Car, Footprints, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCalendarSettings } from "@/hooks/use-calendar-settings";
import { invalidateSettings } from "@/lib/settings-cache";
import type { TravelMode } from "@/types";

const OPTIONS: Array<{ mode: TravelMode; label: string; icon: typeof Car }> = [
  { mode: "driving", label: "Drive", icon: Car },
  { mode: "cycling", label: "Bike", icon: Bike },
  { mode: "walking", label: "Walk", icon: Footprints },
];

/**
 * The one commute input left: how the user usually travels. Times between
 * saved locations are computed from their pins in the background
 * (refreshCommuteTimes), and hops under 1 km are always timed as a walk.
 */
export function TravelModeSettings() {
  const { settings, isLoaded } = useCalendarSettings();
  const [saving, setSaving] = useState<TravelMode | null>(null);

  const choose = async (mode: TravelMode) => {
    if (mode === settings.travelMode || saving) return;
    setSaving(mode);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ travelMode: mode }),
      });
      if (!res.ok) throw new Error("Failed to save");
      invalidateSettings();
      toast.success("Commute times updated");
    } catch {
      toast.error("Couldn't save how you get around");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Travel times between your saved locations are worked out from the map
        pins. Places under 1 km apart always count as a walk.
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="How you usually get around">
        {OPTIONS.map(({ mode, label, icon: Icon }) => {
          const active = isLoaded && settings.travelMode === mode;
          return (
            <button
              key={mode}
              type="button"
              aria-pressed={active}
              disabled={!isLoaded || saving !== null}
              onClick={() => choose(mode)}
              className={`flex min-h-11 items-center gap-1.5 rounded-md border px-4 text-sm font-medium transition-colors disabled:opacity-60 ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-accent"
              }`}
            >
              {saving === mode ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Icon className="h-4 w-4" />
              )}
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
