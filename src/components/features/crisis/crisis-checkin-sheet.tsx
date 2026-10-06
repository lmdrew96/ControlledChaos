"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface CrisisCheckInSheetProps {
  open: boolean;
  taskNames: string[];
  /** Resolves once the server has recorded the check-in; throws on failure. */
  onConfirmEngaged: () => Promise<void>;
  onShowPlan: () => void;
  onClose: () => void;
}

/**
 * Where a crisis push lands: "Already working on this?"
 *
 * Opening it writes nothing. Only "Yes, I'm on it" marks the crisis engaged,
 * because the app can't see work done off the app and must not guess.
 */
export function CrisisCheckInSheet({
  open,
  taskNames,
  onConfirmEngaged,
  onShowPlan,
  onClose,
}: CrisisCheckInSheetProps): React.ReactElement {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function handleYes() {
    setSaving(true);
    setError(false);
    try {
      await onConfirmEngaged();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        <SheetHeader className="pb-0">
          <SheetTitle className="text-xl">Already working on this?</SheetTitle>
          <SheetDescription>
            {taskNames.length > 0 ? taskNames.join(" and ") : "Your rescue plan"}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4">
          <Button size="lg" className="h-14 text-base" onClick={handleYes} disabled={saving}>
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : "Yes, I'm on it"}
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-14 text-base"
            onClick={onShowPlan}
            disabled={saving}
          >
            Not yet, show me the plan
          </Button>
          {error && (
            <p className="text-center text-sm text-destructive">
              Couldn&apos;t save that. Try again?
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
