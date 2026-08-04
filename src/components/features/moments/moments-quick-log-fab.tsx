"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { MomentDetailSheet } from "./moment-detail-sheet";
import { MomentChip, useMomentLogging } from "./moments-bar";
import { MOMENT_TYPES } from "./moment-constants";

/**
 * Always-visible quick-capture entry point. Kept small and fixed-position
 * (rather than a persistent bar) so logging a tough moment or energy crash
 * — the two types crisis detection reads — stays one tap away from every
 * screen, even though the full Moments experience now lives in Recap.
 */
export function MomentsQuickLogFab() {
  const logging = useMomentLogging();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="fixed bottom-20 right-4 z-40 flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-4 py-3 text-sm font-medium text-foreground shadow-lg transition-transform active:scale-95 md:bottom-6 md:right-6"
            aria-label="Log a moment"
          >
            <Sparkles className="h-4 w-4 text-[#DFA649]" aria-hidden />
            <span className="hidden sm:inline">Log</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          side="top"
          className="w-64"
          aria-label="Log a moment"
        >
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Log a moment
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {MOMENT_TYPES.map((type) => (
              <MomentChip
                key={type}
                type={type}
                onTap={() => {
                  logging.logQuick(type);
                  setOpen(false);
                }}
                onLongPress={() => {
                  setOpen(false);
                  logging.openDetail(type);
                }}
                layout="grid"
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <MomentDetailSheet
        open={logging.detailOpen}
        onOpenChange={logging.setDetailOpen}
        type={logging.detailType}
        onSave={logging.handleDetailSave}
      />
    </>
  );
}
