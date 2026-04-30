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
import { CalendarDays, Loader2, Check, ArrowRight, Sparkles } from "lucide-react";

interface ScheduleResult {
  blocks: Array<{
    taskId: string;
    taskTitle: string;
    startTime: string;
    endTime: string;
    reasoning: string;
  }>;
  eventsCreated: number;
  message: string;
}

type Phase = "scheduling" | "done" | "empty" | "error";

export function ScheduleMyDay() {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("scheduling");
  const [result, setResult] = useState<ScheduleResult | null>(null);

  const start = async () => {
    setOpen(true);
    setPhase("scheduling");
    setResult(null);
    try {
      const res = await fetch("/api/calendar/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error();
      const data: ScheduleResult = await res.json();
      setResult(data);
      setPhase(data.eventsCreated === 0 ? "empty" : "done");
    } catch {
      setPhase("error");
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={start} className="gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        Plan my day
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {phase === "scheduling" && <Loader2 className="h-4 w-4 animate-spin" />}
              {phase === "done" && <Check className="h-4 w-4 text-success" />}
              {phase === "empty" && <CalendarDays className="h-4 w-4 text-muted-foreground" />}
              {phase === "error" && <CalendarDays className="h-4 w-4 text-destructive" />}
              {phase === "scheduling" && "Planning your day…"}
              {phase === "done" &&
                `${result?.eventsCreated ?? 0} task${
                  result?.eventsCreated === 1 ? "" : "s"
                } scheduled`}
              {phase === "empty" && "Nothing to schedule"}
              {phase === "error" && "Scheduling failed"}
            </DialogTitle>
            <DialogDescription>
              {phase === "scheduling" && "Finding the best times for your tasks…"}
              {phase === "done" && (result?.message ?? "Tasks have been added to your calendar.")}
              {phase === "empty" &&
                (result?.message ?? "No pending tasks or free time blocks available.")}
              {phase === "error" && "Something went wrong. Try again in a moment."}
            </DialogDescription>
          </DialogHeader>

          {phase === "done" && result && (
            <>
              <div className="space-y-1.5">
                {result.blocks.slice(0, 6).map((block, i) => {
                  const start = new Date(block.startTime);
                  const timeStr = start.toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  });
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-1.5 text-xs"
                    >
                      <span className="w-16 shrink-0 font-medium tabular-nums text-muted-foreground">
                        {timeStr}
                      </span>
                      <span className="truncate">{block.taskTitle}</span>
                    </div>
                  );
                })}
                {result.blocks.length > 6 && (
                  <p className="pl-3 text-xs text-muted-foreground">
                    +{result.blocks.length - 6} more
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button asChild size="sm">
                  <Link href="/calendar" onClick={() => setOpen(false)}>
                    View calendar
                    <ArrowRight className="ml-2 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </>
          )}

          {phase === "error" && (
            <div className="flex justify-end">
              <Button size="sm" onClick={start}>
                Try again
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
