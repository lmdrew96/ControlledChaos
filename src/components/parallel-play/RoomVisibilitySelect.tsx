"use client";

import { Lock, FolderOpen, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

export type RoomVisibility = "none" | "category" | "title";

interface RoomVisibilitySelectProps {
  value: RoomVisibility;
  onChange: (value: RoomVisibility) => void;
  className?: string;
}

const OPTIONS: Array<{
  value: RoomVisibility;
  icon: typeof Lock;
  label: string;
  hint: string;
}> = [
  {
    value: "none",
    icon: Lock,
    label: "Presence",
    hint: "Just shows you're working — no task details",
  },
  {
    value: "category",
    icon: FolderOpen,
    label: "Category",
    hint: "Shows the category (e.g. \"School stuff\")",
  },
  {
    value: "title",
    icon: FileText,
    label: "Full title",
    hint: "Shows the actual task title",
  },
];

/**
 * Segmented control for the per-task room visibility tier. Used in the
 * task creation/edit form. Defaults to "category" upstream.
 */
export function RoomVisibilitySelect({
  value,
  onChange,
  className,
}: RoomVisibilitySelectProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-stretch gap-1 rounded-lg border border-border bg-muted/40 p-1">
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-pressed={active}
            >
              <Icon className="h-3.5 w-3.5" />
              {opt.label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {OPTIONS.find((o) => o.value === value)?.hint}
      </p>
    </div>
  );
}
