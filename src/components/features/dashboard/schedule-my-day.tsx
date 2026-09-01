"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CalendarDays,
  Loader2,
  Check,
  ArrowRight,
  Sparkles,
  RotateCcw,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatForDisplay, DISPLAY_TIME } from "@/lib/timezone";
import { useTimezone } from "@/hooks/use-timezone";
import type { PlanProposal, PlanProposalResult } from "@/types";

type RowState = "accepted" | "rejected";

interface Row extends PlanProposal {
  state: RowState;
  /** True while this single row is being re-proposed. */
  retrying: boolean;
}

type Phase = "proposing" | "reviewing" | "empty" | "committing" | "done" | "error";

export function ScheduleMyDay({ onPlanCommitted }: { onPlanCommitted?: () => void }) {
  const timezone = useTimezone();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("proposing");
  const [rows, setRows] = useState<Row[]>([]);
  const [emptyMessage, setEmptyMessage] = useState("");
  const [committedCount, setCommittedCount] = useState(0);

  const accepted = rows.filter((r) => r.state === "accepted");

  const propose = async () => {
    setOpen(true);
    setPhase("proposing");
    setRows([]);
    try {
      const res = await fetch("/api/plan/propose", { method: "POST" });
      const data: PlanProposalResult & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not build a plan");

      if (data.blocks.length === 0) {
        setEmptyMessage(data.message);
        setPhase("empty");
        return;
      }

      // Everything starts accepted: the common case is "this looks right",
      // so reviewing means removing what's wrong rather than approving N times.
      setRows(data.blocks.map((b) => ({ ...b, state: "accepted", retrying: false })));
      setPhase("reviewing");
    } catch (err) {
      setEmptyMessage(err instanceof Error ? err.message : "Something went wrong.");
      setPhase("error");
    }
  };

  const toggleRow = (taskId: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.taskId === taskId
          ? { ...r, state: r.state === "accepted" ? "rejected" : "accepted" }
          : r
      )
    );
  };

  /** Re-propose one row, leaving every other decision untouched. */
  const retryRow = async (taskId: string) => {
    setRows((prev) =>
      prev.map((r) => (r.taskId === taskId ? { ...r, retrying: true } : r))
    );

    // Slots the user is still holding in this session aren't in the database
    // yet, so send them along or the retry may propose one of them back.
    const takenSlots = rows
      .filter((r) => r.taskId !== taskId && r.state === "accepted")
      .map((r) => ({ startTime: r.startTime, endTime: r.endTime }));

    try {
      const res = await fetch("/api/plan/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, takenSlots }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not find another time");

      if (!data.block) {
        toast.info(data.message ?? "No other opening today that fits this one.");
        setRows((prev) =>
          prev.map((r) => (r.taskId === taskId ? { ...r, retrying: false } : r))
        );
        return;
      }

      setRows((prev) =>
        prev.map((r) =>
          r.taskId === taskId
            ? { ...(data.block as PlanProposal), state: "accepted", retrying: false }
            : r
        )
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Retry failed");
      setRows((prev) =>
        prev.map((r) => (r.taskId === taskId ? { ...r, retrying: false } : r))
      );
    }
  };

  const commit = async () => {
    setPhase("committing");
    try {
      const res = await fetch("/api/plan/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blocks: accepted.map((r) => ({
            taskId: r.taskId,
            startTime: r.startTime,
            minutes: r.minutes,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save your plan");

      setCommittedCount(data.committed);
      setPhase("done");
      onPlanCommitted?.();
    } catch (err) {
      setEmptyMessage(err instanceof Error ? err.message : "Something went wrong.");
      setPhase("error");
    }
  };

  const timeLabel = (iso: string) =>
    formatForDisplay(new Date(iso), timezone, DISPLAY_TIME);

  return (
    <>
      <Button size="sm" variant="outline" onClick={propose} className="gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        Plan my day
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {(phase === "proposing" || phase === "committing") && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {phase === "done" && <Check className="h-4 w-4 text-success" />}
              {(phase === "empty" || phase === "error") && (
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
              )}
              {phase === "proposing" && "Finding times…"}
              {phase === "reviewing" && "Here's a plan for today"}
              {phase === "committing" && "Saving…"}
              {phase === "done" &&
                `${committedCount} block${committedCount === 1 ? "" : "s"} planned`}
              {phase === "empty" && "Nothing to plan"}
              {phase === "error" && "That didn't work"}
            </DialogTitle>
            <DialogDescription>
              {phase === "proposing" && "Looking at what's open between now and bedtime."}
              {phase === "reviewing" &&
                "Nothing is saved yet. Drop anything that doesn't fit, or ask for a different time."}
              {phase === "committing" && "Adding these to today."}
              {phase === "done" &&
                "These show on your calendar as planned time — separate from real events, and they clear themselves overnight."}
              {(phase === "empty" || phase === "error") && emptyMessage}
            </DialogDescription>
          </DialogHeader>

          {phase === "reviewing" && (
            <>
              <div className="max-h-[45vh] space-y-1.5 overflow-y-auto pr-1">
                {rows.map((row) => {
                  const isRejected = row.state === "rejected";
                  return (
                    <div
                      key={row.taskId}
                      className={cn(
                        "flex items-start gap-3 rounded-md border border-transparent bg-muted/50 px-3 py-2 transition-opacity",
                        isRejected && "opacity-45"
                      )}
                    >
                      <span
                        className={cn(
                          "w-20 shrink-0 pt-0.5 text-xs font-medium tabular-nums text-muted-foreground",
                          isRejected && "line-through"
                        )}
                      >
                        {timeLabel(row.startTime)}
                      </span>

                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p
                          className={cn(
                            "truncate text-sm",
                            isRejected && "line-through"
                          )}
                        >
                          {row.taskTitle}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {row.minutes} min
                          {row.reasoning ? ` · ${row.reasoning}` : ""}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-0.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => retryRow(row.taskId)}
                          disabled={row.retrying || isRejected}
                          aria-label={`Find a different time for ${row.taskTitle}`}
                          title="Different time"
                        >
                          {row.retrying ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => toggleRow(row.taskId)}
                          aria-label={
                            isRejected
                              ? `Put ${row.taskTitle} back in the plan`
                              : `Remove ${row.taskTitle} from the plan`
                          }
                          title={isRejected ? "Put back" : "Remove"}
                        >
                          {isRejected ? (
                            <Undo2 className="h-3.5 w-3.5" />
                          ) : (
                            <X className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {accepted.length} of {rows.length} kept
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={commit} disabled={accepted.length === 0}>
                    {accepted.length === 0
                      ? "Nothing selected"
                      : `Add ${accepted.length} to today`}
                  </Button>
                </div>
              </div>
            </>
          )}

          {phase === "done" && (
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Done
              </Button>
              <Button asChild size="sm">
                <Link href="/calendar" onClick={() => setOpen(false)}>
                  View calendar
                  <ArrowRight className="ml-2 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          )}

          {phase === "error" && (
            <div className="flex justify-end">
              <Button size="sm" onClick={propose}>
                Try again
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
