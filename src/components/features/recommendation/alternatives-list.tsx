"use client";

import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { priorityConfig } from "@/components/features/task-feed/task-config";
import type { Task } from "@/types";

interface Alternative {
  taskId: string;
  reasoning: string;
  task: Task | null;
}

export function AlternativesList({
  alternatives,
  onSelect,
}: {
  alternatives: Alternative[];
  onSelect: (taskId: string) => void;
}) {
  if (alternatives.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        Or try one of these:
      </p>
      {alternatives.map((alt) => {
        if (!alt.task) return null;
        const priority =
          priorityConfig[alt.task.priority as keyof typeof priorityConfig] ??
          priorityConfig.normal;

        return (
          <Card
            key={alt.taskId}
            className="cursor-pointer p-3 transition-colors hover:bg-accent/30"
            onClick={() => onSelect(alt.taskId)}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{alt.task.title}</p>
                <p className="text-xs text-muted-foreground">
                  {alt.reasoning}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="outline" className={priority.className}>
                  {priority.label}
                </Badge>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
