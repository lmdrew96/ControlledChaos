"use client";

import { useState } from "react";
import {
  Check,
  Trash2,
  Clock,
  Zap,
  MapPin,
  Calendar,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  energyLevel: string;
  estimatedMinutes: number | null;
  category: string | null;
  locationTag: string | null;
  deadline: string | null;
  completedAt: string | null;
}

const priorityConfig = {
  urgent: { label: "Urgent", className: "bg-red-500/15 text-red-400 border-red-500/30" },
  important: { label: "Important", className: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  normal: { label: "Normal", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  someday: { label: "Someday", className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
} as const;

const energyConfig = {
  low: { label: "Low energy", icon: "⚡" },
  medium: { label: "Medium energy", icon: "⚡⚡" },
  high: { label: "High energy", icon: "⚡⚡⚡" },
} as const;

export function TaskCard({
  task,
  onUpdate,
}: {
  task: Task;
  onUpdate: () => void;
}) {
  const [isUpdating, setIsUpdating] = useState(false);
  const isCompleted = task.status === "completed";
  const priority = priorityConfig[task.priority as keyof typeof priorityConfig] ?? priorityConfig.normal;
  const energy = energyConfig[task.energyLevel as keyof typeof energyConfig] ?? energyConfig.medium;

  async function handleAction(action: "complete" | "undo" | "delete") {
    setIsUpdating(true);
    try {
      if (action === "delete") {
        await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      } else {
        const status = action === "complete" ? "completed" : "pending";
        await fetch(`/api/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
      }
      onUpdate();
    } catch (error) {
      console.error("Task action failed:", error);
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <Card
      className={cn(
        "group relative p-4 transition-colors",
        isCompleted && "opacity-60"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Complete/undo button */}
        <button
          onClick={() => handleAction(isCompleted ? "undo" : "complete")}
          disabled={isUpdating}
          className={cn(
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
            isCompleted
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/30 hover:border-primary"
          )}
        >
          {isUpdating ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : isCompleted ? (
            <Check className="h-3 w-3" />
          ) : null}
        </button>

        {/* Task content */}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h3
              className={cn(
                "font-medium leading-snug",
                isCompleted && "line-through"
              )}
            >
              {task.title}
            </h3>

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
              onClick={() => handleAction("delete")}
              disabled={isUpdating}
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </div>

          {task.description && (
            <p className="text-sm text-muted-foreground">{task.description}</p>
          )}

          {/* Metadata row */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={priority.className}>
              {priority.label}
            </Badge>

            <span className="text-xs text-muted-foreground" title={energy.label}>
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
        </div>
      </div>
    </Card>
  );
}
