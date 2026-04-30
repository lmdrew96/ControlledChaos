"use client";

import { cn } from "@/lib/utils";
import type { RecapKind } from "@/types";
import { RECAP_KINDS, RECAP_KIND_META } from "./recap-constants";

interface RecapFilterPillsProps {
  /** Currently visible kinds. Undefined = all. */
  activeKinds: RecapKind[];
  onChange: (kinds: RecapKind[]) => void;
}

/**
 * Horizontal pill bar for toggling streams on/off. On mobile the row
 * scrolls horizontally — `touch-action: pan-x` prevents chip taps from
 * being fired by a scroll gesture (same fix we applied to MomentsBar).
 */
export function RecapFilterPills({
  activeKinds,
  onChange,
}: RecapFilterPillsProps) {
  const toggle = (kind: RecapKind) => {
    if (activeKinds.includes(kind)) {
      // Don't allow turning the last pill off — empty filter is confusing.
      // Restore "all" instead.
      const next = activeKinds.filter((k) => k !== kind);
      onChange(next.length === 0 ? [...RECAP_KINDS] : next);
    } else {
      onChange([...activeKinds, kind]);
    }
  };

  return (
    <div
      className="flex items-center gap-2 overflow-x-auto [touch-action:pan-x]"
      role="toolbar"
      aria-label="Filter recap by entry type"
    >
      {RECAP_KINDS.map((kind) => {
        const meta = RECAP_KIND_META[kind];
        const Icon = meta.icon;
        const active = activeKinds.includes(kind);
        return (
          <button
            key={kind}
            type="button"
            onClick={() => toggle(kind)}
            aria-pressed={active}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}
