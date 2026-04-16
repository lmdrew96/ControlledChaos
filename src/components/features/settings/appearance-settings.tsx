"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Sun, Moon, Monitor, PartyPopper, BarChart3, Rows3, Rows4 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CelebrationLevel } from "@/types";

const themeOptions = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

const celebrationOptions: Array<{
  value: CelebrationLevel;
  label: string;
  description: string;
}> = [
  { value: "none", label: "None", description: "No confetti or animations on task completion." },
  { value: "subtle", label: "Subtle", description: "A small burst — acknowledges without overwhelming." },
  { value: "full", label: "Full", description: "The full confetti detonation. You earned it." },
];

const momentumOptions: Array<{
  value: "motivational" | "neutral";
  label: string;
  description: string;
}> = [
  { value: "neutral", label: "Neutral", description: "Just the count — \"3 done today.\" No performance framing." },
  { value: "motivational", label: "Motivational", description: "Encouraging tier messages like \"On fire!\" as you complete more." },
];

type Density = "compact" | "relaxed";

const densityOptions: Array<{
  value: Density;
  label: string;
  icon: typeof Rows3;
  description: string;
}> = [
  { value: "compact", label: "Compact", icon: Rows4, description: "Tighter spacing — more content visible at once." },
  { value: "relaxed", label: "Relaxed", icon: Rows3, description: "More breathing room between elements." },
];

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [celebrationLevel, setCelebrationLevel] = useState<CelebrationLevel>("full");
  const [momentumStyle, setMomentumStyle] = useState<"motivational" | "neutral">("neutral");
  const [density, setDensity] = useState<Density>("relaxed");

  useEffect(() => {
    setMounted(true);
    // Read from localStorage (synced from settings save)
    const stored = localStorage.getItem("cc-celebration-level") as CelebrationLevel | null;
    if (stored) setCelebrationLevel(stored);
    const storedMomentum = localStorage.getItem("cc-momentum-style") as "motivational" | "neutral" | null;
    if (storedMomentum) setMomentumStyle(storedMomentum);
    const storedDensity = localStorage.getItem("cc-density") as Density | null;
    if (storedDensity) setDensity(storedDensity);
  }, []);

  function updateCelebration(level: CelebrationLevel) {
    setCelebrationLevel(level);
    localStorage.setItem("cc-celebration-level", level);
  }

  function updateMomentum(style: "motivational" | "neutral") {
    setMomentumStyle(style);
    localStorage.setItem("cc-momentum-style", style);
  }

  function updateDensity(d: Density) {
    setDensity(d);
    localStorage.setItem("cc-density", d);
    // Apply/remove the class on the document element so CSS can respond globally
    document.documentElement.classList.toggle("density-compact", d === "compact");
  }

  if (!mounted) return null;

  return (
    <div className="space-y-6">
      {/* Theme */}
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Choose how ControlledChaos looks on your device.
        </p>
        <div className="flex gap-2">
          {themeOptions.map((opt) => {
            const active = theme === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setTheme(opt.value)}
                className={cn(
                  "flex flex-1 flex-col items-center gap-2 rounded-lg border px-4 py-3 text-sm transition-colors",
                  active
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border text-muted-foreground hover:bg-accent/50"
                )}
              >
                <opt.icon className="h-5 w-5" />
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-px bg-border" />

      {/* Celebration Level */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <PartyPopper className="h-4 w-4 text-muted-foreground" />
          Celebration Level
        </div>
        <p className="text-xs text-muted-foreground">
          Controls confetti and animations when you complete a task.
        </p>
        <div className="grid gap-2">
          {celebrationOptions.map((opt) => {
            const selected = celebrationLevel === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => updateCelebration(opt.value)}
                className={cn(
                  "rounded-md border p-3 text-left transition-colors",
                  selected
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-accent"
                )}
              >
                <p className="text-sm font-medium">{opt.label}</p>
                <p className="text-xs text-muted-foreground">{opt.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-px bg-border" />

      {/* Momentum Style */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          Momentum Style
        </div>
        <p className="text-xs text-muted-foreground">
          Choose how your daily progress is framed on the dashboard.
        </p>
        <div className="grid gap-2">
          {momentumOptions.map((opt) => {
            const selected = momentumStyle === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => updateMomentum(opt.value)}
                className={cn(
                  "rounded-md border p-3 text-left transition-colors",
                  selected
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-accent"
                )}
              >
                <p className="text-sm font-medium">{opt.label}</p>
                <p className="text-xs text-muted-foreground">{opt.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-px bg-border" />

      {/* Visual Density */}
      <div className="space-y-3">
        <div className="text-sm font-medium">Visual Density</div>
        <p className="text-xs text-muted-foreground">
          Adjust spacing throughout the app. Compact shows more at a glance; relaxed gives more breathing room.
        </p>
        <div className="flex gap-2">
          {densityOptions.map((opt) => {
            const active = density === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => updateDensity(opt.value)}
                className={cn(
                  "flex flex-1 flex-col items-center gap-2 rounded-lg border px-4 py-3 text-sm transition-colors",
                  active
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border text-muted-foreground hover:bg-accent/50"
                )}
              >
                <opt.icon className="h-5 w-5" />
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
