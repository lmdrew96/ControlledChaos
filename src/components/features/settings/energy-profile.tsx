"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EnergyLevel, EnergyProfile } from "@/types";

const TIME_BLOCKS: {
  key: keyof EnergyProfile;
  label: string;
  desc: string;
}[] = [
  { key: "morning", label: "Morning", desc: "6am – 12pm" },
  { key: "afternoon", label: "Afternoon", desc: "12pm – 5pm" },
  { key: "evening", label: "Evening", desc: "5pm – 9pm" },
  { key: "night", label: "Night", desc: "9pm – 12am" },
];

const ENERGY_LEVELS: { value: EnergyLevel; label: string; emoji: string }[] = [
  { value: "low", label: "Low", emoji: "🔋" },
  { value: "medium", label: "Medium", emoji: "⚡" },
  { value: "high", label: "High", emoji: "🔥" },
];

const DEFAULT_PROFILE: EnergyProfile = {
  morning: "medium",
  afternoon: "medium",
  evening: "medium",
  night: "medium",
};

export function EnergyProfileEditor() {
  const [profile, setProfile] = useState<EnergyProfile>(DEFAULT_PROFILE);
  const [original, setOriginal] = useState<EnergyProfile>(DEFAULT_PROFILE);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const isDirty = JSON.stringify(profile) !== JSON.stringify(original);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          if (data.energyProfile) {
            setProfile(data.energyProfile);
            setOriginal(data.energyProfile);
          }
        }
      } catch {
        // Use defaults
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  async function handleSave() {
    setIsSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ energyProfile: profile }),
      });

      if (!res.ok) throw new Error("Failed to save");

      setOriginal(profile);
      toast.success("Energy profile updated!");
    } catch {
      toast.error("Failed to save energy profile");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        This helps recommend the right tasks at the right time.
      </p>

      <div className="space-y-3">
        {TIME_BLOCKS.map((block) => (
          <div key={block.key} className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{block.label}</p>
              <p className="text-xs text-muted-foreground">{block.desc}</p>
            </div>
            <div className="flex gap-1">
              {ENERGY_LEVELS.map((level) => (
                <button
                  key={level.value}
                  type="button"
                  onClick={() =>
                    setProfile((prev) => ({
                      ...prev,
                      [block.key]: level.value,
                    }))
                  }
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    profile[block.key] === level.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent"
                  )}
                >
                  {level.emoji} {level.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {isDirty && (
        <Button onClick={handleSave} disabled={isSaving} size="sm">
          {isSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Save Changes
        </Button>
      )}
    </div>
  );
}
