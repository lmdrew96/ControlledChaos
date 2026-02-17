"use client";

import { useState, useEffect } from "react";
import {
  Type,
  Mic,
  Camera,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DumpSummary {
  id: string;
  inputType: string;
  rawContent: string | null;
  summary: string | null;
  taskCount: number;
  eventCount: number;
  createdAt: string;
}

const inputTypeIcon = {
  text: Type,
  voice: Mic,
  photo: Camera,
} as const;

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function DumpHistory() {
  const [dumps, setDumps] = useState<DumpSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dump/history")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        if (data?.dumps) setDumps(data.dumps);
      })
      .catch(() => setLoadError(true))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading || loadError) return null;
  if (dumps.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">
        Recent Dumps
      </h2>

      <div className="space-y-2">
        {dumps.map((dump) => {
          const Icon =
            inputTypeIcon[dump.inputType as keyof typeof inputTypeIcon] ?? Type;
          const isExpanded = expandedId === dump.id;

          return (
            <button
              key={dump.id}
              onClick={() => setExpandedId(isExpanded ? null : dump.id)}
              className="w-full rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent/50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm">
                      {dump.summary || "Brain dump"}
                    </p>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                      {dump.taskCount > 0 && (
                        <span className="flex items-center gap-1">
                          <CheckSquare className="h-3 w-3" />
                          {dump.taskCount} task{dump.taskCount !== 1 ? "s" : ""}
                        </span>
                      )}
                      {dump.eventCount > 0 && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {dump.eventCount} event{dump.eventCount !== 1 ? "s" : ""}
                        </span>
                      )}
                      <span>{timeAgo(dump.createdAt)}</span>
                    </div>
                  </div>
                </div>
                {dump.rawContent && (
                  <div className="shrink-0 text-muted-foreground">
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                )}
              </div>

              {isExpanded && dump.rawContent && (
                <div className="mt-3 rounded-md bg-muted/50 p-3">
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                    {dump.rawContent.length > 500
                      ? `${dump.rawContent.slice(0, 500)}...`
                      : dump.rawContent}
                  </p>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
