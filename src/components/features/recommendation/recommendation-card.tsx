"use client";

import { useState } from "react";
import {
  Play,
  Clock,
  Pause,
  Shuffle,
  MapPin,
  Calendar,
  Sparkles,
  Loader2,
} from "lucide-react";
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
  const [showAlternatives, setShowAlternatives] = useState(false);

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
            <Sparkles className="h-4 w-4 text-primary" />
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

            {task.locationTag && task.locationTag !== "anywhere" && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" />
                {task.locationTag}
              </span>
            )}

            {task.deadline && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {new Date(task.deadline).toLocaleDateString()}
              </span>
            )}
          </div>

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
                <Play className="mr-1.5 h-3.5 w-3.5" />
              )}
              Start
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
