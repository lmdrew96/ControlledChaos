"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

type Phase = "idle" | "scheduling" | "done" | "empty" | "error";

export function ScheduleMyDay() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<ScheduleResult | null>(null);

  const handleSchedule = async () => {
    setPhase("scheduling");
    try {
      const res = await fetch("/api/calendar/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) throw new Error();
      const data: ScheduleResult = await res.json();

      if (data.eventsCreated === 0) {
        setPhase("empty");
        setResult(data);
      } else {
        setResult(data);
        setPhase("done");
      }
    } catch {
      setPhase("error");
    }
  };

  const handleReset = () => {
    setPhase("idle");
    setResult(null);
  };

  return (
    <Card className="group relative overflow-hidden border-border/40 bg-card/80 transition-colors hover:border-primary/30">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.04] to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      <CardContent className="relative flex h-full flex-col justify-between gap-4 p-5">
        {phase === "idle" && (
          <>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold leading-snug">Schedule My Day</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  AI fills your free time with the right tasks.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              className="w-full"
              onClick={handleSchedule}
            >
              Plan it
              <CalendarDays className="ml-2 h-3.5 w-3.5" />
            </Button>
          </>
        )}

        {phase === "scheduling" && (
          <div className="flex flex-col items-center justify-center gap-3 py-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Finding the best times for your tasks...
            </p>
          </div>
        )}

        {phase === "done" && result && (
          <>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success/10">
                <Check className="h-5 w-5 text-success" />
              </div>
              <div>
                <h2 className="font-semibold leading-snug">
                  {result.eventsCreated} task{result.eventsCreated !== 1 ? "s" : ""} scheduled
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {result.message}
                </p>
              </div>
            </div>

            {/* Quick preview of scheduled blocks */}
            <div className="space-y-1.5">
              {result.blocks.slice(0, 4).map((block, i) => {
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
                    <span className="font-medium text-muted-foreground tabular-nums w-16 shrink-0">
                      {timeStr}
                    </span>
                    <span className="truncate">{block.taskTitle}</span>
                  </div>
                );
              })}
              {result.blocks.length > 4 && (
                <p className="text-xs text-muted-foreground pl-3">
                  +{result.blocks.length - 4} more
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <Button asChild size="sm" className="flex-1">
                <Link href="/calendar">
                  View calendar
                  <ArrowRight className="ml-2 h-3.5 w-3.5" />
                </Link>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleReset}
                className="text-muted-foreground"
              >
                Done
              </Button>
            </div>
          </>
        )}

        {phase === "empty" && (
          <>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                <CalendarDays className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <h2 className="font-semibold leading-snug">Nothing to schedule</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {result?.message || "No pending tasks or free time blocks available."}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={handleReset}
            >
              Got it
            </Button>
          </>
        )}

        {phase === "error" && (
          <>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10">
                <CalendarDays className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <h2 className="font-semibold leading-snug">Scheduling failed</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Something went wrong. Try again in a moment.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={handleReset}
            >
              Try again
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
