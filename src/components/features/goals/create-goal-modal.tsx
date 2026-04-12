"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Goal } from "@/types";

interface CreateGoalModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editGoal?: Goal | null;
}

interface FormState {
  title: string;
  description: string;
  targetDate: string;
}

const DEFAULT_FORM: FormState = {
  title: "",
  description: "",
  targetDate: "",
};

export function CreateGoalModal({ open, onClose, onSaved, editGoal }: CreateGoalModalProps) {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const isEdit = !!editGoal;

  useEffect(() => {
    if (open && editGoal) {
      setForm({
        title: editGoal.title,
        description: editGoal.description ?? "",
        targetDate: editGoal.targetDate
          ? new Date(editGoal.targetDate).toISOString().slice(0, 10)
          : "",
      });
    } else if (open) {
      setForm(DEFAULT_FORM);
    }
  }, [open, editGoal]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description || null,
        targetDate: form.targetDate || null,
      };

      const url = isEdit ? `/api/goals/${editGoal.id}` : "/api/goals";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Failed to save goal");

      toast.success(isEdit ? "Goal updated" : "Goal created");
      onSaved();
      onClose();
    } catch {
      toast.error(isEdit ? "Failed to update goal" : "Failed to create goal");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Goal" : "New Goal"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update your goal details."
              : "Set a goal to group and track related tasks."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="goal-title">Title</Label>
            <Input
              id="goal-title"
              value={form.title}
              onChange={(e) => updateField("title", e.target.value)}
              placeholder="What are you working toward?"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="goal-description">Description</Label>
            <Textarea
              id="goal-description"
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              placeholder="Why does this matter? What does done look like?"
              className="min-h-[80px] resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="goal-target-date">Target Date</Label>
            <Input
              id="goal-target-date"
              type="date"
              value={form.targetDate}
              onChange={(e) => updateField("targetDate", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Optional — no pressure, just a north star.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving || !form.title.trim()}>
            {isSaving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            {isEdit ? "Save Changes" : "Create Goal"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
