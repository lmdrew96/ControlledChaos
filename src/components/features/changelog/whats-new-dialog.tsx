"use client";

import { useCallback } from "react";
import { Plus, Sparkles, Wrench, Zap } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { CHANGELOG, LATEST_VERSION, formatEntryDate, type ChangeKind } from "@/lib/changelog";
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
  const hasNew = mounted && !!LATEST_VERSION && lastSeen !== LATEST_VERSION;

  const markSeen = useCallback(() => {
    if (LATEST_VERSION) setLastSeen(LATEST_VERSION);
  }, [setLastSeen]);

  return { hasNew, markSeen };
}

const KIND_META: Record<ChangeKind, { label: string; icon: typeof Plus }> = {
  added: { label: "New", icon: Plus },
  improved: { label: "Better", icon: Zap },
  fixed: { label: "Fixed", icon: Wrench },
};

function KindChip({ kind }: { kind: ChangeKind }) {
  const { label, icon: Icon } = KIND_META[kind];
  return (
    <span className="mt-0.5 flex h-5 shrink-0 items-center gap-1 rounded-full border border-border px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      <Icon className="h-2.5 w-2.5" aria-hidden />
      {label}
    </span>
  );
}

interface WhatsNewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WhatsNewDialog({ open, onOpenChange }: WhatsNewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            What&apos;s New
          </DialogTitle>
          <DialogDescription>
            Everything that&apos;s changed in ControlledChaos, newest first.
          </DialogDescription>
        </DialogHeader>

        {CHANGELOG.length === 0 ? (
          <p className="text-sm text-muted-foreground">No updates yet.</p>
        ) : (
          <ul className="-mx-1 max-h-[60vh] space-y-3 overflow-y-auto px-1">
            {CHANGELOG.map((entry, index) => (
              <li
                key={entry.version}
                className={
                  index === 0
                    ? "rounded-lg border border-primary/40 bg-primary/5 p-4"
                    : "rounded-lg border border-border p-4"
                }
              >
                <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <h4 className="text-sm font-semibold">{entry.title}</h4>
                  <span className="ml-auto text-xs text-muted-foreground">
                    v{entry.label ?? entry.version} · {formatEntryDate(entry.date)}
                  </span>
                </div>
                <ul className="space-y-2">
                  {entry.changes.map((change) => (
                    <li key={change.text} className="flex gap-2.5">
                      <KindChip kind={change.kind} />
                      <span className="text-sm leading-relaxed text-muted-foreground">
                        {change.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
