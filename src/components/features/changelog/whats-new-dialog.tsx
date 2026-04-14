"use client";

import { useState, useEffect, useCallback } from "react";
import { Sparkles } from "lucide-react";
import { formatForDisplay, DISPLAY_DATE } from "@/lib/timezone";
import { useTimezone } from "@/hooks/use-timezone";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { changelog, getLatestWeek } from "@/lib/changelog";

const STORAGE_KEY = "cc-last-seen-changelog";

function getLastSeen(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

function setLastSeen(weekOf: string) {
  localStorage.setItem(STORAGE_KEY, weekOf);
}

function typeBadge(type: "added" | "fixed") {
  if (type === "added") {
    return (
      <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-emerald-600 text-white">
        New
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
      Fixed
    </Badge>
  );
}

function formatWeek(dateStr: string, timezone: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return formatForDisplay(d, timezone, { month: "short", day: "numeric", year: "numeric" });
}

export function WhatsNewDialog() {
  const timezone = useTimezone();
  const [open, setOpen] = useState(false);
  const [hasNew, setHasNew] = useState(false);

  useEffect(() => {
    const lastSeen = getLastSeen();
    const latest = getLatestWeek();
    if (latest && lastSeen !== latest) {
      setHasNew(true);
    }
  }, []);

  const handleOpen = useCallback((isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      const latest = getLatestWeek();
      if (latest) setLastSeen(latest);
      setHasNew(false);
    }
  }, []);

  if (changelog.length === 0) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="relative h-8 w-8"
        aria-label="What's new"
        onClick={() => handleOpen(true)}
      >
        <Sparkles className="h-4 w-4" />
        {hasNew && (
          <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-emerald-500">
            <span className="sr-only">New updates available</span>
          </span>
        )}
      </Button>

      <Dialog open={open} onOpenChange={handleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              What&apos;s New
            </DialogTitle>
            <DialogDescription>
              Recent updates to ControlledChaos
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto -mx-1 px-1 space-y-6">
            {changelog.map((week) => (
              <div key={week.weekOf}>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Week of {formatWeek(week.weekOf, timezone)}
                </p>
                <ul className="space-y-1.5">
                  {week.items.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="mt-0.5 shrink-0">{typeBadge(item.type)}</span>
                      <span>{item.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
