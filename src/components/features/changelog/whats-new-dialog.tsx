"use client";

import { useState, useEffect, useCallback } from "react";
import { Sparkles } from "lucide-react";
import { formatForDisplay } from "@/lib/timezone";
import { useTimezone } from "@/hooks/use-timezone";
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

export function useHasNewChangelog(): {
  hasNew: boolean;
  markSeen: () => void;
} {
  const [hasNew, setHasNew] = useState(false);

  useEffect(() => {
    const lastSeen = getLastSeen();
    const latest = getLatestWeek();
    if (latest && lastSeen !== latest) {
      setHasNew(true);
    }
  }, []);

  const markSeen = useCallback(() => {
    const latest = getLatestWeek();
    if (latest) setLastSeen(latest);
    setHasNew(false);
  }, []);

  return { hasNew, markSeen };
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

interface WhatsNewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WhatsNewDialog({ open, onOpenChange }: WhatsNewDialogProps) {
  const timezone = useTimezone();

  if (changelog.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
  );
}
