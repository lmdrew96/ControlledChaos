"use client";

import { Battery, BatteryLow, BatteryFull } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EnergyLevel } from "@/types";

const energyOptions: {
  value: EnergyLevel;
  label: string;
  icon: typeof Battery;
}[] = [
  { value: "low", label: "Low", icon: BatteryLow },
  { value: "medium", label: "Medium", icon: Battery },
  { value: "high", label: "High", icon: BatteryFull },
];

export function EnergyCheck({
  onSelect,
  onDismiss,
  selected,
}: {
  onSelect: (level: EnergyLevel) => void;
  onDismiss: () => void;
  selected?: EnergyLevel;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-muted-foreground">
        How&apos;s your energy?
      </span>
      <div className="flex items-center gap-2">
        {energyOptions.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => onSelect(value)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              selected === value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
        <button
          onClick={onDismiss}
          className="ml-1 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        >
          Use my usual
        </button>
      </div>
    </div>
  );
}
