"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

const options = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Choose how ControlledChaos looks on your device.
      </p>
      <div className="flex gap-2">
        {options.map((opt) => {
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
  );
}
