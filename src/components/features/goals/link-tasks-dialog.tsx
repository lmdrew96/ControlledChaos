"use client";

import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { Task } from "@/types";

interface LinkTasksDialogProps {
  open: boolean;
  goalId: string;
  /** Open tasks not linked to any goal yet. */
  tasks: Task[];
  onClose: () => void;
  onLinked: () => void;
}

/** Pick existing open tasks and make them steps of this goal. */
export function LinkTasksDialog({ open, goalId, tasks, onClose, onLinked }: LinkTasksDialogProps) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  // Reset on the way out, so the next open starts clean.
  function close() {
    setQuery("");
    setPicked(new Set());
    onClose();
  }

  const q = query.trim().toLowerCase();
  const shown = q ? tasks.filter((t) => t.title.toLowerCase().includes(q)) : tasks;

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleLink() {
    setIsSaving(true);
    const ids = [...picked];
    const results = await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/tasks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ goalId }),
        }).then((res) => {
          if (!res.ok) throw new Error(`PATCH /api/tasks/${id} ${res.status}`);
        })
      )
    );
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      console.error("Some tasks failed to link:", failed);
      toast.error(`${ids.length - failed.length} of ${ids.length} linked — try the rest again.`);
    } else {
      toast.success(`Linked ${ids.length} task${ids.length === 1 ? "" : "s"}.`);
      close();
    }
    setIsSaving(false);
    onLinked();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Link tasks to this goal</DialogTitle>
          <DialogDescription>Open tasks that aren&apos;t part of a goal yet.</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks…"
            className="pl-8"
            aria-label="Search tasks"
          />
        </div>

        <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
          {shown.map((t) => (
            <li key={t.id} className="flex items-start gap-3 rounded-md px-2 py-1.5 hover:bg-accent/40">
              <Checkbox
                id={`link-${t.id}`}
                checked={picked.has(t.id)}
                onCheckedChange={() => toggle(t.id)}
                className="mt-0.5"
              />
              <label htmlFor={`link-${t.id}`} className="min-w-0 flex-1 cursor-pointer text-sm break-words">
                {t.title}
              </label>
            </li>
          ))}
          {shown.length === 0 && (
            <li className="py-6 text-center text-sm text-muted-foreground">No matching tasks.</li>
          )}
        </ul>

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="ghost" size="sm" onClick={close}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleLink} disabled={isSaving || picked.size === 0}>
            {isSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Link {picked.size > 0 ? picked.size : ""} task{picked.size === 1 ? "" : "s"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
