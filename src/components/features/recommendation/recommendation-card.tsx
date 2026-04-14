"use client";

import { useState } from "react";
import {
  Check,
  Clock,
  Pause,
  Shuffle,
  MapPin,
  Calendar,
  Loader2,
  Scissors,
} from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/ui/logo";
import { formatForDisplay, DISPLAY_DATE } from "@/lib/timezone";
import { useTimezone } from "@/hooks/use-timezone";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  priorityConfig,
  energyConfig,
} from "@/components/features/task-feed/task-config";
import { AlternativesList } from "./alternatives-list";
import type { Task } from "@/types";

interface Alternative {
  taskId: string;
  reasoning: string;
  task: Task | null;
}

export function RecommendationCard({
  task,
  reasoning,
  alternatives,
  onAccept,
  onSnooze,
  onReject,
  onSelectAlternative,
  isRefreshing,
}: {
  task: Task;
  reasoning: string;
  alternatives: Alternative[];
  onAccept: (taskId: string) => void;
  onSnooze: (taskId: string) => void;
  onReject: (taskId: string) => void;
  onSelectAlternative: (taskId: string) => void;
  isRefreshing: boolean;
}) {
  const timezone = useTimezone();
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [isBreakingDown, setIsBreakingDown] = useState(false);

  async function handleBreakdown() {
    setIsBreakingDown(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/breakdown`, { method: "POST" });
      if (!res.ok) throw new Error("Breakdown failed");
      const data = await res.json();
      toast.success(`Broken into ${data.subtasks.length} subtasks`);
      onAccept(task.id); // refresh the view
    } catch {
      toast.error("Couldn't break this down. Try again.");
    } finally {
      setIsBreakingDown(false);
    }
  }

  const priority =
    priorityConfig[task.priority as keyof typeof priorityConfig] ??
    priorityConfig.normal;
  const energy =
    energyConfig[task.energyLevel as keyof typeof energyConfig] ??
    energyConfig.medium;

  return (
    <div className="space-y-3">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="space-y-4 p-6">
          {/* Header */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Logo className="h-4 w-4" />
            <span className="font-medium">Do this next</span>
          </div>

          {/* Task title */}
          <h3 className="text-lg font-semibold leading-snug">{task.title}</h3>

          {/* AI reasoning */}
          <p className="text-sm text-muted-foreground">{reasoning}</p>

          {/* Metadata badges */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={priority.className}>
              {priority.label}
            </Badge>

            <span
              className="text-xs text-muted-foreground"
              title={energy.label}
            >
              {energy.icon}
            </span>

            {task.estimatedMinutes && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {task.estimatedMinutes}m
              </span>
            )}

            {task.category && (
              <Badge variant="secondary" className="text-xs">
                {task.category}
              </Badge>
            )}

            {task.locationTags && task.locationTags.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" />
                {task.locationTags.join(", ")}
              </span>
            )}

            {task.deadline && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {formatForDisplay(new Date(task.deadline), timezone, DISPLAY_DATE)}
              </span>
            )}
          </div>

          {/* Break it down — shown for tasks estimated at 30+ minutes */}
          {task.estimatedMinutes && task.estimatedMinutes >= 30 && (
            <button
              onClick={handleBreakdown}
              disabled={isBreakingDown || isRefreshing}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
            >
              {isBreakingDown ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Scissors className="h-3 w-3" />
              )}
              {isBreakingDown ? "Breaking down..." : "Break it down"}
            </button>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              onClick={() => onAccept(task.id)}
              disabled={isRefreshing}
              size="sm"
            >
              {isRefreshing ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="mr-1.5 h-3.5 w-3.5" />
              )}
              Done
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSnooze(task.id)}
              disabled={isRefreshing}
            >
              <Pause className="mr-1.5 h-3.5 w-3.5" />
              Not Now
            </Button>
            {alternatives.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (showAlternatives) {
                    setShowAlternatives(false);
                  } else {
                    onReject(task.id);
                    setShowAlternatives(true);
                  }
                }}
                disabled={isRefreshing}
              >
                <Shuffle className="mr-1.5 h-3.5 w-3.5" />
                Something Else
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Alternatives */}
      {showAlternatives && (
        <AlternativesList
          alternatives={alternatives}
          onSelect={onSelectAlternative}
        />
      )}
    </div>
  );
}
