"use client";

import { useCallback } from "react";
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
import { useStoredPreference } from "@/hooks/use-stored-preference";
import { useIsMounted } from "@/hooks/use-is-mounted";

const STORAGE_KEY = "cc-last-seen-changelog";

export function useHasNewChangelog(): {
  hasNew: boolean;
  markSeen: () => void;
} {
  // Gate on `mounted`: the "" fallback can't distinguish "never seen" from
  // "not hydrated yet", and only the first should light up the badge.
  const mounted = useIsMounted();
  const [lastSeen, setLastSeen] = useStoredPreference<string>(STORAGE_KEY, "");
  const latest = getLatestWeek();
  const hasNew = mounted && !!latest && lastSeen !== latest;

  const markSeen = useCallback(() => {
    if (latest) setLastSeen(latest);
  }, [latest, setLastSeen]);

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

        {changelog.length === 0 ? (
          <p className="text-sm text-muted-foreground">No updates yet.</p>
        ) : (
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
        )}
      </DialogContent>
    </Dialog>
  );
}
