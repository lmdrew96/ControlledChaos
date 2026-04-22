"use client";

import { useState, useEffect } from "react";
import { Clock, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatForDisplay, DISPLAY_DATETIME } from "@/lib/timezone";

const STORAGE_PREFIX = "cc-crisis-horizon-dismissed:";

interface CrisisHorizonAlertProps {
  detectionId?: string;
  involvedTaskNames?: string[];
  firstDeadline?: string;
  availableMinutes?: number;
  requiredMinutes?: number;
  timezone: string;
  onBuildPlan: (suggestedTaskName: string, suggestedDeadline?: string) => void;
}

function dismissalKey(
  detectionId: string | undefined,
  involvedTaskNames: string[] | undefined,
  firstDeadline: string | undefined
): string {
  if (detectionId) return `${STORAGE_PREFIX}${detectionId}`;
  const names = (involvedTaskNames ?? []).join("|");
  return `${STORAGE_PREFIX}${names}@${firstDeadline ?? ""}`;
}

function formatHours(minutes: number | undefined): string | null {
  if (minutes === undefined || minutes < 0) return null;
  const hours = minutes / 60;
  if (hours < 1) return `${Math.max(1, Math.round(minutes))}m`;
  return `${Math.round(hours * 10) / 10}h`;
}

export function CrisisHorizonAlert({
  detectionId,
  involvedTaskNames,
  firstDeadline,
  availableMinutes,
  requiredMinutes,
  timezone,
  onBuildPlan,
}: CrisisHorizonAlertProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = dismissalKey(detectionId, involvedTaskNames, firstDeadline);
    setVisible(!localStorage.getItem(key));
  }, [detectionId, involvedTaskNames, firstDeadline]);

  const dismiss = () => {
    if (typeof window !== "undefined") {
      const key = dismissalKey(detectionId, involvedTaskNames, firstDeadline);
      localStorage.setItem(key, "1");
    }
    setVisible(false);
  };

  const tasks = involvedTaskNames ?? [];
  const firstTask = tasks[0] ?? "";
  const taskPhrase =
    tasks.length === 0
      ? "Some deadlines are tighter than your available time."
      : tasks.length === 1
      ? `${tasks[0]} is landing in a tight window.`
      : tasks.length === 2
      ? `${tasks[0]} and ${tasks[1]} are landing in a tight window.`
      : `${tasks[0]}, ${tasks[1]}, and ${tasks.length - 2} more are landing in a tight window.`;

  const required = formatHours(requiredMinutes);
  const available = formatHours(availableMinutes);
  const deadlineLabel = firstDeadline
    ? formatForDisplay(new Date(firstDeadline), timezone, DISPLAY_DATETIME)
    : null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
        >
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <Clock className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
                  <div className="space-y-1 min-w-0">
                    <p className="text-sm font-medium">Heads up — this one&apos;s on the horizon</p>
                    <p className="text-sm text-muted-foreground">{taskPhrase}</p>
                    {(required || available || deadlineLabel) && (
                      <p className="text-xs text-muted-foreground/90">
                        {required && available && (
                          <>~{required} of work, ~{available} of real time</>
                        )}
                        {required && available && deadlineLabel && " · "}
                        {deadlineLabel && <>first due {deadlineLabel}</>}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      No plan exists for this yet. You can build one if you want — no pressure.
                    </p>
                  </div>
                </div>
                <button
                  onClick={dismiss}
                  className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  aria-label="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={() => onBuildPlan(firstTask, firstDeadline)}>
                  Build a plan
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={dismiss}
                >
                  Not now
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
