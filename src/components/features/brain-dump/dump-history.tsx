"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { formatForDisplay, DISPLAY_DATE } from "@/lib/timezone";
import { useTimezone } from "@/hooks/use-timezone";
import {
  Type,
  Mic,
  Camera,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Calendar,
  BookOpen,
  Brain,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

type FilterMode = "all" | "braindump" | "junk_journal";

interface DumpSummary {
  id: string;
  inputType: string;
  category: string;
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

function timeAgo(dateStr: string, timezone: string): string {
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
  return formatForDisplay(new Date(dateStr), timezone, DISPLAY_DATE);
}

export function DumpHistory() {
  const timezone = useTimezone();
  const [dumps, setDumps] = useState<DumpSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>("all");

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

  const filteredDumps = useMemo(() => {
    if (filter === "all") return dumps;
    return dumps.filter((d) => d.category === filter);
  }, [dumps, filter]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-lg" />
      </div>
    );
  }

  if (loadError) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        Couldn&apos;t load recent dumps.
      </p>
    );
  }

  const hasDumps = dumps.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Recent
        </h2>
        {hasDumps && <FilterPills filter={filter} onChange={setFilter} />}
      </div>

      {filteredDumps.length === 0 ? (
        <EmptyState filter={filter} hasAny={hasDumps} />
      ) : (
      <div className="space-y-2">
        {filteredDumps.map((dump) => {
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
                      {dump.summary || (dump.category === "junk_journal" ? "Junk journal entry" : "Brain dump")}
                    </p>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                      {dump.category === "junk_journal" && (
                        <span className="flex items-center gap-1 text-amber-500">
                          <BookOpen className="h-3 w-3" />
                          journal
                        </span>
                      )}
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
                      <span>{timeAgo(dump.createdAt, timezone)}</span>
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
      )}

      {filter === "junk_journal" && filteredDumps.length > 0 && (
        <div className="pt-1 text-center">
          <Link
            href="/journal"
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            See all journal entries →
          </Link>
        </div>
      )}
    </div>
  );
}

interface FilterPillsProps {
  filter: FilterMode;
  onChange: (mode: FilterMode) => void;
}

function FilterPills({ filter, onChange }: FilterPillsProps) {
  const options: Array<{ mode: FilterMode; label: string; Icon: typeof Filter }> = [
    { mode: "all", label: "All", Icon: Filter },
    { mode: "braindump", label: "Dumps", Icon: Brain },
    { mode: "junk_journal", label: "Journal", Icon: BookOpen },
  ];
  return (
    <div className="flex items-center gap-1">
      {options.map(({ mode, label, Icon }) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          aria-pressed={filter === mode}
          className={cn(
            "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
            filter === mode
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          <Icon className="h-3 w-3" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}

interface EmptyStateProps {
  filter: FilterMode;
  /** True when the user has at least one dump of any category. */
  hasAny: boolean;
}

function EmptyState({ filter, hasAny }: EmptyStateProps) {
  if (!hasAny) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
        <p className="text-sm font-medium text-muted-foreground">
          Nothing captured yet
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Brain dumps and journal entries will show up here after you submit one.
        </p>
      </div>
    );
  }
  const label =
    filter === "junk_journal" ? "journal entries" : "brain dumps";
  return (
    <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center">
      <p className="text-sm text-muted-foreground">
        No {label} in the last 30 entries.
      </p>
    </div>
  );
}
