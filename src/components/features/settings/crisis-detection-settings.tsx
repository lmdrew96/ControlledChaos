"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import type { CrisisDetectionTier } from "@/types";

const TIER_OPTIONS: Array<{
  value: CrisisDetectionTier;
  label: string;
  description: string;
}> = [
  {
    value: "off",
    label: "Off",
    description: "I'll open Crisis Mode myself when I need it.",
  },
  {
    value: "watch",
    label: "Watch",
    description: "Show a badge when deadlines are colliding. No notifications.",
  },
  {
    value: "nudge",
    label: "Nudge",
    description: "Notify me when things are getting tight, and let me decide.",
  },
  {
    value: "auto_triage",
    label: "Auto-Triage",
    description:
      "Build a plan for me in the background and let me know it's ready.",
  },
];

export function CrisisDetectionSettings() {
  const [tier, setTier] = useState<CrisisDetectionTier>("nudge");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        if (data.crisisDetectionTier) {
          setTier(data.crisisDetectionTier);
        }
      })
      .catch(() => toast.error("Failed to load settings"))
      .finally(() => setIsLoading(false));
  }, []);

  const handleChange = async (value: CrisisDetectionTier) => {
    const previous = tier;
    setTier(value);
    setIsSaving(true);

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crisisDetectionTier: value }),
      });
      if (!res.ok) throw new Error();
      toast.success("Crisis detection updated");
    } catch {
      setTier(previous);
      toast.error("Failed to save setting");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Choose how ControlledChaos monitors for deadline collisions. When your
        available time doesn&apos;t cover your required work, it can alert you or
        build a triage plan automatically.
      </p>

      <RadioGroup
        value={tier}
        onValueChange={(v) => handleChange(v as CrisisDetectionTier)}
        className="space-y-3"
        disabled={isSaving}
      >
        {TIER_OPTIONS.map((option) => (
          <div
            key={option.value}
            className="flex items-start gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/50 has-[button[data-state=checked]]:border-primary has-[button[data-state=checked]]:bg-primary/5"
          >
            <RadioGroupItem value={option.value} id={option.value} className="mt-0.5" />
            <Label htmlFor={option.value} className="flex-1 cursor-pointer space-y-1">
              <span className="font-medium">{option.label}</span>
              <p className="text-sm text-muted-foreground font-normal">
                {option.description}
              </p>
            </Label>
          </div>
        ))}
      </RadioGroup>

      {isSaving && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" />
          Saving...
        </p>
      )}
    </div>
  );
}
