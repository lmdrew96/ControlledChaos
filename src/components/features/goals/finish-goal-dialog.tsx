"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface FinishGoalDialogProps {
  goal: { id: string; title: string } | null;
  /** Open steps left, so finishing early is said out loud rather than hidden. */
  openSteps?: number;
  onClose: () => void;
  onFinished: () => void;
}

/** "Call it done" — completes a goal with an optional reflection note. */
export function FinishGoalDialog({ goal, openSteps = 0, onClose, onFinished }: FinishGoalDialogProps) {
  const [reflection, setReflection] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (goal) setReflection("");
  }, [goal]);

  async function handleFinish() {
    if (!goal) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/goals/${goal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed", reflection: reflection.trim() || null }),
      });
      if (!res.ok) throw new Error(`PATCH /api/goals/${goal.id} ${res.status}`);
      toast.success(`“${goal.title}” is done.`);
      onFinished();
      onClose();
    } catch (error) {
      console.error("Failed to finish goal:", error);
      toast.error("Couldn't mark that goal done. Try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={!!goal} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Call it done?</DialogTitle>
          <DialogDescription>
            {goal?.title}
            {openSteps > 0 &&
              ` — ${openSteps} open step${openSteps === 1 ? "" : "s"} will stay on your task list.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="goal-reflection">How did it go?</Label>
          <Textarea
            id="goal-reflection"
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            placeholder="What worked, what you'd skip next time, how it feels to be done. Optional."
            className="min-h-[90px] resize-none"
            maxLength={4000}
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Not yet
          </Button>
          <Button size="sm" onClick={handleFinish} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Call it done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
